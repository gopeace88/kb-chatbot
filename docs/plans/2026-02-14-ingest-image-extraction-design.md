# PDF 이미지 추출 + Q&A 첨부 설계

## 목표

인제스트 파이프라인에서 PDF 페이지를 이미지로 렌더링하여 R2에 업로드하고, Q&A에 자동 매핑한다. 검토 UI에서 이미지 미리보기/변경이 가능하다. 외부 URL/유튜브 링크는 답변 텍스트에 포함한다.

## 결정 사항

- **이미지 저장소**: Cloudflare R2 (S3 호환, 무료 10GB)
- **PDF 추출 방식**: 페이지를 통째로 PNG 렌더링
- **링크 저장**: imageUrl 필드에 이미지, 외부/유튜브 링크는 답변 본문에 포함
- **스키마 변경**: 없음 (기존 imageUrl varchar(1024) 활용)

## 아키텍처

```
PDF 파일
  → pdfjs-dist로 페이지별 PNG 렌더링 (Node.js canvas)
  → R2에 업로드 (S3 PutObject)
  → Q&A 생성 시 Claude가 페이지 번호 매핑
  → QACandidate에 imageUrl 추가
  → 검토 UI에서 미리보기 + 수정
  → 승인 시 imageUrl과 함께 DB 저장
```

## 변경 범위

### 1. R2 업로드 모듈 (신규)

`apps/kb-cli/src/storage/r2.ts`

- `@aws-sdk/client-s3` 사용 (R2는 S3 호환)
- `uploadImage(buffer, key)` → R2 public URL 반환
- 설정: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
- 키 형식: `ingest/{jobId}/{page-001}.png`

### 2. PDF 페이지 렌더링 (신규)

`apps/kb-cli/src/processors/pdf-pages.ts`

- `pdfjs-dist` + `canvas` (node-canvas)로 각 페이지를 PNG Buffer로 렌더링
- `renderPdfPages(buffer)` → `Array<{ pageNum: number; image: Buffer }>`
- 해상도: 적당한 크기 (width 1200px 정도)

### 3. 파이프라인 수정

`apps/kb-cli/src/core/ingest-pipeline.ts`

- PDF 파일인 경우 페이지별 PNG 렌더링 → R2 업로드
- 페이지 이미지 URL 맵: `Map<number, string>` (pageNum → R2 URL)
- Q&A 생성 프롬프트에 "이 Q&A가 몇 페이지 내용인지 `pageNumber` 필드를 포함해" 추가
- QACandidate에 `imageUrl?: string` 필드 추가
- 청크에 페이지 번호 정보 포함 (chunkText에서 페이지 경계 추적)
- 이미지 파일도 원본을 R2에 업로드하여 imageUrl로 사용
- 새 이벤트: `pages_rendered` (페이지 수, R2 URL 목록)

### 4. Claude 프롬프트 수정

`apps/kb-cli/src/ai/claude.ts` — `generateQAPairs()`

현재:
```json
[{"question": "...", "answer": "...", "category": "..."}]
```

변경 후:
```json
[{"question": "...", "answer": "...", "category": "...", "pageNumber": 3}]
```

- pageNumber는 optional (텍스트 파일에는 없음)
- 답변에 유용한 링크가 있으면 답변 본문에 포함하도록 안내

### 5. 서버 수정

`apps/kb-cli/src/server/routes/ingest.ts`

- approve 엔드포인트: `imageUrl` 필드를 createKBItem에 전달
- job 응답에 pageImages 맵 포함 (검토 UI에서 페이지 이미지 참조)

### 6. 검토 UI 수정

`apps/dashboard/src/components/ingest/qa-review-list.tsx`

- 각 Q&A 카드에 이미지 미리보기 추가
- 이미지 URL 변경 가능 (Input 필드)
- 페이지 이미지 드롭다운 선택 (해당 job의 렌더링된 페이지 목록에서)
- 외부 URL 직접 입력도 가능
- 유튜브 링크 입력 시 답변 본문에 자동 추가

### 7. 설정

`.env` 추가:
```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=kb-chatbot-images
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

### 8. 의존성

```bash
cd apps/kb-cli && pnpm add @aws-sdk/client-s3 pdfjs-dist canvas
```

## 데이터 흐름

```
1. PDF 업로드
2. pdfjs-dist로 N페이지 PNG 렌더링
3. N개 이미지를 R2에 업로드 → URL 맵 생성
4. 텍스트 추출 → 청크 분할 (페이지 번호 추적)
5. 청크별 Q&A 생성 (Claude에 pageNumber 요청)
6. QACandidate에 imageUrl = pageImages[pageNumber] 자동 매핑
7. 검토 UI에서 이미지 확인/변경
8. 승인 → createKBItem(..., { imageUrl }) → DB 저장
9. 고객 질문 시 → KB 매치 → 카카오 basicCard(썸네일) + 답변
```

## 이미지/텍스트 파일별 동작

| 파일 타입 | 이미지 처리 |
|-----------|-------------|
| PDF | 페이지별 PNG 렌더링 → R2 → Q&A에 자동 매핑 |
| 이미지 (jpg/png) | 원본을 R2에 업로드 → 모든 Q&A에 해당 이미지 첨부 |
| 텍스트 (txt/md) | imageUrl 없음 (검토 UI에서 수동 추가 가능) |
