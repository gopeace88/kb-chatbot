import { createCanvas } from "@napi-rs/canvas";

export interface PageImage {
  pageNum: number;
  image: Buffer;
}

const TARGET_WIDTH = 1200;
const MAX_PAGES = 100;

export async function renderPdfPages(pdfBuffer: Buffer): Promise<PageImage[]> {
  // pdfjs-dist v5 legacy build uses @napi-rs/canvas internally via NodeCanvasFactory
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
