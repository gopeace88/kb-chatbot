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

  return chunks.filter((c) => c.text.length > 50);
}
