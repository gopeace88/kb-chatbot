import type { Env } from "./env.js";

type KvValue = {
  value: string;
  expiresAt?: number;
};

class MemoryKV {
  private store = new Map<string, KvValue>();

  async get(key: string, type?: "json"): Promise<string | unknown | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    if (type === "json") return JSON.parse(item.value);
    return item.value;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void> {
    const expiresAt = options?.expirationTtl
      ? Date.now() + options.expirationTtl * 1000
      : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

function requiredEnv(name: keyof Env): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optionalEnv(name: keyof Env): string {
  return process.env[name] ?? "";
}

export function createLocalEnv(): Env {
  return {
    DATABASE_URL: requiredEnv("DATABASE_URL"),
    OPENAI_API_KEY: requiredEnv("OPENAI_API_KEY"),
    KAKAO_SKILL_KEY: process.env.LOCAL_KAKAO_SKILL_KEY ?? "",
    CF_ACCESS_BYPASS: process.env.CF_ACCESS_BYPASS ?? "true",

    COUPANG_ACCESS_KEY: optionalEnv("COUPANG_ACCESS_KEY"),
    COUPANG_SECRET_KEY: optionalEnv("COUPANG_SECRET_KEY"),
    COUPANG_VENDOR_ID: optionalEnv("COUPANG_VENDOR_ID"),
    NAVER_CLIENT_ID: optionalEnv("NAVER_CLIENT_ID"),
    NAVER_CLIENT_SECRET: optionalEnv("NAVER_CLIENT_SECRET"),

    CAFE24_MALL_ID: optionalEnv("CAFE24_MALL_ID"),
    CAFE24_CLIENT_ID: optionalEnv("CAFE24_CLIENT_ID"),
    CAFE24_CLIENT_SECRET: optionalEnv("CAFE24_CLIENT_SECRET"),

    KAKAO_ADMIN_KEY: optionalEnv("KAKAO_ADMIN_KEY"),
    KAKAO_REST_API_KEY: optionalEnv("KAKAO_REST_API_KEY"),

    NEON_API_KEY: optionalEnv("NEON_API_KEY"),
    CF_API_TOKEN: optionalEnv("CF_API_TOKEN"),
    CF_ACCOUNT_ID: optionalEnv("CF_ACCOUNT_ID"),

    IMAGES: {
      put: async () => {
        throw new Error("R2 upload is not configured in local API mode");
      },
    } as unknown as R2Bucket,

    RATE_LIMIT: new MemoryKV() as unknown as KVNamespace,
    BLOCKED_TERMS_CACHE: new MemoryKV() as unknown as KVNamespace,
  };
}

export function createLocalExecutionContext(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) {
      promise.catch((err) => console.error("[waitUntil]", err));
    },
    passThroughOnException() {},
  } as ExecutionContext;
}
