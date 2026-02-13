/**
 * Claude AI via claude-max-api-proxy (OpenAI-compatible, localhost:3456)
 * Uses Claude Max subscription through local proxy — no API credits needed.
 */

const PROXY_URL = process.env.CLAUDE_PROXY_URL || "http://127.0.0.1:3456";
const MODEL = "claude-sonnet-4";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

async function chatCompletion(messages: ChatMessage[], maxTokens = 2000): Promise<string> {
  const res = await fetch(`${PROXY_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude proxy error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content || "";
}

/** Generate Q&A pairs from a text chunk */
export async function generateQAPairs(
  chunk: string,
  options?: { startPage?: number },
): Promise<Array<{ question: string; answer: string; category: string; pageNumber?: number }>> {
  const text = await chatCompletion([
    {
      role: "user",
      content: `아래 내용을 분석하여 고객 FAQ Q&A 쌍을 만들어줘.
각 Q&A는 고객이 실제로 물어볼 법한 질문과 친절한 답변으로 구성해.
카테고리는: 배송, 교환/반품, 사용법, AS/수리, 결제, 기타 중 하나.
${options?.startPage ? `이 내용은 약 ${options.startPage}페이지부터 시작합니다. 각 Q&A가 몇 페이지의 내용인지 pageNumber 필드도 포함해줘.` : ""}

JSON 배열로 응답해:
[{"question": "...", "answer": "...", "category": "..."${options?.startPage ? ', "pageNumber": 3' : ""}}]

내용:
${chunk}`,
    },
  ]);

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error("Q&A JSON 파싱 실패, 건너뜀");
    return [];
  }
}

/** Analyze an image using Claude Vision (via proxy with base64 image_url) */
export async function analyzeImage(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp",
  _apiKey?: string,
): Promise<string> {
  return chatCompletion([
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: `data:${mediaType};base64,${base64}` },
        },
        {
          type: "text",
          text: "이 제품 이미지/설명서를 분석해서 고객 FAQ에 쓸 수 있는 정보를 상세히 추출해줘. 제품 특징, 사용법, 주의사항 등을 포함해.",
        },
      ],
    },
  ]);
}

/** Improve an existing KB answer */
export async function improveAnswer(
  question: string,
  currentAnswer: string,
  contextQAs: Array<{ question: string; answer: string }>,
  _apiKey?: string,
): Promise<{ answer: string; explanation: string }> {
  const contextText = contextQAs
    .map((qa, i) => `${i + 1}. Q: ${qa.question}\n   A: ${qa.answer}`)
    .join("\n");

  const text = await chatCompletion([
    {
      role: "user",
      content: `이 Q&A의 답변을 개선해줘. 같은 카테고리의 다른 Q&A와 일관성을 맞추고, 누락된 정보를 보완해.

현재 Q&A:
Q: ${question}
A: ${currentAnswer}

같은 카테고리의 다른 Q&A:
${contextText || "(없음)"}

JSON으로 응답해: {"answer": "개선된 답변", "explanation": "변경 이유"}`,
    },
  ], 1000);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { answer: currentAnswer, explanation: "파싱 실패" };
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { answer: currentAnswer, explanation: "JSON 파싱 실패" };
  }
}

/** Suggest merging two duplicate KB items */
export async function suggestMerge(
  item1: { question: string; answer: string },
  item2: { question: string; answer: string },
  _apiKey?: string,
): Promise<{ question: string; answer: string; explanation: string }> {
  const text = await chatCompletion([
    {
      role: "user",
      content: `아래 두 Q&A가 중복입니다. 하나로 병합해줘.

Q&A 1:
Q: ${item1.question}
A: ${item1.answer}

Q&A 2:
Q: ${item2.question}
A: ${item2.answer}

JSON으로 응답해: {"question": "병합된 질문", "answer": "병합된 답변", "explanation": "병합 이유"}`,
    },
  ], 1000);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse merge suggestion");
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("병합 제안 JSON 파싱 실패");
  }
}
