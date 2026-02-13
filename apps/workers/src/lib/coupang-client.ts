/**
 * 쿠팡 Open API 클라이언트
 *
 * HMAC-SHA256 인증 + 상품 문의(Q&A) 조회
 * https://developers.coupang.com/
 *
 * NOTE: 실제 API 엔드포인트/필드명은 쿠팡 API 문서 확인 후 조정 필요
 */

const COUPANG_API_BASE = "https://api-gateway.coupang.com";

export interface CoupangConfig {
  accessKey: string;
  secretKey: string;
  vendorId: string;
}

/** 쿠팡 API에서 반환하는 문의 항목 */
export interface CoupangInquiry {
  inquiryId: string;
  productId: string;
  productName: string;
  customerName: string;
  content: string;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
}

interface CoupangApiResponse<T> {
  code: string;
  message: string;
  data: T;
}

interface CoupangPaginatedData {
  content: CoupangInquiry[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalElements: number;
  };
}

export class CoupangClient {
  private config: CoupangConfig;

  constructor(config: CoupangConfig) {
    this.config = config;
  }

  /**
   * HMAC-SHA256 서명 생성 (Web Crypto API — CF Workers 호환)
   */
  private async generateSignature(
    method: string,
    path: string,
    datetime: string,
  ): Promise<string> {
    const message = `${datetime}${method}${path}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(this.config.secretKey),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(message),
    );

    return this.arrayBufferToHex(signature);
  }

  private arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * 인증 헤더를 포함한 쿠팡 API 호출
   */
  private async request<T>(
    method: string,
    path: string,
  ): Promise<T> {
    const datetime = this.formatDatetime(new Date());
    const signature = await this.generateSignature(method, path, datetime);

    const authorization = [
      "CEA algorithm=HmacSHA256",
      `access-key=${this.config.accessKey}`,
      `signed-date=${datetime}`,
      `signature=${signature}`,
    ].join(", ");

    const response = await fetch(`${COUPANG_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Coupang API error: ${response.status} ${error}`,
      );
    }

    const result = (await response.json()) as CoupangApiResponse<T>;
    if (result.code !== "SUCCESS" && result.code !== "200") {
      throw new Error(`Coupang API error: ${result.code} ${result.message}`);
    }

    return result.data;
  }

  /**
   * 쿠팡 API 날짜 포맷: yyMMddTHHmmssZ
   */
  private formatDatetime(date: Date): string {
    const y = date.getUTCFullYear().toString().slice(2);
    const M = (date.getUTCMonth() + 1).toString().padStart(2, "0");
    const d = date.getUTCDate().toString().padStart(2, "0");
    const H = date.getUTCHours().toString().padStart(2, "0");
    const m = date.getUTCMinutes().toString().padStart(2, "0");
    const s = date.getUTCSeconds().toString().padStart(2, "0");
    return `${y}${M}${d}T${H}${m}${s}Z`;
  }

  /**
   * 상품 문의 목록 조회
   * @param page 페이지 번호 (1부터 시작)
   * @param createdAfter 이 날짜 이후의 문의만 조회 (ISO string)
   */
  async fetchInquiries(
    page = 1,
    createdAfter?: string,
  ): Promise<{
    inquiries: CoupangInquiry[];
    totalPages: number;
    totalElements: number;
  }> {
    const params = new URLSearchParams({
      page: String(page),
      maxPerPage: "50",
      ...(createdAfter && { createdAtFrom: createdAfter }),
    });

    const path = `/v2/providers/openapi/apis/api/v4/vendors/${this.config.vendorId}/product-qnas?${params}`;
    const data = await this.request<CoupangPaginatedData>("GET", path);

    return {
      inquiries: data.content,
      totalPages: data.pagination.totalPages,
      totalElements: data.pagination.totalElements,
    };
  }
}
