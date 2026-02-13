/**
 * Cafe24 OAuth 토큰 저장소 — DB 오퍼레이션
 *
 * cafe24_tokens 테이블에서 토큰을 읽고/쓰는 구현.
 * Cafe24 access_token은 2시간, refresh_token은 2주 유효.
 */

import { eq } from "drizzle-orm";
import { cafe24Tokens, type Database } from "@kb-chatbot/database";

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  scopes?: string;
}

export interface TokenStore {
  load(mallId: string): Promise<TokenData | null>;
  save(mallId: string, tokens: TokenData): Promise<void>;
}

export class DbTokenStore implements TokenStore {
  constructor(private db: Database) {}

  async load(mallId: string): Promise<TokenData | null> {
    const [row] = await this.db
      .select()
      .from(cafe24Tokens)
      .where(eq(cafe24Tokens.mallId, mallId))
      .limit(1);

    if (!row) return null;

    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      accessTokenExpiresAt: row.accessTokenExpiresAt ?? new Date(0),
      refreshTokenExpiresAt: row.refreshTokenExpiresAt ?? new Date(0),
      scopes: row.scopes ?? undefined,
    };
  }

  async save(mallId: string, tokens: TokenData): Promise<void> {
    await this.db
      .insert(cafe24Tokens)
      .values({
        mallId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
        scopes: tokens.scopes ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: cafe24Tokens.mallId,
        set: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          accessTokenExpiresAt: tokens.accessTokenExpiresAt,
          refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
          scopes: tokens.scopes ?? null,
          updatedAt: new Date(),
        },
      });
  }
}
