import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const postgresClients = new Map<string, postgres.Sql>();

export function createDb(databaseUrl: string) {
  if (!databaseUrl.includes(".neon.tech")) {
    let sql = postgresClients.get(databaseUrl);
    if (!sql) {
      sql = postgres(databaseUrl);
      postgresClients.set(databaseUrl, sql);
    }
    return drizzlePostgres(sql, { schema });
  }

  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
