const EMBEDDING_MODEL = "text-embedding-3-small";

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

/**
 * OpenAI text-embedding-3-small로 텍스트 임베딩 생성
 */
export async function generateEmbedding(
  text: string,
  apiKey: string,
): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
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
