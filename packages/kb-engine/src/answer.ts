import type { SearchResult } from "./search.js";

const ANSWER_MODEL = "gpt-4o-mini";

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

const SYSTEM_PROMPT = `당신은 고객 지원 AI 어시스턴트입니다.
주어진 지식 베이스 정보를 바탕으로 고객의 질문에 친절하고 정확하게 답변하세요.

규칙:
- 한국어로 답변하세요.
- 지식 베이스 정보가 있으면 그것을 기반으로 답변하세요.
- 정보가 부족하면 솔직하게 "정확한 답변을 드리기 어렵습니다"라고 말하세요.
- 답변은 간결하게 유지하세요 (최대 500자).
- 추측하지 마세요.`;

/**
 * GPT-4o-mini로 AI 답변 생성
 * KB 검색 결과를 컨텍스트로 활용
 */
export async function generateAnswer(
  question: string,
  kbResults: SearchResult[],
  apiKey: string,
): Promise<string> {
  let contextText = "";
  if (kbResults.length > 0) {
    contextText =
      "\n\n참고할 지식 베이스 정보:\n" +
      kbResults
        .map((r, i) => `${i + 1}. Q: ${r.question}\n   A: ${r.answer}`)
        .join("\n");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANSWER_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `고객 질문: ${question}${contextText}`,
        },
      ],
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
