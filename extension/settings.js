export const DEFAULT_API_BASE = "http://localhost:8000";

export function normalizeApiBase(value) {
  const url = new URL(String(value).trim());
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use an http:// or https:// address.");
  if (url.username || url.password || url.search || url.hash) throw new Error("Enter only the service address, without credentials or query parameters.");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export async function loadApiBase(storage = chrome.storage.local) {
  const result = await storage.get("apiBase");
  return normalizeApiBase(result.apiBase || DEFAULT_API_BASE);
}
