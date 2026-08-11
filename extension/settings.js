export const DEFAULT_API_BASE = "http://localhost:8000";
export const DEFAULT_DEVELOPMENT_TOKEN = "dev-scholar-token";

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

export function normalizeApiToken(value) {
  const token = String(value || "").trim();
  if (!token) throw new Error("Enter the personal API token issued for this ScholarSafe service.");
  if (/\s/.test(token)) throw new Error("The API token cannot contain spaces.");
  return token;
}

export async function loadApiSettings(storage = chrome.storage.local) {
  const result = await storage.get(["apiBase", "apiToken"]);
  const apiBase = normalizeApiBase(result.apiBase || DEFAULT_API_BASE);
  const fallback = apiBase === DEFAULT_API_BASE ? DEFAULT_DEVELOPMENT_TOKEN : "";
  return { apiBase, apiToken: normalizeApiToken(result.apiToken || fallback) };
}

export function authenticatedHeaders(apiToken, headers = {}) {
  return { ...headers, Authorization: `Bearer ${normalizeApiToken(apiToken)}` };
}
