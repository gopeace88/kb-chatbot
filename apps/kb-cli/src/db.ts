import { createDb } from "@kb-chatbot/database";
import { getConfig } from "./config.js";

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) {
    const { databaseUrl } = getConfig();
    _db = createDb(databaseUrl);
  }
  return _db;
}
