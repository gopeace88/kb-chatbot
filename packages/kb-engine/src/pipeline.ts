import type { Database } from "@kb-chatbot/database";
import type { ResponseSource } from "@kb-chatbot/shared";
import { VECTOR_SEARCH, KAKAO_LIMITS } from "@kb-chatbot/shared";
import { generateEmbedding } from "./embedding.js";
import { searchKnowledgeBase, type SearchResult } from "./search.js";
import { generateAnswer } from "./answer.js";

export interface AnswerPipelineResult {
  answer: string;
  source: ResponseSource;
  matchedKbId: string | null;
  similarityScore: number | null;
  imageUrl: string | null;
  kbResults: SearchResult[];
}

interface PipelineConfig {
  db: Database;
  openaiApiKey: string;
  /** 전체 파이프라인 타임아웃 (ms). 기본값: 4500 (카카오 5초 제한 대응) */
  timeoutMs?: number;
}

/**
 * 질문 → 임베딩 → KB 검색 → 답변 생성 전체 파이프라인
 *
 * 1. 질문을 임베딩으로 변환
 * 2. KB에서 유사 Q&A 검색
 * 3. 매칭 있으면 KB 답변 반환 (kb_match)
 * 4. 매칭 없으면 AI 답변 생성 시도 (ai_generated)
 * 5. 실패 시 폴백 메시지 반환 (fallback)
 */
export async function answerPipeline(
  question: string,
  config: PipelineConfig,
): Promise<AnswerPipelineResult> {
  const timeoutMs = config.timeoutMs ?? KAKAO_LIMITS.SKILL_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1. 임베딩 생성
    const embedding = await generateEmbedding(question, config.openaiApiKey);

    // 2. KB 벡터 검색 (결과 없으면 임계값 없이 재검색)
    let kbResults = await searchKnowledgeBase(config.db, embedding);
    if (kbResults.length === 0) {
      kbResults = await searchKnowledgeBase(config.db, embedding, {
        threshold: 0,
        maxResults: 5,
      });
    }

    // 3. 고유사도 매칭 → KB 답변 직접 반환
    if (
      kbResults.length > 0 &&
      kbResults[0].similarity >= VECTOR_SEARCH.SIMILARITY_THRESHOLD
    ) {
      return {
        answer: kbResults[0].answer,
        source: "kb_match",
        matchedKbId: kbResults[0].id,
        similarityScore: kbResults[0].similarity,
        imageUrl: kbResults[0].imageUrl,
        kbResults,
      };
    }

    // 4. AI 답변 생성 (낮은 유사도 결과를 컨텍스트로 활용)
    if (!controller.signal.aborted) {
      const { answer: aiAnswer, ref } = await generateAnswer(
        question,
        kbResults,
        config.openaiApiKey,
      );
      const topResult = kbResults.length > 0 ? kbResults[0] : null;

      // 이미지 선택: AI ref → 3-gram 텍스트 매칭 폴백
      const imageUrl = selectImageForAnswer(aiAnswer, ref, kbResults);

      return {
        answer: aiAnswer,
        source: "ai_generated",
        matchedKbId: null,
        similarityScore: topResult ? topResult.similarity : null,
        imageUrl,
        kbResults,
      };
    }

    throw new Error("Timeout");
  } catch (error) {
    // 5. 폴백
    return {
      answer: FALLBACK_MESSAGE,
      source: "fallback",
      matchedKbId: null,
      similarityScore: null,
      imageUrl: null,
      kbResults: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * AI 답변에 표시할 이미지를 선택한다.
 *
 * 우선순위:
 * 1. AI ref — AI가 참고했다고 지정한 KB 항목 (테스트에서 정확도 확인됨)
 * 2. 3-gram 텍스트 매칭 폴백 — ref에 이미지 없을 때 답변 텍스트 겹침 기반
 */
function selectImageForAnswer(
  aiAnswer: string,
  ref: number,
  kbResults: SearchResult[],
): string | null {
  // 1. AI ref 기반 (confirmed: ref가 정확한 KB 항목을 가리킴)
  if (ref > 0 && ref <= kbResults.length) {
    const refImage = kbResults[ref - 1].imageUrl;
    if (refImage) return refImage;
  }

  // 2. 3-gram 텍스트 매칭 폴백
  return findImageByTextOverlap(aiAnswer, kbResults);
}

/**
 * AI 답변과 각 KB 답변의 3-gram 텍스트 겹침을 비교하여
 * 가장 유사한 KB 항목의 이미지를 반환한다.
 */
function findImageByTextOverlap(
  aiAnswer: string,
  kbResults: SearchResult[],
): string | null {
  const strip = (s: string) => s.replace(/\s+/g, "");
  const aiText = strip(aiAnswer);

  let bestImage: string | null = null;
  let bestScore = 0;

  for (const r of kbResults) {
    if (!r.imageUrl) continue;
    const kbText = strip(r.answer);
    if (kbText.length < 3) continue;

    let matches = 0;
    for (let i = 0; i <= kbText.length - 3; i++) {
      if (aiText.includes(kbText.slice(i, i + 3))) matches++;
    }
    const score = matches / (kbText.length - 2);

    if (score > bestScore) {
      bestScore = score;
      bestImage = r.imageUrl;
    }
  }

  return bestScore > 0.3 ? bestImage : null;
}

const FALLBACK_MESSAGE =
  "해당 문의에 대한 답변을 바로 드리기 어렵습니다. 상담원이 확인 후 톡으로 답변드리겠습니다.";
