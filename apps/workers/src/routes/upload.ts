import { Hono } from "hono";
import type { AppEnv } from "../lib/env.js";

const R2_PUBLIC_URL = "https://pub-27d0617b23e74b94af0239ab047e6ab4.r2.dev";

const upload = new Hono<AppEnv>();

// POST /api/upload — 이미지 업로드
upload.post("/", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ error: "file is required" }, 400);
  }

  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowed.includes(file.type)) {
    return c.json({ error: "jpeg, png, gif, webp만 업로드 가능합니다" }, 400);
  }

  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: "파일 크기는 10MB 이하여야 합니다" }, 400);
  }

  const ext = file.name.split(".").pop() || "jpg";
  const key = `kb-images/${crypto.randomUUID()}.${ext}`;

  await c.env.IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  return c.json({ url: `${R2_PUBLIC_URL}/${key}` });
});

export { upload };
