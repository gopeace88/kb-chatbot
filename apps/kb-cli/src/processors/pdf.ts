import { readFile } from "node:fs/promises";
import pdf from "pdf-parse";

export async function extractTextFromPDF(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const data = await pdf(buffer);
  return data.text;
}
