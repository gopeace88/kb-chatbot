const DEFAULT_OPENAI_BASE_URL =
  "https://gateway.ai.cloudflare.com/v1/28b9de8f436a1a7b49eeb39d61b1fefd/kb-chatbot/openai";
const EMBEDDING_MODEL = "text-embedding-3-small";

export interface EmbeddingOptions {
  baseUrl?: string;
}

interface EmbeddingResponse {
  data: Array<{ index: number; embedding: number[] }>;
}

/**
 * OpenAI text-embedding-3-small로 텍스트 임베딩 생성
 */
export async function generateEmbedding(
  text: string,
  apiKey: string,
  options?: EmbeddingOptions,
): Promise<number[]> {
  const baseUrl = options?.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
  const response = await fetch(baseUrl + "/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI Embedding API error: ${response.status} ${error}`);
  }

  const result = (await response.json()) as EmbeddingResponse;
  return result.data[0].embedding;
}

/**
 * 여러 텍스트의 임베딩을 한 번의 API 호출로 일괄 생성
 * OpenAI API는 배열 입력을 지원하므로 수집기에서 효율적으로 사용 가능
 */
export async function generateEmbeddings(
  texts: string[],
  apiKey: string,
  options?: EmbeddingOptions,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) return [await generateEmbedding(texts[0], apiKey, options)];

  const baseUrl = options?.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
  const response = await fetch(baseUrl + "/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI Embedding API error: ${response.status} ${error}`);
  }

  const result = (await response.json()) as EmbeddingResponse;
  // API 응답은 index 기준으로 정렬되지 않을 수 있으므로 정렬
  return result.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
