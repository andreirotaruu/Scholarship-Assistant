export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000").replace(/\/$/, "");
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? (API_BASE.startsWith("http://localhost") ? "dev-scholar-token" : "");

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (API_TOKEN) headers.set("Authorization", `Bearer ${API_TOKEN}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`ScholarSafe API returned ${response.status}`);
  return response.json() as Promise<T>;
}
