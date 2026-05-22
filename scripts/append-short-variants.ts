// 짧은 질문 변형 append: published KB 항목에 카톡 구어체 짧은 질문 변형을 추가 생성.
// 기존 ai_generated 변형은 건드리지 않음. source='ai_short'로 구분, 멱등(ai_short만 delete+regenerate).
// NAS 앱 컨테이너 안에서 tsx로 실행. env(DATABASE_URL/OPENAI_API_KEY)는 컨테이너 상속.
//   LIMIT=1 로 1개만 시험 실행 가능. SHORT_VARIANT_COUNT 로 항목당 개수 조절(기본 5).
import { sql } from "drizzle-orm";
import { createDb } from "@kb-chatbot/database";
import { generateEmbeddings } from "@kb-chatbot/kb-engine";

const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL =
  "https://gateway.ai.cloudflare.com/v1/28b9de8f436a1a7b49eeb39d61b1fefd/kb-chatbot/openai";
const COUNT = Number(process.env.SHORT_VARIANT_COUNT ?? "5");
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

if (!DATABASE_URL || !OPENAI_API_KEY) {
  console.error("DATABASE_URL / OPENAI_API_KEY 필요");
  process.exit(1);
}

type Exec = { execute: (q: unknown) => Promise<Iterable<Record<string, unknown>>> };

async function generateShort(question: string, answer: string): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY as string}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.5,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "고객센터 FAQ 검색 recall을 높이기 위한 한국어 '짧은 구어체' 유사 질문을 만든다. 답변에 없는 사실은 만들지 않고, 같은 답변으로 정확히 처리 가능한 질문만 만든다.",
        },
        {
          role: "user",
          content: `다음 KB 항목과 같은 답변으로 처리 가능한, 고객이 카카오톡에 짧게 입력하는 질문을 ${COUNT}개 만들어줘.

규칙:
- 2~6어절의 짧고 자연스러운 구어체 (예: "무게 얼마야?", "방수 돼?", "충전 어떻게 해?")
- 단어 1개짜리 키워드 금지 ("무게", "방수" 같은 단독 명사 금지)
- 답변에 없는 범위로 질문을 넓히지 말 것
- 원 질문과 동일 문장 제외, 서로 중복 금지
- JSON 객체만 응답: {"variants":["질문1","질문2"]}

KB 질문:
${question}

KB 답변:
${answer}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`chat ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { variants?: unknown };
  if (!Array.isArray(parsed.variants)) return [];
  return Array.from(
    new Set(
      parsed.variants
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => v.length > 0),
    ),
  );
}

async function main(): Promise<number> {
  const db = createDb(DATABASE_URL as string) as unknown as Exec;
  const allItems = Array.from(
    await db.execute(
      sql`SELECT id, question, answer FROM knowledge_items WHERE status = 'published' ORDER BY created_at`,
    ),
  ) as Array<{ id: string; question: string; answer: string }>;
  const items = LIMIT ? allItems.slice(0, LIMIT) : allItems;
  console.log(`대상 published: ${items.length}개 (항목당 짧은변형 ${COUNT})${LIMIT ? ` [LIMIT=${LIMIT}]` : ""}`);

  let ok = 0;
  let total = 0;
  const failures: Array<{ id: string; err: string }> = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      const existingRows = Array.from(
        await db.execute(
          sql`SELECT question FROM knowledge_question_variants WHERE knowledge_item_id = ${it.id}`,
        ),
      ) as Array<{ question: string }>;
      const seen = new Set(existingRows.map((e) => e.question.trim()));
      seen.add(it.question.trim());

      let shorts = await generateShort(it.question, it.answer);
      // 중복 제거 + 단어 1개 키워드 방어(어절 2개 이상만)
      shorts = shorts
        .filter((s) => !seen.has(s) && s.split(/\s+/).filter(Boolean).length >= 2)
        .slice(0, COUNT);

      if (shorts.length === 0) {
        ok++;
        console.log(`[${i + 1}/${items.length}] +0 (중복/필터) | ${it.question.slice(0, 30)}`);
        continue;
      }

      const embs = await generateEmbeddings(shorts, OPENAI_API_KEY as string);
      // 멱등: embedding 성공 후에 기존 ai_short만 교체 (실패 시 기존 보존, ai_generated 8개 불변)
      await db.execute(
        sql`DELETE FROM knowledge_question_variants WHERE knowledge_item_id = ${it.id} AND source = 'ai_short'`,
      );
      const values = shorts.map(
        (q, idx) => sql`(${it.id}, ${q}, ${`[${embs[idx].join(",")}]`}::vector, 'ai_short')`,
      );
      await db.execute(
        sql`INSERT INTO knowledge_question_variants (knowledge_item_id, question, question_embedding, source) VALUES ${sql.join(values, sql`, `)}`,
      );
      ok++;
      total += shorts.length;
      console.log(`[${i + 1}/${items.length}] +${shorts.length} | ${it.question.slice(0, 30)} | ${JSON.stringify(shorts)}`);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      failures.push({ id: it.id, err });
      console.log(`[${i + 1}/${items.length}] FAIL | ${it.question.slice(0, 30)} | ${err.slice(0, 120)}`);
    }
  }

  console.log(`\n=== 완료: 성공 ${ok}/${items.length}, 짧은변형 총 ${total}개, 실패 ${failures.length} ===`);
  return failures.length > 0 ? 2 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("fatal:", e);
    process.exit(1);
  });
