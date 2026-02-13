# KB CLI + Image Support + Auto Q&A Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add image URL support to KB items, enable image-rich KakaoTalk responses, and build a local CLI tool that ingests documents/images into Q&A pairs using Claude AI.

**Architecture:** Extend `knowledge_items` schema with `image_url`. Parameterize `kb-engine` embedding baseUrl so CLI can call OpenAI directly. CLI uses Claude for Q&A generation/Vision/improvement, OpenAI for embeddings only. KakaoTalk responses use `basicCard` + `simpleText` for image+text answers.

**Tech Stack:** TypeScript, Drizzle ORM, Neon PostgreSQL, Claude API (Sonnet), OpenAI API (embedding), commander CLI, pdf-parse, chalk

---

## Task 1: DB Schema — Add imageUrl to knowledge_items

**Files:**
- Modify: `packages/database/src/schema/knowledge-items.ts:26` (after `sourceInquiryId`)

**Step 1: Add imageUrl column to schema**

In `packages/database/src/schema/knowledge-items.ts`, add after line 28 (`sourceInquiryId`):

```ts
    // 이미지
    imageUrl: varchar("image_url", { length: 1024 }),
```

**Step 2: Run Drizzle push to apply migration**

```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot/packages/database && npx drizzle-kit push
```

Expected: Schema synced, `image_url` column added to `knowledge_items`.

**Step 3: Verify column exists**

Use the Neon MCP tool `run_sql` or:
```bash
# Check column exists
```
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'knowledge_items' AND column_name = 'image_url';
```
Expected: One row with `image_url | character varying`.

**Step 4: Commit**

```bash
git add packages/database/src/schema/knowledge-items.ts
git commit -m "feat(db): add image_url column to knowledge_items"
```

---

## Task 2: kb-engine — imageUrl in CRUD types and operations

**Files:**
- Modify: `packages/kb-engine/src/crud.ts:18-32` (CreateKBItemInput, UpdateKBItemInput)
- Modify: `packages/kb-engine/src/crud.ts:34-56` (createKBItem function)
- Modify: `packages/kb-engine/src/crud.ts:58-84` (updateKBItem function)
- Modify: `packages/kb-engine/src/crud.ts:96-158` (listKBItems — add imageUrl to select)

**Step 1: Add imageUrl to input types**

In `packages/kb-engine/src/crud.ts`:

`CreateKBItemInput` (line 18): add `imageUrl?: string;`
`UpdateKBItemInput` (line 27): add `imageUrl?: string;`

**Step 2: Pass imageUrl through createKBItem**

In `createKBItem` function (line 43 `.values()`), add:
```ts
      imageUrl: input.imageUrl ?? null,
```

**Step 3: Pass imageUrl through updateKBItem**

In `updateKBItem` function (line 72 `.set()`), add:
```ts
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
```

**Step 4: Add imageUrl to listKBItems select**

In `listKBItems` (line 125 select object), add:
```ts
        imageUrl: knowledgeItems.imageUrl,
```

**Step 5: Build and verify**

```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot && pnpm --filter @kb-chatbot/kb-engine build
```
Expected: No errors.

**Step 6: Commit**

```bash
git add packages/kb-engine/src/crud.ts
git commit -m "feat(kb-engine): add imageUrl to CRUD types and operations"
```

---

## Task 3: kb-engine — imageUrl in search results and pipeline

**Files:**
- Modify: `packages/kb-engine/src/search.ts:6-11` (SearchResult interface)
- Modify: `packages/kb-engine/src/search.ts:32-47` (select + return)
- Modify: `packages/kb-engine/src/pipeline.ts:8-14` (AnswerPipelineResult)
- Modify: `packages/kb-engine/src/pipeline.ts:48-59` (kb_match return)

**Step 1: Add imageUrl to SearchResult**

In `packages/kb-engine/src/search.ts`, `SearchResult` interface (line 6):
```ts
export interface SearchResult {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  imageUrl: string | null;
  similarity: number;
}
```

**Step 2: Add imageUrl to search select**

In `searchKnowledgeBase` (line 33 `.select()`), add:
```ts
      imageUrl: knowledgeItems.imageUrl,
```

**Step 3: Add imageUrl to AnswerPipelineResult**

In `packages/kb-engine/src/pipeline.ts`, `AnswerPipelineResult` interface (line 8):
```ts
export interface AnswerPipelineResult {
  answer: string;
  source: ResponseSource;
  matchedKbId: string | null;
  similarityScore: number | null;
  imageUrl: string | null;
  kbResults: SearchResult[];
}
```

**Step 4: Return imageUrl from pipeline**

In `answerPipeline`, the kb_match return (line 52):
```ts
      return {
        answer: kbResults[0].answer,
        source: "kb_match",
        matchedKbId: kbResults[0].id,
        similarityScore: kbResults[0].similarity,
        imageUrl: kbResults[0].imageUrl,
        kbResults,
      };
```

For `ai_generated` return (line 68) and `fallback` return (line 81), add `imageUrl: null`.

**Step 5: Build and verify**

```bash
pnpm --filter @kb-chatbot/kb-engine build
```

**Step 6: Commit**

```bash
git add packages/kb-engine/src/search.ts packages/kb-engine/src/pipeline.ts
git commit -m "feat(kb-engine): add imageUrl to search results and pipeline"
```

---

## Task 4: kb-engine — Parameterize embedding baseUrl

**Files:**
- Modify: `packages/kb-engine/src/embedding.ts:1-35` (generateEmbedding)
- Modify: `packages/kb-engine/src/embedding.ts:41-70` (generateEmbeddings)

**Step 1: Add options parameter to generateEmbedding**

Replace the function signature and body to accept optional `baseUrl`:

```ts
const DEFAULT_OPENAI_BASE_URL =
  "https://gateway.ai.cloudflare.com/v1/28b9de8f436a1a7b49eeb39d61b1fefd/kb-chatbot/openai";
const EMBEDDING_MODEL = "text-embedding-3-small";

interface EmbeddingOptions {
  baseUrl?: string;
}

export async function generateEmbedding(
  text: string,
  apiKey: string,
  options?: EmbeddingOptions,
): Promise<number[]> {
  const baseUrl = options?.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
  const response = await fetch(baseUrl + "/embeddings", {
    // ... rest unchanged
```

Apply same pattern to `generateEmbeddings`.

**Step 2: Verify existing callers still work**

All existing callers pass only `(text, apiKey)` — the new `options` parameter is optional, so no breaking change.

```bash
pnpm --filter @kb-chatbot/kb-engine build
```

**Step 3: Commit**

```bash
git add packages/kb-engine/src/embedding.ts
git commit -m "feat(kb-engine): parameterize embedding API baseUrl for CLI support"
```

---

## Task 5: Workers — imageUrl in KB API routes

**Files:**
- Modify: `apps/workers/src/routes/kb.ts:48-74` (POST create)
- Modify: `apps/workers/src/routes/kb.ts:77-94` (PUT update)

**Step 1: Add imageUrl to POST /api/kb body type and createKBItem call**

In `kb.post("/")` (line 50), add `imageUrl?: string` to the body type.
In `createKBItem` call (line 61), add `imageUrl: body.imageUrl` to input.

**Step 2: Add imageUrl to PUT /api/kb/:id body type and updateKBItem call**

In `kb.put("/:id")` (line 80), add `imageUrl?: string` to the body type.
The body is already spread into `updateKBItem`, but we need to ensure `imageUrl` is in the body destructure.

**Step 3: Build workers**

```bash
pnpm --filter workers build
```

**Step 4: Commit**

```bash
git add apps/workers/src/routes/kb.ts
git commit -m "feat(workers): pass imageUrl through KB API endpoints"
```

---

## Task 6: Workers — KakaoTalk image response (basicCard + simpleText)

**Files:**
- Modify: `apps/workers/src/lib/kakao-response.ts:40-48` (buildAnswerResponse)
- Modify: `apps/workers/src/routes/kakao.ts:96-99` (pass imageUrl)
- Modify: `packages/shared/src/constants.ts` (add BASIC_CARD_MAX_LENGTH)

**Step 1: Add BASIC_CARD_MAX_LENGTH constant**

In `packages/shared/src/constants.ts`, inside `KAKAO_LIMITS`:
```ts
  /** BasicCard description 최대 길이 */
  BASIC_CARD_MAX_LENGTH: 230,
```

**Step 2: Update buildAnswerResponse to accept imageUrl**

In `apps/workers/src/lib/kakao-response.ts`, replace `buildAnswerResponse`:

```ts
export function buildAnswerResponse(
  answerText: string,
  imageUrl?: string | null,
): KakaoSkillResponse {
  const outputs: KakaoOutput[] = [];

  if (imageUrl) {
    // basicCard with image thumbnail + truncated description
    const description =
      answerText.length > KAKAO_LIMITS.BASIC_CARD_MAX_LENGTH
        ? answerText.slice(0, KAKAO_LIMITS.BASIC_CARD_MAX_LENGTH - 3) + "..."
        : answerText;
    outputs.push({
      basicCard: {
        thumbnail: { imageUrl },
        description,
      },
    });
    // Full answer as simpleText if it was truncated
    if (answerText.length > KAKAO_LIMITS.BASIC_CARD_MAX_LENGTH) {
      outputs.push(simpleText(answerText));
    }
  } else {
    outputs.push(simpleText(answerText));
  }

  return {
    version: "2.0",
    template: {
      outputs,
      quickReplies: feedbackQuickReplies(),
    },
  };
}
```

**Step 3: Pass imageUrl from kakao route**

In `apps/workers/src/routes/kakao.ts` (line 96-99), change:
```ts
  const response =
    result.source === "fallback"
      ? buildFallbackResponse()
      : buildAnswerResponse(result.answer, result.imageUrl);
```

**Step 4: Build workers**

```bash
pnpm --filter workers build
```

**Step 5: Commit**

```bash
git add packages/shared/src/constants.ts apps/workers/src/lib/kakao-response.ts apps/workers/src/routes/kakao.ts
git commit -m "feat(workers): KakaoTalk image response with basicCard + simpleText"
```

---

## Task 7: Dashboard — imageUrl in types and API

**Files:**
- Modify: `apps/dashboard/src/lib/api.ts:51-65` (KBItem type)
- Modify: `apps/dashboard/src/lib/api.ts:170-173` (createKB, updateKB)

**Step 1: Add imageUrl to KBItem type**

In `apps/dashboard/src/lib/api.ts`, `KBItem` interface (after line 64 `updatedAt`):
```ts
  imageUrl: string | null;
```

**Step 2: Add imageUrl to createKB and updateKB signatures**

`createKB` (line 170): add `imageUrl?: string` to data param.
`updateKB` (line 172): add `imageUrl?: string` to data param.

**Step 3: Commit**

```bash
git add apps/dashboard/src/lib/api.ts
git commit -m "feat(dashboard): add imageUrl to KB API types"
```

---

## Task 8: Dashboard — KB pages image support

**Files:**
- Modify: `apps/dashboard/src/app/kb/new/page.tsx` (imageUrl input field)
- Modify: `apps/dashboard/src/app/kb/detail/page.tsx` (image preview + edit)
- Modify: `apps/dashboard/src/app/kb/page.tsx` (image indicator in list)

**Step 1: KB create page — add imageUrl field**

In `apps/dashboard/src/app/kb/new/page.tsx`:

Add state: `const [imageUrl, setImageUrl] = useState("");`

Add input field after the category Select (before `{error &&` line 86):
```tsx
            <div>
              <label className="mb-1 block text-sm font-medium">이미지 URL (선택)</label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/product.jpg"
              />
              {imageUrl && (
                <img src={imageUrl} alt="미리보기" className="mt-2 max-h-40 rounded border" />
              )}
            </div>
```

In `handleSubmit`, pass `imageUrl: imageUrl || undefined` to `api.createKB()`.

**Step 2: KB detail page — show image and edit imageUrl**

In `apps/dashboard/src/app/kb/detail/page.tsx`:

Add state: `const [imageUrl, setImageUrl] = useState("");`

In `useEffect` data load, add: `setImageUrl(data.imageUrl || "");`

In the view mode (non-editing), after the answer display (line 168), add:
```tsx
                {item.imageUrl && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">이미지</div>
                    <img src={item.imageUrl} alt="KB 이미지" className="mt-1 max-h-48 rounded border" />
                  </div>
                )}
```

In the edit mode, after the category Select (line 150), add:
```tsx
                <div>
                  <label className="mb-1 block text-sm font-medium">이미지 URL</label>
                  <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
                  {imageUrl && <img src={imageUrl} alt="미리보기" className="mt-2 max-h-40 rounded border" />}
                </div>
```

In `handleSave`, pass `imageUrl: imageUrl || undefined` to `api.updateKB()`.
In cancel handler, add: `setImageUrl(item.imageUrl || "");`

**Step 3: KB list page — image indicator**

In `apps/dashboard/src/app/kb/page.tsx`, in the table row question cell (line 112-118), add an image icon if present:

```tsx
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {item.imageUrl && (
                        <img src={item.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                      )}
                      <div>
                        <div className="font-medium text-gray-900">
                          {truncate(item.question, 60)}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {truncate(item.answer, 80)}
                        </div>
                      </div>
                    </div>
                  </td>
```

**Step 4: Build dashboard**

```bash
pnpm --filter dashboard build
```

**Step 5: Commit**

```bash
git add apps/dashboard/src/app/kb/new/page.tsx apps/dashboard/src/app/kb/detail/page.tsx apps/dashboard/src/app/kb/page.tsx
git commit -m "feat(dashboard): KB image display, preview, and editing"
```

---

## Task 9: KB CLI — Package scaffolding

**Files:**
- Create: `apps/kb-cli/package.json`
- Create: `apps/kb-cli/tsconfig.json`
- Create: `apps/kb-cli/.env.example`
- Create: `apps/kb-cli/src/config.ts`
- Create: `apps/kb-cli/src/db.ts`

**Step 1: Create package.json**

```json
{
  "name": "@kb-chatbot/kb-cli",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "cli": "tsx src/index.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@kb-chatbot/database": "workspace:*",
    "@kb-chatbot/kb-engine": "workspace:*",
    "@kb-chatbot/shared": "workspace:*",
    "chalk": "^5.4.0",
    "commander": "^13.1.0",
    "dotenv": "^16.4.0",
    "pdf-parse": "^1.1.1"
  },
  "devDependencies": {
    "@types/pdf-parse": "^1.1.4",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src"],
  "references": [
    { "path": "../packages/shared" },
    { "path": "../packages/database" }
  ]
}
```

Note: We use `tsx` to run directly, so `noEmit: true` — no build output needed.

**Step 3: Create .env.example**

```
DATABASE_URL=postgresql://neondb_owner:...@...neon.tech/neondb?sslmode=require
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

**Step 4: Create src/config.ts**

```ts
import "dotenv/config";

export function getConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!databaseUrl) throw new Error("DATABASE_URL is required in .env");
  if (!openaiApiKey) throw new Error("OPENAI_API_KEY is required in .env");
  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is required in .env");

  return { databaseUrl, openaiApiKey, anthropicApiKey };
}
```

**Step 5: Create src/db.ts**

```ts
import { createDb } from "@kb-chatbot/database";
import { getConfig } from "./config.js";

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) {
    const { databaseUrl } = getConfig();
    _db = createDb(databaseUrl);
  }
  return _db;
}
```

**Step 6: Install dependencies**

```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot && pnpm install
```

**Step 7: Commit**

```bash
git add apps/kb-cli/
git commit -m "feat(kb-cli): package scaffolding with config and db connection"
```

---

## Task 10: KB CLI — AI modules (Claude + OpenAI)

**Files:**
- Create: `apps/kb-cli/src/ai/claude.ts`
- Create: `apps/kb-cli/src/ai/openai.ts`

**Step 1: Create openai.ts — direct embedding client**

```ts
import { generateEmbedding, generateEmbeddings } from "@kb-chatbot/kb-engine";

const OPENAI_DIRECT_URL = "https://api.openai.com/v1";

export async function embedText(text: string, apiKey: string): Promise<number[]> {
  return generateEmbedding(text, apiKey, { baseUrl: OPENAI_DIRECT_URL });
}

export async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  return generateEmbeddings(texts, apiKey, { baseUrl: OPENAI_DIRECT_URL });
}
```

**Step 2: Create claude.ts — Claude API for Q&A gen, Vision, improve**

```ts
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
  return JSON.parse(jsonMatch[0]);
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
  return JSON.parse(jsonMatch[0]);
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
  return JSON.parse(jsonMatch[0]);
}
```

**Step 3: Verify types**

```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot && pnpm --filter @kb-chatbot/kb-cli exec tsc --noEmit
```

**Step 4: Commit**

```bash
git add apps/kb-cli/src/ai/
git commit -m "feat(kb-cli): Claude and OpenAI AI modules"
```

---

## Task 11: KB CLI — Processors (PDF, Image, Chunker)

**Files:**
- Create: `apps/kb-cli/src/processors/pdf.ts`
- Create: `apps/kb-cli/src/processors/image.ts`
- Create: `apps/kb-cli/src/processors/chunker.ts`

**Step 1: Create chunker.ts**

```ts
export interface Chunk {
  text: string;
  index: number;
}

export function chunkText(
  text: string,
  maxLength = 1000,
  overlap = 200,
): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + maxLength, text.length);
    chunks.push({ text: text.slice(start, end).trim(), index });
    start += maxLength - overlap;
    index++;
  }

  return chunks.filter((c) => c.text.length > 50); // Skip tiny chunks
}
```

**Step 2: Create pdf.ts**

```ts
import { readFile } from "node:fs/promises";
import pdf from "pdf-parse";

export async function extractTextFromPDF(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const data = await pdf(buffer);
  return data.text;
}
```

**Step 3: Create image.ts**

```ts
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { analyzeImage } from "../ai/claude.js";

const MIME_MAP: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function extractTextFromImage(
  filePath: string,
  anthropicApiKey: string,
): Promise<string> {
  const buffer = await readFile(filePath);
  const base64 = buffer.toString("base64");
  const ext = extname(filePath).toLowerCase();
  const mediaType = MIME_MAP[ext];
  if (!mediaType) throw new Error(`Unsupported image format: ${ext}`);

  return analyzeImage(base64, mediaType, anthropicApiKey);
}

export function isImageFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext in MIME_MAP;
}
```

**Step 4: Commit**

```bash
git add apps/kb-cli/src/processors/
git commit -m "feat(kb-cli): document processors (PDF, image, chunker)"
```

---

## Task 12: KB CLI — Commands (list, ingest, improve, dedupe)

**Files:**
- Create: `apps/kb-cli/src/commands/list.ts`
- Create: `apps/kb-cli/src/commands/ingest.ts`
- Create: `apps/kb-cli/src/commands/improve.ts`
- Create: `apps/kb-cli/src/commands/dedupe.ts`

**Step 1: Create list.ts**

```ts
import chalk from "chalk";
import { listKBItems } from "@kb-chatbot/kb-engine";
import type { KBStatus } from "@kb-chatbot/shared";
import { getDb } from "../db.js";

export async function listCommand(options: {
  status?: string;
  search?: string;
  page?: string;
}) {
  const db = getDb();
  const result = await listKBItems(db, {
    status: (options.status as KBStatus) || undefined,
    search: options.search || undefined,
    page: Number(options.page) || 1,
    limit: 20,
  });

  console.log(chalk.bold(`\nKB 목록 (${result.total}건, ${result.page}/${result.totalPages} 페이지)\n`));

  for (const item of result.data) {
    const statusColor =
      item.status === "published" ? chalk.green : item.status === "draft" ? chalk.yellow : chalk.gray;
    const img = item.imageUrl ? chalk.cyan(" [IMG]") : "";
    console.log(
      `  ${chalk.dim(item.id.slice(0, 8))} ${statusColor(`[${item.status}]`)}${img} ${item.question}`,
    );
    console.log(chalk.dim(`    → ${item.answer.slice(0, 80)}${item.answer.length > 80 ? "..." : ""}`));
    console.log();
  }
}
```

**Step 2: Create ingest.ts**

```ts
import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import chalk from "chalk";
import { createKBItem, searchKnowledgeBase } from "@kb-chatbot/kb-engine";
import { getDb } from "../db.js";
import { getConfig } from "../config.js";
import { extractTextFromPDF } from "../processors/pdf.js";
import { extractTextFromImage, isImageFile } from "../processors/image.js";
import { chunkText } from "../processors/chunker.js";
import { generateQAPairs } from "../ai/claude.js";
import { embedText } from "../ai/openai.js";
import { createInterface } from "node:readline";

const DEDUP_THRESHOLD = 0.85;

export async function ingestCommand(
  filePath: string,
  options: { auto?: boolean },
) {
  const config = getConfig();
  const db = getDb();

  // Resolve file list
  const files = await resolveFiles(filePath);
  console.log(chalk.bold(`\n${files.length}개 파일 처리 시작\n`));

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const file of files) {
    console.log(chalk.cyan(`처리 중: ${file}`));

    // 1. Extract text
    let text: string;
    try {
      text = await extractFromFile(file, config.anthropicApiKey);
    } catch (err) {
      console.log(chalk.red(`  텍스트 추출 실패: ${err}`));
      continue;
    }
    console.log(chalk.dim(`  텍스트 추출 완료 (${text.length}자)`));

    // 2. Chunk
    const chunks = chunkText(text);
    console.log(chalk.dim(`  ${chunks.length}개 청크로 분할`));

    // 3. Generate Q&A per chunk
    for (const chunk of chunks) {
      let qaPairs: Array<{ question: string; answer: string; category: string }>;
      try {
        qaPairs = await generateQAPairs(chunk.text, config.anthropicApiKey);
      } catch (err) {
        console.log(chalk.red(`  Q&A 생성 실패 (청크 ${chunk.index}): ${err}`));
        continue;
      }

      // 4. Dedup check + save each Q&A
      for (const qa of qaPairs) {
        const embedding = await embedText(qa.question, config.openaiApiKey);
        const existing = await searchKnowledgeBase(db, embedding, {
          threshold: DEDUP_THRESHOLD,
          maxResults: 1,
        });

        if (existing.length > 0) {
          console.log(
            chalk.yellow(`  [중복 스킵] "${qa.question.slice(0, 40)}..." ↔ "${existing[0].question.slice(0, 40)}..." (${(existing[0].similarity * 100).toFixed(1)}%)`),
          );
          totalSkipped++;
          continue;
        }

        if (!options.auto) {
          console.log(chalk.white(`\n  새 Q&A:`));
          console.log(chalk.white(`    Q: ${qa.question}`));
          console.log(chalk.white(`    A: ${qa.answer}`));
          console.log(chalk.dim(`    카테고리: ${qa.category}`));
          const confirmed = await confirm("  저장할까요? (y/n): ");
          if (!confirmed) {
            totalSkipped++;
            continue;
          }
        }

        await createKBItem(
          db,
          {
            question: qa.question,
            answer: qa.answer,
            category: qa.category,
            createdBy: "kb-cli/ingest",
          },
          config.openaiApiKey,
          { baseUrl: "https://api.openai.com/v1" },
        );
        totalCreated++;
        console.log(chalk.green(`  [저장] ${qa.question.slice(0, 50)}`));
      }
    }
  }

  console.log(chalk.bold(`\n완료: ${totalCreated}건 생성, ${totalSkipped}건 스킵\n`));
}

async function resolveFiles(path: string): Promise<string[]> {
  const s = await stat(path);
  if (s.isFile()) return [path];
  if (s.isDirectory()) {
    const entries = await readdir(path);
    const files: string[] = [];
    for (const entry of entries) {
      const full = join(path, entry);
      const es = await stat(full);
      if (es.isFile()) files.push(full);
    }
    return files;
  }
  return [];
}

async function extractFromFile(file: string, anthropicApiKey: string): Promise<string> {
  const ext = extname(file).toLowerCase();
  if (ext === ".pdf") return extractTextFromPDF(file);
  if (isImageFile(file)) return extractTextFromImage(file, anthropicApiKey);
  // Treat as text
  const { readFile } = await import("node:fs/promises");
  return (await readFile(file, "utf-8")).toString();
}

function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}
```

Note: `createKBItem` needs the `baseUrl` option passed through. This requires a small adjustment — see Step 2 adjustment in Task 2. We'll pass `options` through `createKBItem` to `generateEmbedding`. See adjustments below.

**Adjustment needed for createKBItem**: Add optional `embeddingOptions` parameter:

In `packages/kb-engine/src/crud.ts`, `createKBItem` signature becomes:
```ts
export async function createKBItem(
  db: Database,
  input: CreateKBItemInput,
  openaiApiKey: string,
  embeddingOptions?: { baseUrl?: string },
) {
  const embedding = await generateEmbedding(input.question, openaiApiKey, embeddingOptions);
  // ...rest unchanged
```

Same for `updateKBItem`. This keeps backward compatibility since the parameter is optional.

**Step 3: Create improve.ts**

```ts
import chalk from "chalk";
import { listKBItems, updateKBItem } from "@kb-chatbot/kb-engine";
import type { KBStatus } from "@kb-chatbot/shared";
import { getDb } from "../db.js";
import { getConfig } from "../config.js";
import { improveAnswer } from "../ai/claude.js";
import { createInterface } from "node:readline";

export async function improveCommand(options: {
  all?: boolean;
  category?: string;
  id?: string;
  auto?: boolean;
}) {
  const config = getConfig();
  const db = getDb();

  // Fetch target items
  const result = await listKBItems(db, {
    status: "published" as KBStatus,
    category: options.category || undefined,
    limit: 100,
  });

  let items = result.data;
  if (options.id) {
    items = items.filter((i) => i.id === options.id);
  }

  if (items.length === 0) {
    console.log(chalk.yellow("개선할 KB 항목이 없습니다."));
    return;
  }

  console.log(chalk.bold(`\n${items.length}개 항목 개선 시작\n`));
  let improved = 0;

  for (const item of items) {
    // Get context QAs from same category
    const context = result.data
      .filter((i) => i.id !== item.id && i.category === item.category)
      .slice(0, 5);

    console.log(chalk.cyan(`Q: ${item.question}`));

    const suggestion = await improveAnswer(
      item.question,
      item.answer,
      context.map((c) => ({ question: c.question, answer: c.answer })),
      config.anthropicApiKey,
    );

    if (suggestion.answer === item.answer) {
      console.log(chalk.dim("  변경 없음\n"));
      continue;
    }

    console.log(chalk.red(`  - ${item.answer.slice(0, 100)}`));
    console.log(chalk.green(`  + ${suggestion.answer.slice(0, 100)}`));
    console.log(chalk.dim(`  이유: ${suggestion.explanation}\n`));

    let shouldApply = options.auto ?? false;
    if (!shouldApply) {
      shouldApply = await confirm("  적용할까요? (y/n): ");
    }

    if (shouldApply) {
      await updateKBItem(db, item.id, { answer: suggestion.answer }, config.openaiApiKey, {
        baseUrl: "https://api.openai.com/v1",
      });
      improved++;
      console.log(chalk.green("  적용 완료\n"));
    } else {
      console.log(chalk.dim("  건너뜀\n"));
    }
  }

  console.log(chalk.bold(`\n완료: ${improved}건 개선\n`));
}

function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}
```

**Step 4: Create dedupe.ts**

```ts
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { knowledgeItems } from "@kb-chatbot/database";
import { updateKBItem, archiveKBItem } from "@kb-chatbot/kb-engine";
import { getDb } from "../db.js";
import { getConfig } from "../config.js";
import { suggestMerge } from "../ai/claude.js";
import { createInterface } from "node:readline";

export async function dedupeCommand(options: {
  threshold?: string;
  auto?: boolean;
}) {
  const config = getConfig();
  const db = getDb();
  const threshold = Number(options.threshold) || 0.9;

  console.log(chalk.bold(`\n중복 검출 (threshold: ${threshold})\n`));

  // Load all published items with embeddings
  const items = await db
    .select({
      id: knowledgeItems.id,
      question: knowledgeItems.question,
      answer: knowledgeItems.answer,
      category: knowledgeItems.category,
    })
    .from(knowledgeItems)
    .where(sql`status = 'published' AND question_embedding IS NOT NULL`);

  console.log(chalk.dim(`${items.length}개 항목 로드\n`));

  // Pairwise similarity check using DB
  const pairs: Array<{ i: typeof items[0]; j: typeof items[0]; sim: number }> = [];

  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const [result] = await db.execute<{ sim: number }>(
        sql`SELECT 1 - (
          (SELECT question_embedding FROM knowledge_items WHERE id = ${items[a].id})
          <=>
          (SELECT question_embedding FROM knowledge_items WHERE id = ${items[b].id})
        ) as sim`,
      );
      if (result && result.sim >= threshold) {
        pairs.push({ i: items[a], j: items[b], sim: result.sim });
      }
    }
  }

  if (pairs.length === 0) {
    console.log(chalk.green("중복 없음!\n"));
    return;
  }

  console.log(chalk.yellow(`${pairs.length}개 중복 쌍 발견\n`));

  let merged = 0;
  for (const pair of pairs) {
    console.log(chalk.cyan(`유사도: ${(pair.sim * 100).toFixed(1)}%`));
    console.log(`  1: ${pair.i.question}`);
    console.log(`  2: ${pair.j.question}\n`);

    const suggestion = await suggestMerge(
      { question: pair.i.question, answer: pair.i.answer },
      { question: pair.j.question, answer: pair.j.answer },
      config.anthropicApiKey,
    );

    console.log(chalk.green(`  병합 제안:`));
    console.log(`    Q: ${suggestion.question}`);
    console.log(`    A: ${suggestion.answer.slice(0, 100)}...`);
    console.log(chalk.dim(`    이유: ${suggestion.explanation}\n`));

    let shouldApply = options.auto ?? false;
    if (!shouldApply) {
      shouldApply = await confirm("  병합할까요? (y/n): ");
    }

    if (shouldApply) {
      // Update first item, archive second
      await updateKBItem(
        db,
        pair.i.id,
        { question: suggestion.question, answer: suggestion.answer },
        config.openaiApiKey,
        { baseUrl: "https://api.openai.com/v1" },
      );
      await archiveKBItem(db, pair.j.id);
      merged++;
      console.log(chalk.green("  병합 완료\n"));
    }
  }

  console.log(chalk.bold(`\n완료: ${merged}건 병합\n`));
}

function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}
```

**Step 5: Commit**

```bash
git add apps/kb-cli/src/commands/
git commit -m "feat(kb-cli): implement list, ingest, improve, dedupe commands"
```

---

## Task 13: KB CLI — Main entry point

**Files:**
- Create: `apps/kb-cli/src/index.ts`

**Step 1: Create index.ts**

```ts
import { Command } from "commander";
import { ingestCommand } from "./commands/ingest.js";
import { improveCommand } from "./commands/improve.js";
import { dedupeCommand } from "./commands/dedupe.js";
import { listCommand } from "./commands/list.js";

const program = new Command();

program
  .name("kb-cli")
  .description("KB Chatbot CLI — 지식 베이스 관리 도구")
  .version("0.0.1");

program
  .command("ingest <path>")
  .description("문서/이미지를 분석하여 Q&A를 자동 생성합니다")
  .option("--auto", "확인 없이 자동으로 모든 Q&A 저장")
  .action(ingestCommand);

program
  .command("improve")
  .description("기존 KB 답변을 AI로 개선합니다")
  .option("--all", "모든 published 항목 개선")
  .option("--category <category>", "특정 카테고리만 개선")
  .option("--id <uuid>", "특정 항목만 개선")
  .option("--auto", "확인 없이 자동 적용")
  .action(improveCommand);

program
  .command("dedupe")
  .description("중복 KB 항목을 검출하고 병합합니다")
  .option("--threshold <number>", "유사도 임계값 (기본: 0.9)")
  .option("--auto", "확인 없이 자동 병합")
  .action(dedupeCommand);

program
  .command("list")
  .description("KB 목록을 조회합니다")
  .option("--status <status>", "상태 필터 (draft/published/archived)")
  .option("--search <query>", "검색어")
  .option("--page <number>", "페이지")
  .action(listCommand);

program.parse();
```

**Step 2: Verify CLI loads**

```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot/apps/kb-cli && npx tsx src/index.ts --help
```

Expected: Shows help with ingest, improve, dedupe, list commands.

**Step 3: Commit**

```bash
git add apps/kb-cli/src/index.ts
git commit -m "feat(kb-cli): main CLI entry point with all commands"
```

---

## Task 14: kb-engine CRUD — Add embeddingOptions passthrough

This task addresses the adjustment noted in Task 12 — `createKBItem` and `updateKBItem` need to accept and forward `embeddingOptions` for CLI's direct OpenAI URL.

**Files:**
- Modify: `packages/kb-engine/src/crud.ts:34-56` (createKBItem)
- Modify: `packages/kb-engine/src/crud.ts:58-84` (updateKBItem)

**Step 1: Update createKBItem signature**

```ts
export async function createKBItem(
  db: Database,
  input: CreateKBItemInput,
  openaiApiKey: string,
  embeddingOptions?: { baseUrl?: string },
) {
  const embedding = await generateEmbedding(input.question, openaiApiKey, embeddingOptions);
  // ...rest unchanged
```

**Step 2: Update updateKBItem signature**

```ts
export async function updateKBItem(
  db: Database,
  id: string,
  input: UpdateKBItemInput,
  openaiApiKey: string,
  embeddingOptions?: { baseUrl?: string },
) {
  let embedding: number[] | undefined;
  if (input.question) {
    embedding = await generateEmbedding(input.question, openaiApiKey, embeddingOptions);
  }
  // ...rest unchanged
```

**Step 3: Build and verify**

```bash
pnpm --filter @kb-chatbot/kb-engine build
```

All existing callers (Workers) don't pass `embeddingOptions`, so they use defaults. No breaking changes.

**Step 4: Commit**

```bash
git add packages/kb-engine/src/crud.ts
git commit -m "feat(kb-engine): add embeddingOptions passthrough to CRUD functions"
```

---

## Task 15: Full build verification and deployment

**Step 1: Full monorepo build**

```bash
cd /home/nvme1/jhkim/00.Projects/kb-chatbot && pnpm build
```

Expected: All packages and apps build successfully.

**Step 2: Verify CLI runs**

```bash
cd apps/kb-cli && npx tsx src/index.ts list --status published
```

Expected: Lists published KB items from the Neon database.

**Step 3: Deploy Workers (if desired)**

```bash
cd apps/workers && npx wrangler deploy
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: KB CLI tool + image support + auto Q&A generation

- Add image_url column to knowledge_items table
- KakaoTalk image responses using basicCard + simpleText
- Parameterize embedding API baseUrl for CLI/Workers flexibility
- KB CLI with ingest, improve, dedupe, list commands
- Claude AI for Q&A generation, Vision, answer improvement
- Dashboard image display in KB pages"
```

---

## Task Dependency Graph

```
Task 1 (DB schema) ─┬─→ Task 2 (CRUD imageUrl) ─→ Task 5 (Workers KB routes)
                     ├─→ Task 3 (search/pipeline) ─→ Task 6 (Kakao response)
                     └─→ Task 7 (Dashboard types) ─→ Task 8 (Dashboard pages)

Task 4 (embedding baseUrl) ─→ Task 14 (CRUD passthrough) ─→ Task 10 (CLI AI)
                                                            ─→ Task 11 (processors)
                                                            ─→ Task 12 (commands)
                                                            ─→ Task 13 (CLI entry)

Task 9 (CLI scaffold) ─→ Task 10, 11, 12, 13

All ─→ Task 15 (build + deploy)
```

Independent branches that can be parallelized:
- **Branch A:** Tasks 1→2→3→5→6 (DB + Workers pipeline)
- **Branch B:** Tasks 1→7→8 (Dashboard)
- **Branch C:** Tasks 4→14→9→10→11→12→13 (CLI)
- **Final:** Task 15
