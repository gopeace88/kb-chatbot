/**
 * Cafe24 API 클라이언트
 *
 * OAuth2 Bearer 인증 + 자동 토큰 갱신
 * 주요 기능: 고객 검색, 주문/배송 조회, 게시판 Q&A 조회
 *
 * API 문서: https://developers.cafe24.com/docs/api/
 */

import type { TokenStore, TokenData } from "./cafe24-token-store.js";

export interface Cafe24Config {
  mallId: string;
  clientId: string;
  clientSecret: string;
  tokenStore: TokenStore;
}

// ── API 응답 타입 ──

export interface Cafe24Customer {
  member_id: string;
  name: string;
  phone: string;
  cellphone: string;
  email: string;
}

export interface Cafe24Order {
  order_id: string;
  order_date: string;
  order_status: string; // N00: 입금전, N10: 상품준비중, N20: 배송중, N30: 배송완료 등
  items: Cafe24OrderItem[];
}

export interface Cafe24OrderItem {
  item_id: string;
  product_name: string;
  quantity: number;
  order_status: string;
  shipping_code: string | null;
  shipping_company_name: string | null;
  tracking_no: string | null;
}

export interface Cafe24BoardArticle {
  article_no: number;
  writer: string;
  title: string;
  content: string;
  reply_content: string | null;
  created_date: string;
  replied_date: string | null;
  product_no: number | null;
}

// Cafe24 주문 상태 코드 → 한글 라벨
const ORDER_STATUS_LABELS: Record<string, string> = {
  N00: "입금전",
  N10: "상품준비중",
  N20: "배송준비중",
  N21: "배송대기",
  N22: "배송보류",
  N30: "배송중",
  N40: "배송완료",
  C00: "취소신청",
  C10: "취소완료",
  R00: "반품신청",
  R10: "반품완료",
  E00: "교환신청",
  E10: "교환완료",
};

export function getOrderStatusLabel(statusCode: string): string {
  return ORDER_STATUS_LABELS[statusCode] || statusCode;
}

export class Cafe24Client {
  private config: Cafe24Config;
  private cachedToken: TokenData | null = null;

  constructor(config: Cafe24Config) {
    this.config = config;
  }

  // ── 토큰 관리 ──

  private async getAccessToken(): Promise<string> {
    // 캐시된 토큰이 유효하면 재사용
    if (this.cachedToken && new Date() < this.cachedToken.accessTokenExpiresAt) {
      return this.cachedToken.accessToken;
    }

    // DB에서 토큰 로드
    const stored = await this.config.tokenStore.load(this.config.mallId);
    if (stored && new Date() < stored.accessTokenExpiresAt) {
      this.cachedToken = stored;
      return stored.accessToken;
    }

    // access_token 만료 → refresh_token으로 갱신
    if (stored && stored.refreshToken) {
      const refreshed = await this.refreshAccessToken(stored.refreshToken);
      this.cachedToken = refreshed;
      return refreshed.accessToken;
    }

    throw new Error(
      "Cafe24 토큰이 없습니다. /api/cafe24/oauth/start에서 인증을 완료해주세요.",
    );
  }

  private async refreshAccessToken(refreshToken: string): Promise<TokenData> {
    const basicAuth = btoa(
      `${this.config.clientId}:${this.config.clientSecret}`,
    );

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const response = await fetch(
      `https://${this.config.mallId}.cafe24api.com/api/v2/oauth/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cafe24 token refresh failed: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: string;
      refresh_token_expires_at: string;
      scopes: string[];
    };

    const tokens: TokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAt: new Date(data.expires_at),
      refreshTokenExpiresAt: new Date(data.refresh_token_expires_at),
      scopes: data.scopes.join(","),
    };

    await this.config.tokenStore.save(this.config.mallId, tokens);
    return tokens;
  }

  /**
   * 초기 OAuth 인가 코드 → 토큰 교환 (1회성)
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<TokenData> {
    const basicAuth = btoa(
      `${this.config.clientId}:${this.config.clientSecret}`,
    );

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch(
      `https://${this.config.mallId}.cafe24api.com/api/v2/oauth/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cafe24 token exchange failed: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: string;
      refresh_token_expires_at: string;
      scopes: string[];
    };

    const tokens: TokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAt: new Date(data.expires_at),
      refreshTokenExpiresAt: new Date(data.refresh_token_expires_at),
      scopes: data.scopes.join(","),
    };

    await this.config.tokenStore.save(this.config.mallId, tokens);
    this.cachedToken = tokens;
    return tokens;
  }

  // ── API 호출 ──

  private async request<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const url = `https://${this.config.mallId}.cafe24api.com/api/v2${path}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Cafe24-Api-Version": "2024-06-01",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cafe24 API error: ${response.status} ${error}`);
    }

    return (await response.json()) as T;
  }

  // ── 고객 검색 ──

  /**
   * 전화번호로 Cafe24 고객(회원) 검색
   */
  async searchCustomerByPhone(
    phone: string,
  ): Promise<Cafe24Customer | null> {
    const data = await this.request<{ members: Cafe24Customer[] }>(
      `/admin/customers?cellphone=${encodeURIComponent(phone)}`,
    );

    return data.members.length > 0 ? data.members[0] : null;
  }

  // ── 주문/배송 조회 ──

  /**
   * 회원 ID로 최근 주문 목록 조회
   */
  async getOrdersByMemberId(
    memberId: string,
    limit = 5,
  ): Promise<Cafe24Order[]> {
    const data = await this.request<{ orders: Cafe24Order[] }>(
      `/admin/orders?member_id=${encodeURIComponent(memberId)}&limit=${limit}&sort=-order_date`,
    );

    return data.orders;
  }

  /**
   * 주문 상세 조회 (배송 추적번호 포함)
   */
  async getOrderDetail(orderId: string): Promise<Cafe24Order> {
    const data = await this.request<{ order: Cafe24Order }>(
      `/admin/orders/${orderId}`,
    );

    return data.order;
  }

  // ── 게시판 Q&A 조회 ──

  /**
   * 게시판 글 목록 조회 (Q&A 수집용)
   * @param boardNo 게시판 번호 (기본 4 = 상품문의)
   * @param page 페이지 번호
   * @param startDate 이후 작성된 글만 조회 (yyyy-MM-dd)
   */
  async fetchBoardArticles(
    boardNo = 4,
    page = 1,
    startDate?: string,
  ): Promise<{
    articles: Cafe24BoardArticle[];
    totalCount: number;
  }> {
    let path = `/admin/boards/${boardNo}/articles?limit=100&offset=${(page - 1) * 100}`;
    if (startDate) {
      path += `&created_start_date=${startDate}`;
    }

    const data = await this.request<{
      articles: Cafe24BoardArticle[];
      count: number;
    }>(path);

    return {
      articles: data.articles,
      totalCount: data.count,
    };
  }
}
