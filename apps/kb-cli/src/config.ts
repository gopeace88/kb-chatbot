import "dotenv/config";

export function getConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!databaseUrl) throw new Error("DATABASE_URL is required in .env");
  if (!openaiApiKey) throw new Error("OPENAI_API_KEY is required in .env");

  return {
    databaseUrl,
    openaiApiKey,
    get anthropicApiKey() {
      if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is required in .env");
      return anthropicApiKey;
    },
  };
}
