/**
 * 키워드 기반 의도 감지
 *
 * 주문/배송 관련 키워드를 감지하여 KB 파이프라인 앞에서 가로챔.
 */

export type Intent = "shipping_inquiry" | "order_inquiry" | "general";

const SHIPPING_KEYWORDS = [
  "배송",
  "택배",
  "운송장",
  "송장",
  "언제 도착",
  "배송추적",
  "배송 추적",
  "배송조회",
  "배송 조회",
  "배달",
  "도착 예정",
  "언제 와",
  "언제 오",
  "배송중",
  "배송완료",
  "출고",
];

const ORDER_KEYWORDS = [
  "주문",
  "주문번호",
  "결제내역",
  "결제 내역",
  "구매내역",
  "구매 내역",
  "주문내역",
  "주문 내역",
  "주문조회",
  "주문 조회",
  "주문확인",
  "주문 확인",
  "내 주문",
];

export function detectIntent(utterance: string): Intent {
  const text = utterance.toLowerCase();

  for (const kw of SHIPPING_KEYWORDS) {
    if (text.includes(kw)) return "shipping_inquiry";
  }

  for (const kw of ORDER_KEYWORDS) {
    if (text.includes(kw)) return "order_inquiry";
  }

  return "general";
}
