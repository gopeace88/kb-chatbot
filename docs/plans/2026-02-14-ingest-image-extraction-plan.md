# PDF 이미지 추출 + Q&A 첨부 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 인제스트 시 PDF 페이지를 이미지로 렌더링하여 R2에 업로드하고, Q&A에 자동 매핑하여 카카오톡 답변에 이미지가 표시되도록 한다.

**Architecture:** PDF → pdfjs-dist로 페이지별 PNG 렌더링 → R2 업로드 → Claude Q&A 생성 시 pageNumber 매핑 → QACandidate.imageUrl에 자동 할당. 이미지 파일은 원본을 R2에 직접 업로드. 검토 UI에서 이미지 미리보기/변경 가능.

**Tech Stack:** pdfjs-dist + canvas (PDF 렌더링), @aws-sdk/client-s3 (R2 업로드), 기존 Hono 서버 + Next.js 대시보드

---

## Task 1: R2 업로드 모듈

**Files:**
- Create: `apps/kb-cli/src/storage/r2.ts`
- Modify: `apps/kb-cli/.env` (R2 credentials 추가)

**Step 1: 의존성 설치**

```bash
cd apps/kb-cli && pnpm add @aws-sdk/client-s3
```

**Step 2: R2 업로드 모듈 작성**

`apps/kb-cli/src/storage/r2.ts`:
```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string; // e.g. https://pub-xxx.r2.dev
}

export function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    throw new Error("R2 환경변수가 설정되지 않았습니다 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL)");
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

function createClient(config: R2Config): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function uploadImageToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
  config: R2Config,
): Promise<string> {
  const client = createClient(config);
  await client.send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${config.publicUrl}/${key}`;
}
```

**Step 3: .env에 R2 설정 추가 (사용자가 직접)**

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=kb-chatbot-images
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

**Step 4: TypeScript 컴파일 확인**

```bash
cd apps/kb-cli && npx tsc --noEmit
```

---

## Task 2: PDF 페이지 렌더링 모듈

**Files:**
- Create: `apps/kb-cli/src/processors/pdf-pages.ts`

**Step 1: 의존성 설치**

```bash
cd apps/kb-cli && pnpm add pdfjs-dist canvas
```

Note: `canvas`는 node-canvas (C++ 빌드 필요). `pdfjs-dist`의 Node.js 빌드가 canvas를 사용하여 PDF를 렌더링.

**Step 2: PDF 페이지 렌더링 모듈 작성**

`apps/kb-cli/src/processors/pdf-pages.ts`:
```ts
import { createCanvas } from "canvas";

interface PageImage {
  pageNum: number;
  image: Buffer; // PNG buffer
}

const TARGET_WIDTH = 1200;

export async function renderPdfPages(pdfBuffer: Buffer): Promise<PageImage[]> {
  // pdfjs-dist Node.js entry (CJS legacy build for node-canvas compat)
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages: PageImage[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const scale = TARGET_WIDTH / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = createCanvas(scaledViewport.width, scaledViewport.height);
    const ctx = canvas.getContext("2d");

    await page.render({
      canvasContext: ctx as any,
      viewport: scaledViewport,
    }).promise;

    pages.push({
      pageNum: i,
      image: canvas.toBuffer("image/png"),
    });
  }

  return pages;
}
```

**Step 3: TypeScript 컴파일 확인**

pdfjs-dist의 타입이 까다로울 수 있음. 컴파일 에러 발생 시 `// @ts-ignore` 또는 타입 선언으로 해결.

```bash
cd apps/kb-cli && npx tsc --noEmit
```

---

## Task 3: 파이프라인에 이미지 추출 통합

**Files:**
- Modify: `apps/kb-cli/src/core/ingest-pipeline.ts`
- Modify: `apps/kb-cli/src/ai/claude.ts` — `generateQAPairs()` 프롬프트 수정

**Step 1: QACandidate에 imageUrl 추가**

`ingest-pipeline.ts`의 QACandidate 인터페이스:
```ts
export interface QACandidate {
  id: string;
  question: string;
  answer: string;
  category: string;
  chunkIndex: number;
  fileName: string;
  isDuplicate: boolean;
  duplicateOf?: { id: string; question: string; similarity: number };
  imageUrl?: string;  // NEW
}
```

IngestConfig 확장:
```ts
export interface IngestConfig {
  openaiApiKey: string;
  r2Config?: R2Config;  // NEW — optional, 없으면 이미지 업로드 스킵
}
```

IngestEvent 타입에 추가:
```ts
| "pages_rendered"  // NEW
```

**Step 2: generateQAPairs 프롬프트에 pageNumber 추가**

`apps/kb-cli/src/ai/claude.ts`의 `generateQAPairs()` 시그니처 변경:
```ts
export async function generateQAPairs(
  chunk: string,
  options?: { startPage?: number },
): Promise<Array<{ question: string; answer: string; category: string; pageNumber?: number }>>
```

프롬프트에 추가:
```
페이지 번호 정보가 있으면 어떤 페이지의 내용인지 "pageNumber" 필드도 포함해줘.
JSON 배열로 응답해:
[{"question": "...", "answer": "...", "category": "...", "pageNumber": 3}]
```

**Step 3: 파이프라인 수정 — PDF인 경우 페이지 렌더링 + R2 업로드**

`runIngestPipeline()` 내부, 각 파일 처리 시:

```ts
// PDF인 경우: 페이지 렌더링 → R2 업로드
let pageImageUrls: Map<number, string> | null = null;

if (file.mimeType === "application/pdf" && config.r2Config) {
  try {
    const pages = await renderPdfPages(file.buffer);
    pageImageUrls = new Map();
    const jobKey = randomUUID().slice(0, 8);
    for (const page of pages) {
      const key = `ingest/${jobKey}/page-${String(page.pageNum).padStart(3, "0")}.png`;
      const url = await uploadImageToR2(page.image, key, "image/png", config.r2Config);
      pageImageUrls.set(page.pageNum, url);
    }
    yield {
      type: "pages_rendered",
      data: {
        fileName: file.name,
        pageCount: pages.length,
        pageImages: Object.fromEntries(pageImageUrls),
      },
    };
  } catch (err) {
    yield { type: "error", data: { fileName: file.name, stage: "page_render", message: String(err) } };
    // Continue without images
  }
}

// 이미지 파일인 경우: 원본을 R2에 업로드
let imageFileUrl: string | null = null;
if (IMAGE_MIME_TYPES.has(file.mimeType) && config.r2Config) {
  try {
    const key = `ingest/${randomUUID().slice(0, 8)}/${file.name}`;
    imageFileUrl = await uploadImageToR2(file.buffer, key, file.mimeType, config.r2Config);
  } catch (err) {
    yield { type: "error", data: { fileName: file.name, stage: "image_upload", message: String(err) } };
  }
}
```

**Step 4: Q&A 생성 후 이미지 URL 매핑**

candidate 생성 시:
```ts
const candidate: QACandidate = {
  // ...existing fields...
  imageUrl: imageFileUrl                          // 이미지 파일이면 원본
    ?? (qa.pageNumber && pageImageUrls?.get(qa.pageNumber))  // PDF면 페이지 매핑
    ?? pageImageUrls?.get(1)                       // 페이지 정보 없으면 1페이지
    ?? undefined,
};
```

**Step 5: chunker에 페이지 정보 보존**

현재 chunker는 페이지 경계를 모름. 간단한 접근: pdf-parse가 추출하는 텍스트에서 `\f` (form feed)를 페이지 구분자로 사용하여 청크에 대략적 시작 페이지를 추적.

`chunker.ts`의 Chunk 인터페이스 확장:
```ts
export interface Chunk {
  text: string;
  index: number;
  startPage?: number;  // NEW — 이 청크의 대략적 시작 페이지
}
```

`chunkText()` 수정: text에 `\f`가 포함되어 있으면 해당 위치를 기반으로 startPage 계산.

**Step 6: TypeScript 컴파일 확인**

```bash
cd apps/kb-cli && npx tsc --noEmit
```

---

## Task 4: 서버 approve에 imageUrl 전달

**Files:**
- Modify: `apps/kb-cli/src/server/routes/ingest.ts`
- Modify: `apps/kb-cli/src/commands/serve.ts`

**Step 1: IngestConfig에 r2Config 전달**

`serve.ts`에서 R2 설정 로드:
```ts
import { getR2Config } from "../storage/r2.js";

// serveCommand 내부:
let r2Config;
try {
  r2Config = getR2Config();
} catch {
  console.log(chalk.yellow("  R2 미설정 — 이미지 업로드 비활성화"));
}
```

`createApp()`에 r2Config 전달 → `createIngestRoutes()`에 전달 → `runPipelineInBackground()`에서 config에 포함.

**Step 2: approve 엔드포인트에 imageUrl 추가**

요청 body 타입:
```ts
items: Array<{
  id: string;
  question: string;
  answer: string;
  category: string;
  imageUrl?: string;  // NEW
}>
```

createKBItem 호출에 imageUrl 추가:
```ts
await createKBItem(db, {
  question: item.question,
  answer: item.answer,
  category: item.category,
  imageUrl: item.imageUrl || candidate.imageUrl,  // 편집된 것 우선, 없으면 파이프라인 것
  createdBy: "kb-cli-ingest",
}, openaiApiKey, { baseUrl: OPENAI_DIRECT_URL });
```

**Step 3: Job 응답에 pageImages 포함**

GET /jobs/:id 응답에 pageImages 맵 추가 (검토 UI에서 페이지 이미지 참조용):
```ts
// Job 인터페이스에 추가
pageImages?: Record<string, string>; // pageNum → R2 URL

// 응답에 포함
return c.json({
  // ...existing...
  pageImages: job.pageImages,
});
```

pipeline의 `pages_rendered` 이벤트에서 job.pageImages 저장.

---

## Task 5: 대시보드 검토 UI에 이미지 지원

**Files:**
- Modify: `apps/dashboard/src/components/ingest/qa-review-list.tsx`
- Modify: `apps/dashboard/src/lib/ingest-api.ts`
- Modify: `apps/dashboard/src/components/ingest/ingest-progress.tsx` (pages_rendered 이벤트)

**Step 1: QACandidate 타입에 imageUrl 추가**

`ingest-api.ts`:
```ts
export interface QACandidate {
  // ...existing...
  imageUrl?: string;  // NEW
}

export interface ApproveItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  imageUrl?: string;  // NEW
}

export interface IngestJob {
  // ...existing...
  pageImages?: Record<string, string>;  // NEW
}
```

**Step 2: 검토 카드에 이미지 미리보기 추가**

`qa-review-list.tsx`에서 각 QACandidate 카드에:
```tsx
{/* 이미지 미리보기 */}
{item.editImageUrl && (
  <img
    src={item.editImageUrl}
    alt="첨부 이미지"
    className="max-h-32 rounded border border-border object-contain"
  />
)}

{/* 이미지 URL 입력 */}
<div>
  <label className="mb-1 block text-xs font-medium text-gray-500">
    이미지 URL (선택)
  </label>
  <Input
    value={item.editImageUrl || ""}
    onChange={(e) => updateField(item.id, "editImageUrl", e.target.value)}
    placeholder="https://... 또는 페이지 이미지 선택"
  />
</div>
```

EditableCandidate에 `editImageUrl` 필드 추가.

**Step 3: 승인 시 imageUrl 전달**

approve 호출에 imageUrl 포함:
```ts
const approveItems: ApproveItem[] = selected.map((it) => ({
  id: it.id,
  question: it.editQuestion,
  answer: it.editAnswer,
  category: it.editCategory,
  imageUrl: it.editImageUrl || undefined,
}));
```

**Step 4: progress에 pages_rendered 이벤트 표시**

`ingest-progress.tsx`에서:
```ts
case "pages_rendered": {
  const fileName = data.fileName as string;
  const pageCount = data.pageCount as number;
  addLog(`[${fileName}] ${pageCount}페이지 이미지 렌더링 + R2 업로드 완료`);
  break;
}
```

**Step 5: TypeScript 컴파일 확인**

```bash
cd apps/dashboard && npx tsc --noEmit
```

---

## Task 6: CLI ingest 명령에 이미지 지원

**Files:**
- Modify: `apps/kb-cli/src/commands/ingest.ts`

CLI에서도 R2 설정이 있으면 이미지를 업로드하도록 수정:

```ts
import { getR2Config } from "../storage/r2.js";

// ingestCommand 내부:
let r2Config;
try {
  r2Config = getR2Config();
} catch {
  // R2 미설정 — 이미지 없이 진행
}

const pipeline = runIngestPipeline(
  files,
  { openaiApiKey: config.openaiApiKey, r2Config },
  db,
);
```

이미지 저장 시 imageUrl 전달:
```ts
await createKBItem(db, {
  // ...existing...
  imageUrl: candidate.imageUrl,
}, config.openaiApiKey, { baseUrl: OPENAI_DIRECT_URL });
```

---

## 신규 파일 (2개)

| # | 파일 | 설명 |
|---|------|------|
| 1 | `apps/kb-cli/src/storage/r2.ts` | R2 업로드 (S3 호환) |
| 2 | `apps/kb-cli/src/processors/pdf-pages.ts` | PDF 페이지 PNG 렌더링 |

## 수정 파일 (8개)

| # | 파일 | 변경 |
|---|------|------|
| 1 | `apps/kb-cli/src/core/ingest-pipeline.ts` | 이미지 렌더링/업로드/매핑 |
| 2 | `apps/kb-cli/src/ai/claude.ts` | pageNumber 프롬프트 |
| 3 | `apps/kb-cli/src/processors/chunker.ts` | startPage 추적 |
| 4 | `apps/kb-cli/src/server/routes/ingest.ts` | imageUrl approve, pageImages |
| 5 | `apps/kb-cli/src/commands/serve.ts` | R2 config 로드 |
| 6 | `apps/kb-cli/src/commands/ingest.ts` | R2 config 전달 |
| 7 | `apps/dashboard/src/components/ingest/qa-review-list.tsx` | 이미지 미리보기/편집 |
| 8 | `apps/dashboard/src/lib/ingest-api.ts` | imageUrl 타입 |
| 9 | `apps/dashboard/src/components/ingest/ingest-progress.tsx` | pages_rendered 이벤트 |

## 의존성

```bash
cd apps/kb-cli && pnpm add @aws-sdk/client-s3 pdfjs-dist canvas
```

## E2E 검증

1. R2 버킷 생성 + .env 설정
2. `npx tsx src/index.ts serve` 시작
3. 대시보드에서 PDF 드래그&드롭
4. "N페이지 이미지 렌더링 + R2 업로드 완료" 로그 확인
5. Q&A 검토 화면에서 이미지 미리보기 확인
6. 이미지 URL 변경 가능 확인
7. 승인 → DB에 imageUrl과 함께 저장 확인
8. KB 목록에서 이미지 확인
