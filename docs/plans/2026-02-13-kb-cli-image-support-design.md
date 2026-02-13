# KB CLI + Image Support + Auto Q&A Generation — Design

## Date: 2026-02-13

## Problem

CF Workers has CPU limits that prevent heavy processing (PDF parsing, image analysis).
We need a local CLI tool that ingests documents/images, generates Q&A pairs, and manages KB quality.
Additionally, KB items need image URL support for richer KakaoTalk responses.

## Design Decisions

### 1. Architecture: Approach 1 — baseUrl Parameterization

- `kb-engine`'s `generateEmbedding()` gets an optional `baseUrl` parameter
- Workers uses default (CF AI Gateway), CLI passes `https://api.openai.com/v1`
- CLI reuses `@kb-chatbot/kb-engine` for CRUD and embedding
- Heavy AI tasks (Q&A gen, Vision, answer improvement) live in CLI-only `ai/` modules

### 2. AI Model Split

| Task | Provider | Model |
|------|----------|-------|
| Embedding | OpenAI (direct) | text-embedding-3-small |
| Q&A Generation | Claude | claude-sonnet-4-5-20250929 |
| Image/Vision Analysis | Claude | claude-sonnet-4-5-20250929 |
| Answer Improvement | Claude | claude-sonnet-4-5-20250929 |
| Dedup Merge Suggestion | Claude | claude-sonnet-4-5-20250929 |

### 3. Authentication

- `.env` file with `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`

### 4. Interactive Mode

- Default: interactive (y/n confirmation for each change)
- `--auto` flag: apply all changes automatically (script-friendly)

### 5. KakaoTalk Image+Text Response

When KB item has both text and imageUrl:
```
outputs[0]: basicCard — thumbnail(image) + description(230-char summary)
outputs[1]: simpleText — full answer text
quickReplies: feedback buttons
```
When no image: existing `simpleText` only.

## Schema Change

`knowledge_items` table gets `image_url varchar(1024) nullable`.

## KB CLI Structure

```
apps/kb-cli/
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts          # commander entry
│   ├── config.ts         # dotenv + env vars
│   ├── db.ts             # Neon DB direct connection
│   ├── ai/
│   │   ├── claude.ts     # Claude API (Q&A, Vision, improve)
│   │   └── openai.ts     # OpenAI embedding (api.openai.com direct)
│   ├── commands/
│   │   ├── ingest.ts     # doc/image → Q&A auto-generation
│   │   ├── improve.ts    # improve existing KB answers
│   │   ├── dedupe.ts     # duplicate detection
│   │   └── list.ts       # KB list/search
│   └── processors/
│       ├── pdf.ts        # pdf-parse
│       ├── image.ts      # Claude Vision
│       └── chunker.ts    # text chunking
```

### Commands

- `kb-cli ingest <path>` — PDF/image/text → extract → chunk → Q&A pairs → dedup check → save as draft
- `kb-cli improve [--all|--category X|--id UUID]` — improve existing KB answers with context
- `kb-cli dedupe [--threshold 0.9]` — find and merge duplicate KB items
- `kb-cli list [--status published] [--search X]` — view KB items

### Dependencies

- `@kb-chatbot/database` (workspace), `@kb-chatbot/kb-engine` (workspace)
- `commander`, `dotenv`, `pdf-parse`, `chalk`

## Dashboard Changes

- KB list page: thumbnail indicator for items with images
- KB detail page: image preview display
- KB create/edit: imageUrl input field
- API types updated with `imageUrl` field

## Files to Modify

1. `packages/database/src/schema/knowledge-items.ts` — imageUrl column
2. `packages/kb-engine/src/embedding.ts` — baseUrl parameter
3. `packages/kb-engine/src/crud.ts` — imageUrl in CRUD types
4. `packages/kb-engine/src/search.ts` — imageUrl in SearchResult
5. `packages/kb-engine/src/pipeline.ts` — imageUrl in result
6. `apps/workers/src/lib/kakao-response.ts` — basicCard builder
7. `apps/workers/src/routes/kakao.ts` — image response
8. `apps/workers/src/routes/kb.ts` — imageUrl field
9. `apps/dashboard/src/lib/api.ts` — KBItem.imageUrl
10. `apps/dashboard/src/app/kb/detail/page.tsx` — image display
11. `apps/dashboard/src/app/kb/new/page.tsx` — imageUrl input
12. `apps/dashboard/src/app/kb/page.tsx` — thumbnail in list

## New Files (~14)

All under `apps/kb-cli/` as listed in structure above.
