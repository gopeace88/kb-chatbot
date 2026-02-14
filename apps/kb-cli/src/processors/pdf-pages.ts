import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

export interface PageImage {
  pageNum: number;
  image: Buffer;
}

const TARGET_WIDTH = 1200;
const MAX_PAGES = 100;

/**
 * PDF → 페이지별 PNG 이미지 렌더링
 *
 * pdftoppm (poppler-utils)을 사용하여 임베디드 이미지 포함 완전한 렌더링.
 * pdftoppm이 없으면 pdfjs-dist 폴백 (이미지 누락 가능).
 */
export async function renderPdfPages(pdfBuffer: Buffer): Promise<PageImage[]> {
  try {
    return await renderWithPdftoppm(pdfBuffer);
  } catch {
    console.warn("[pdf-pages] pdftoppm 실패, pdfjs-dist 폴백 사용");
    return renderWithPdfjs(pdfBuffer);
  }
}

async function renderWithPdftoppm(pdfBuffer: Buffer): Promise<PageImage[]> {
  const tmpDir = await mkdtemp(join(tmpdir(), "kb-pdf-"));

  try {
    const pdfPath = join(tmpDir, "input.pdf");
    await writeFile(pdfPath, pdfBuffer);

    const outputPrefix = join(tmpDir, "page");

    await execFileAsync("pdftoppm", [
      "-png",
      "-r", "150",             // 150 DPI — 충분한 품질 + 적정 파일 크기
      "-l", String(MAX_PAGES), // 최대 페이지 수 제한
      "-scale-to-x", String(TARGET_WIDTH),
      "-scale-to-y", "-1",     // 비율 유지
      pdfPath,
      outputPrefix,
    ], { maxBuffer: 100 * 1024 * 1024 }); // 100MB buffer

    // pdftoppm 출력 파일: page-01.png, page-02.png, ...
    const files = (await readdir(tmpDir))
      .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
      .sort();

    const pages: PageImage[] = [];
    for (const file of files) {
      // 파일명에서 페이지 번호 추출: page-01.png → 1
      const match = file.match(/page-(\d+)\.png$/);
      if (!match) continue;
      const pageNum = parseInt(match[1], 10);
      const image = await readFile(join(tmpDir, file));
      pages.push({ pageNum, image: Buffer.from(image) });
    }

    return pages;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function renderWithPdfjs(pdfBuffer: Buffer): Promise<PageImage[]> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages: PageImage[] = [];
  const pagesToRender = Math.min(doc.numPages, MAX_PAGES);

  for (let i = 1; i <= pagesToRender; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const scale = TARGET_WIDTH / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = createCanvas(scaledViewport.width, scaledViewport.height);
    const ctx = canvas.getContext("2d");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page.render as any)({
      canvasContext: ctx,
      viewport: scaledViewport,
    }).promise;

    pages.push({
      pageNum: i,
      image: Buffer.from(canvas.toBuffer("image/png")),
    });
  }

  return pages;
}
