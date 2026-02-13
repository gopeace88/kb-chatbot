import { generateEmbedding, generateEmbeddings } from "@kb-chatbot/kb-engine";

const OPENAI_DIRECT_URL = "https://api.openai.com/v1";

export async function embedText(text: string, apiKey: string): Promise<number[]> {
  return generateEmbedding(text, apiKey, { baseUrl: OPENAI_DIRECT_URL });
}

export async function embedTexts(texts: string[], apiKey: string): Promise<number[][]> {
  return generateEmbeddings(texts, apiKey, { baseUrl: OPENAI_DIRECT_URL });
}
