const REFINE_MODEL = "gpt-4o";

export interface RefinedQA {
  question: string;
  answer: string;
  category: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

const REFINE_SYSTEM_PROMPT = `당신은 고객 문의를 지식 베이스 Q&A로 정제하는 전문가입니다.

입력: 원본 고객 문의(질문)와 그에 대한 답변
출력: 깔끔하게 정리된 Q&A + 카테고리

규칙:
1. 질문을 명확하고 일반적인 형태로 정리하세요 (특정 고객 정보 제거).
2. 답변을 간결하고 정확하게 정리하세요.
3. 카테고리를 분류하세요: 배송, 교환/반품, 사용법, AS/수리, 결제, 기타

JSON 형식으로 응답하세요:
{
  "question": "정제된 질문",
  "answer": "정제된 답변",
  "category": "카테고리"
}`;

/**
 * 원본 문의를 AI로 Q&A 형태로 정제
 * GPT-4 사용 (비동기 작업이므로 고품질 모델 사용)
 */
export async function refineInquiry(
  originalQuestion: string,
  originalAnswer: string,
  apiKey: string,
): Promise<RefinedQA> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REFINE_MODEL,
      messages: [
        { role: "system", content: REFINE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `원본 질문: ${originalQuestion}\n원본 답변: ${originalAnswer}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `OpenAI Chat Completion API error: ${response.status} ${error}`,
    );
  }

  const result = (await response.json()) as ChatCompletionResponse;
  return JSON.parse(result.choices[0].message.content) as RefinedQA;
}
