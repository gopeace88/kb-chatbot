CREATE TABLE IF NOT EXISTS query_embedding_cache (
  text_norm text PRIMARY KEY,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
