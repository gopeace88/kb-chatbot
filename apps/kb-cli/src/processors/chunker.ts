export interface Chunk {
  text: string;
  index: number;
  startPage?: number;
}

export function chunkText(
  text: string,
  maxLength = 1000,
  overlap = 200,
): Chunk[] {
  // Build page boundary map from form feed characters
  // (pdf-parse inserts \f between pages)
  const pageBreaks: number[] = [0]; // page 1 starts at offset 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\f") {
      pageBreaks.push(i + 1);
    }
  }

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + maxLength, text.length);
    const chunkText = text.slice(start, end).trim();

    // Find which page this chunk starts on
    let startPage: number | undefined;
    if (pageBreaks.length > 1) {
      const pageIdx = pageBreaks.findIndex((offset, i) => {
        const next = pageBreaks[i + 1] ?? Infinity;
        return start >= offset && start < next;
      });
      if (pageIdx >= 0) {
        startPage = pageIdx + 1; // 1-based
      }
    }

    chunks.push({ text: chunkText, index, startPage });
    start += maxLength - overlap;
    index++;
  }

  return chunks.filter((c) => c.text.length > 50);
}
