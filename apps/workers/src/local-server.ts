import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { app } from "./index.js";
import { createLocalEnv, createLocalExecutionContext } from "./lib/local-bindings.js";

function loadDotEnv(path: string, options?: { override?: boolean }): void {
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const value = raw.replace(/^['"]|['"]$/g, "");
    if (options?.override || !process.env[key]) process.env[key] = value;
  }
}

loadDotEnv(resolve(process.cwd(), "../../.env"));
loadDotEnv(resolve(process.cwd(), ".env"));
loadDotEnv(resolve(process.cwd(), "../../.env.local-api"), { override: true });
loadDotEnv(resolve(process.cwd(), ".env.local-api"), { override: true });

const env = createLocalEnv();
const port = Number(process.env.PORT ?? "3458");
const hostname = process.env.HOST ?? "127.0.0.1";

serve(
  {
    hostname,
    port,
    fetch: (request) => app.fetch(request, env, createLocalExecutionContext()),
  },
  (info) => {
    console.log(`kb-chatbot API listening on http://${info.address}:${info.port}`);
  },
);
