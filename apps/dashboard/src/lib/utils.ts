/**
 * className 조합 유틸리티 (cn)
 * shadcn/ui 추가 시 clsx + tailwind-merge로 교체 예정
 */
export function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}
