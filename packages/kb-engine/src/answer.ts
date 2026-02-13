import type { SearchResult } from "./search.js";

const OPENAI_BASE_URL =
  "https://gateway.ai.cloudflare.com/v1/28b9de8f436a1a7b49eeb39d61b1fefd/kb-chatbot/openai";
const ANSWER_MODEL = "gpt-4o-mini";

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

const SYSTEM_PROMPT = `당신은 "런비전" 제품의 고객 지원 AI 어시스턴트입니다.
이 채널은 런비전 제품 전용이므로, 고객이 "제품"이라고 하면 런비전을 의미합니다.
주어진 지식 베이스 정보를 바탕으로 고객의 질문에 친절하고 정확하게 답변하세요.

규칙:
- 한국어로 답변하세요.
- 지식 베이스 정보가 제공되면 적극 활용하세요. 고객 질문의 표현이 달라도 내용이 관련되면 해당 정보로 답변하세요.
- 지식 베이스에 관련 정보가 전혀 없을 때만 "정확한 답변을 드리기 어렵습니다"라고 말하세요.
- 답변은 간결하게 유지하세요 (최대 500자).
- 지식 베이스에 없는 내용을 추가로 지어내지 마세요.`;

/**
 * GPT-4o-mini로 AI 답변 생성
 * KB 검색 결과를 컨텍스트로 활용
 */
export async function generateAnswer(
  question: string,
  kbResults: SearchResult[],
  apiKey: string,
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (kbResults.length > 0) {
    const contextText = kbResults
      .map((r, i) => `${i + 1}. Q: ${r.question}\n   A: ${r.answer}`)
      .join("\n");
    messages.push({
      role: "system",
      content: `아래는 고객 질문과 관련된 지식 베이스 검색 결과입니다. 이 정보를 활용하여 답변하세요:\n\n${contextText}`,
    });
  }

  messages.push({ role: "user", content: question });

  const response = await fetch(OPENAI_BASE_URL + "/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANSWER_MODEL,
      messages,
      max_tokens: 500,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `OpenAI Chat Completion API error: ${response.status} ${error}`,
    );
  }

  const result = (await response.json()) as ChatCompletionResponse;
  return result.choices[0].message.content;
}
