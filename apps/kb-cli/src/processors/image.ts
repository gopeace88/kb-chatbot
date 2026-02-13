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
