/**
 * 네이버 커머스 API 클라이언트
 *
 * OAuth2 + HMAC 서명 기반 인증, 상품 문의 조회
 * https://apicenter.commerce.naver.com/
 *
 * NOTE: 실제 API 엔드포인트/필드명은 네이버 API 문서 확인 후 조정 필요
 */

const NAVER_API_BASE = "https://api.commerce.naver.com/external";

export interface NaverConfig {
  clientId: string;
  clientSecret: string;
}

/** 네이버 커머스 API에서 반환하는 문의 항목 */
export interface NaverInquiry {
  id: number;
  productOrderId: string;
  productName: string;
  questionTitle: string;
  questionContent: string;
  answerContent: string | null;
  writerNickname: string;
  answered: boolean;
  createdDate: string;
  answeredDate: string | null;
}

interface NaverTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface NaverPaginatedResponse<T> {
  contents: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  page: number;
}

export class NaverCommerceClient {
  private config: NaverConfig;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(config: NaverConfig) {
    this.config = config;
  }

  /**
   * HMAC-SHA256 서명 생성 (Web Crypto API)
   * 네이버 커머스 API는 client_id + "_" + timestamp를 서명
   */
  private async generateSignature(timestamp: string): Promise<string> {
    const message = `${this.config.clientId}_${timestamp}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(this.config.clientSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(message),
    );

    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  /**
   * OAuth2 토큰 발급
   */
  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiry) {
      return this.accessToken;
    }

    const timestamp = String(now);
    const clientSecretSign = await this.generateSignature(timestamp);

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      timestamp,
      client_secret_sign: clientSecretSign,
      grant_type: "client_credentials",
      type: "SELF",
    });

    const response = await fetch(`${NAVER_API_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Naver OAuth error: ${response.status} ${error}`);
    }

    const result = (await response.json()) as NaverTokenResponse;
    this.accessToken = result.access_token;
    // 만료 1분 전에 갱신하도록 설정
    this.tokenExpiry = now + (result.expires_in - 60) * 1000;

    return this.accessToken;
  }

  /**
   * 인증된 API 호출
   */
  private async request<T>(path: string): Promise<T> {
    const token = await this.getToken();

    const response = await fetch(`${NAVER_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Naver API error: ${response.status} ${error}`);
    }

    return (await response.json()) as T;
  }

  /**
   * 상품 문의 목록 조회
   * @param page 페이지 번호 (1부터 시작)
   * @param startDate 조회 시작일 (yyyy-MM-dd)
   */
  async fetchInquiries(
    page = 1,
    startDate?: string,
  ): Promise<{
    inquiries: NaverInquiry[];
    totalPages: number;
    totalElements: number;
  }> {
    const params = new URLSearchParams({
      page: String(page),
      size: "50",
      ...(startDate && { startDate }),
    });

    const data = await this.request<NaverPaginatedResponse<NaverInquiry>>(
      `/v1/contents/qnas?${params}`,
    );

    return {
      inquiries: data.contents,
      totalPages: data.totalPages,
      totalElements: data.totalElements,
    };
  }
}
