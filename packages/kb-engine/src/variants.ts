import { sql } from "drizzle-orm";
import type { Database } from "@kb-chatbot/database";
import { generateEmbeddings } from "./embedding.js";

const DEFAULT_OPENAI_BASE_URL =
  "https://gateway.ai.cloudflare.com/v1/28b9de8f436a1a7b49eeb39d61b1fefd/kb-chatbot/openai";
const VARIANT_MODEL = "gpt-4o-mini";

export interface QuestionVariant {
  id: string;
  knowledgeItemId: string;
  question: string;
  source: string;
  createdAt: Date;
}

async function executeRows<T>(db: Database, query: unknown): Promise<T[]> {
  // The workspace currently has duplicate drizzle-orm type instances. Keep raw
  // SQL variant operations isolated until the dependency graph is deduped.
  const rows = await (db as { execute: (query: unknown) => Promise<Iterable<T>> })
    .execute(query);
  return Array.from(rows);
}

export async function listQuestionVariants(
  db: Database,
  knowledgeItemId: string,
): Promise<QuestionVariant[]> {
  return executeRows<QuestionVariant>(db, sql`
    SELECT
      id,
      knowledge_item_id AS "knowledgeItemId",
      question,
      source,
      created_at AS "createdAt"
    FROM knowledge_question_variants
    WHERE knowledge_item_id = ${knowledgeItemId}
    ORDER BY created_at ASC
  `);
}

export async function addQuestionVariant(
  db: Database,
  knowledgeItemId: string,
  question: string,
  openaiApiKey: string,
  options?: { baseUrl?: string; source?: string },
): Promise<QuestionVariant | null> {
  const trimmed = question.trim();
  if (!trimmed) return null;

  const [embedding] = await generateEmbeddings(
    [trimmed],
    openaiApiKey,
    { baseUrl: options?.baseUrl },
  );

  const embeddingStr = `[${embedding.join(",")}]`;
  const rows = await executeRows<QuestionVariant>(db, sql`
    INSERT INTO knowledge_question_variants (
      knowledge_item_id,
      question,
      question_embedding,
      source
    )
    VALUES (
      ${knowledgeItemId},
      ${trimmed},
      ${embeddingStr}::vector,
      ${options?.source ?? "manual"}
    )
    ON CONFLICT (knowledge_item_id, question) DO NOTHING
    RETURNING
      id,
      knowledge_item_id AS "knowledgeItemId",
      question,
      source,
      created_at AS "createdAt"
  `);

  return rows[0] ?? null;
}

export async function deleteQuestionVariant(
  db: Database,
  variantId: string,
): Promise<boolean> {
  const deleted = await executeRows<{ id: string }>(db, sql`
    DELETE FROM knowledge_question_variants
    WHERE id = ${variantId}
    RETURNING id
  `);

  return deleted.length > 0;
}

export async function generateAndReplaceQuestionVariants(
  db: Database,
  knowledgeItemId: string,
  openaiApiKey: string,
  options?: { baseUrl?: string; count?: number },
): Promise<QuestionVariant[]> {
  const itemRows = await executeRows<{
    id: string;
    question: string;
    answer: string;
  }>(db, sql`
    SELECT id, question, answer
    FROM knowledge_items
    WHERE id = ${knowledgeItemId}
    LIMIT 1
  `);
  const item = itemRows[0];

  if (!item) return [];

  const questions = await generateQuestionVariants(
    item.question,
    item.answer,
    openaiApiKey,
    {
      baseUrl: options?.baseUrl,
      count: options?.count ?? 8,
    },
  );

  await executeRows(db, sql`
    DELETE FROM knowledge_question_variants
    WHERE knowledge_item_id = ${knowledgeItemId}
  `);

  if (questions.length === 0) return [];

  const embeddings = await generateEmbeddings(
    questions,
    openaiApiKey,
    { baseUrl: options?.baseUrl },
  );

  const values = questions.map((question, index) => {
    const embeddingStr = `[${embeddings[index].join(",")}]`;
    return sql`(${knowledgeItemId}, ${question}, ${embeddingStr}::vector, 'ai_generated')`;
  });

  return executeRows<QuestionVariant>(db, sql`
    INSERT INTO knowledge_question_variants (
      knowledge_item_id,
      question,
      question_embedding,
      source
    )
    VALUES ${sql.join(values, sql`, `)}
    RETURNING
      id,
      knowledge_item_id AS "knowledgeItemId",
      question,
      source,
      created_at AS "createdAt"
  `);
}

export async function generateQuestionVariants(
  question: string,
  answer: string,
  apiKey: string,
  options?: { baseUrl?: string; count?: number },
): Promise<string[]> {
  const count = options?.count ?? 8;
  const baseUrl = options?.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
  const response = await fetch(`${baseUrl}/chat/completions`, {
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

  return Array.from(
    new Set(
      parsed.variants
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => v.length > 0 && v !== question),
    ),
  ).slice(0, count);
}
