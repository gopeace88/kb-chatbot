import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(apiKey: string): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

const MODEL = "claude-sonnet-4-5-20250929";

/** Generate Q&A pairs from a text chunk */
export async function generateQAPairs(
  chunk: string,
  apiKey: string,
): Promise<Array<{ question: string; answer: string; category: string }>> {
  const client = getClient(apiKey);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `아래 내용을 분석하여 고객 FAQ Q&A 쌍을 만들어줘.
각 Q&A는 고객이 실제로 물어볼 법한 질문과 친절한 답변으로 구성해.
카테고리는: 배송, 교환/반품, 사용법, AS/수리, 결제, 기타 중 하나.

JSON 배열로 응답해:
[{"question": "...", "answer": "...", "category": "..."}]

내용:
${chunk}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error("Q&A JSON 파싱 실패, 건너뜀");
    return [];
  }
}

/** Analyze an image using Claude Vision */
export async function analyzeImage(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp",
  apiKey: string,
): Promise<string> {
  const client = getClient(apiKey);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: "이 제품 이미지/설명서를 분석해서 고객 FAQ에 쓸 수 있는 정보를 상세히 추출해줘. 제품 특징, 사용법, 주의사항 등을 포함해.",
          },
        ],
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

/** Improve an existing KB answer */
export async function improveAnswer(
  question: string,
  currentAnswer: string,
  contextQAs: Array<{ question: string; answer: string }>,
  apiKey: string,
): Promise<{ answer: string; explanation: string }> {
  const client = getClient(apiKey);
  const contextText = contextQAs
    .map((qa, i) => `${i + 1}. Q: ${qa.question}\n   A: ${qa.answer}`)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    messages: [
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
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
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
  apiKey: string,
): Promise<{ question: string; answer: string; explanation: string }> {
  const client = getClient(apiKey);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    messages: [
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
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse merge suggestion");
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("병합 제안 JSON 파싱 실패");
  }
}
