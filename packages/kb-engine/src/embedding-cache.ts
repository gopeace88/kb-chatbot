import { sql } from "drizzle-orm";
import { generateEmbedding } from "./embedding.js";

async function executeRows<T>(db: unknown, query: unknown): Promise<T[]> {
  const rows = await (db as { execute: (query: unknown) => Promise<Iterable<T>> })
    .execute(query);
  return Array.from(rows);
}

export async function cachedQueryEmbedding(
  db: unknown,
  text: string,
  apiKey: string,
  opts?: { signal?: AbortSignal },
): Promise<number[]> {
  const norm = text.trim().toLowerCase().replace(/\s+/g, " ");
  const rows = await executeRows<{ e: string }>(db, sql`
    SELECT embedding::text AS e
    FROM query_embedding_cache
    WHERE text_norm = ${norm}
    LIMIT 1
  `);

  if (rows[0]) {
    return JSON.parse(rows[0].e) as number[];
  }

  const embedding = await generateEmbedding(text, apiKey, opts);
  const embeddingStr = `[${embedding.join(",")}]`;

  try {
    await executeRows(db, sql`
      INSERT INTO query_embedding_cache (text_norm, embedding)
      VALUES (${norm}, ${embeddingStr}::vector)
      ON CONFLICT (text_norm) DO NOTHING
    `);
  } catch {
    // Cache writes are best-effort; the freshly generated embedding is still valid.
  }

  return embedding;
}
