import { DEFAULT_API_BASE, DEFAULT_DEVELOPMENT_TOKEN, loadApiSettings, normalizeApiBase, normalizeApiToken } from "../settings.js";

const form = document.getElementById("settings-form");
const input = document.getElementById("api-base");
const tokenInput = document.getElementById("api-token");
const status = document.getElementById("status");

loadApiSettings().then(({ apiBase, apiToken }) => {
  input.value = apiBase;
  tokenInput.value = apiToken;
}).catch(() => {
  input.value = DEFAULT_API_BASE;
  tokenInput.value = DEFAULT_DEVELOPMENT_TOKEN;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";
  try {
    const apiBase = normalizeApiBase(input.value);
    const apiToken = normalizeApiToken(tokenInput.value);
    const url = new URL(apiBase);
    const originPattern = `${url.origin}/*`;
    const hasPermission = await chrome.permissions.contains({ origins: [originPattern] });
    if (!hasPermission) {
      const granted = await chrome.permissions.request({ origins: [originPattern] });
      if (!granted) throw new Error("Access was not granted for that service.");
    }
    await chrome.storage.local.set({ apiBase, apiToken });
    input.value = apiBase;
    status.textContent = "Connection saved.";
  } catch (error) {
    status.textContent = error.message;
  }
});
