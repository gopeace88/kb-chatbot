import { generateEmbedding, generateEmbeddings } from "@kb-chatbot/kb-engine";

const OPENAI_DIRECT_URL = "https://api.openai.com/v1";
const VARIANT_MODEL = "gpt-4o-mini";

export async function embedText(text: string, apiKey: string): Promise<number[]> {
  return generateEmbedding(text, apiKey, { baseUrl: OPENAI_DIRECT_URL });
}

export async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  return generateEmbeddings(texts, apiKey, { baseUrl: OPENAI_DIRECT_URL });
}

export async function generateQuestionVariants(
  question: string,
  answer: string,
  apiKey: string,
  count = 8,
): Promise<string[]> {
  const response = await fetch(`${OPENAI_DIRECT_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VARIANT_MODEL,
      temperature: 0.4,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "고객센터 FAQ 검색 품질을 높이기 위한 한국어 유사 질문을 생성한다. 답변에 없는 사실을 만들지 말고, 같은 답변으로 정확히 처리 가능한 질문만 만든다.",
        },
        {
          role: "user",
          content: `다음 KB 항목과 같은 답변으로 처리 가능한 고객 질문 표현을 ${count}개 만들어주세요.

규칙:
- 한국어 고객이 카카오톡에 실제로 짧게 입력할 법한 표현
- 원래 질문과 완전히 같은 문장은 제외
- 답변에 없는 범위로 질문을 넓히지 말 것
- 중복/동의어 반복을 피할 것
- JSON 객체만 응답: {"variants":["질문1","질문2"]}

KB 질문:
${question}

KB 답변:
${answer}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI variant generation error: ${response.status} ${error}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { variants?: unknown };
  if (!Array.isArray(parsed.variants)) return [];

  return parsed.variants
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v !== question)
    .slice(0, count);
}

export interface LearnedVariantDecision {
  accept: boolean;
  variant: string | null;
  reason: string;
}

export async function decideLearnedVariant(
  userQuestion: string,
  kbQuestion: string,
  kbAnswer: string,
  apiKey: string,
): Promise<LearnedVariantDecision> {
  const response = await fetch(`${OPENAI_DIRECT_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VARIANT_MODEL,
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "고객 질문을 기존 고객센터 KB의 검색용 유사질문으로 추가해도 되는지 판정한다. 답변에 없는 사실을 요구하거나, 다른 KB가 더 맞거나, 의미가 애매하면 거절한다.",
        },
        {
          role: "user",
          content: `고객 질문이 아래 KB 답변으로 정확히 처리 가능한지 판단하세요.

규칙:
- 같은 답변으로 안전하게 처리 가능하면 accept=true
- KB 답변에 없는 정보, 조건부/애매한 질문, 다른 KB가 더 맞는 질문이면 accept=false
- accept=true면 고객이 실제로 물은 표현을 자연스럽게 다듬은 variant를 1개만 반환
- JSON만 반환: {"accept":true,"variant":"질문","reason":"이유"}

고객 질문:
${userQuestion}

KB 질문:
${kbQuestion}

KB 답변:
${kbAnswer}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI learned variant decision error: ${response.status} ${error}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    accept?: unknown;
    variant?: unknown;
    reason?: unknown;
  };

  return {
    accept: parsed.accept === true,
    variant: typeof parsed.variant === "string" ? parsed.variant.trim() : null,
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
  };
}
