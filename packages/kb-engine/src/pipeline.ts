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

    // 2. KB 벡터 검색
    const kbResults = await searchKnowledgeBase(config.db, embedding);

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
      const aiAnswer = await generateAnswer(
        question,
        kbResults,
        config.openaiApiKey,
      );
      const topResult = kbResults.length > 0 ? kbResults[0] : null;
      const imageResult = kbResults.find((r) => r.imageUrl);
      return {
        answer: aiAnswer,
        source: "ai_generated",
        matchedKbId: null,
        similarityScore: topResult ? topResult.similarity : null,
        imageUrl: imageResult?.imageUrl ?? null,
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

const FALLBACK_MESSAGE =
  "죄송합니다, 현재 답변을 생성하지 못했습니다. 상담사에게 문의해주세요.";
