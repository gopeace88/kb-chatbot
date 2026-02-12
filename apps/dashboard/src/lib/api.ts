/** Workers API 베이스 URL */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

/**
 * Workers API 클라이언트
 */
export async function apiClient<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { error?: string }).error ||
        `API error: ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}
