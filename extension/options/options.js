import { DEFAULT_API_BASE, loadApiBase, normalizeApiBase } from "../settings.js";

const form = document.getElementById("settings-form");
const input = document.getElementById("api-base");
const status = document.getElementById("status");

loadApiBase().then((value) => { input.value = value; }).catch(() => { input.value = DEFAULT_API_BASE; });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";
  try {
    const apiBase = normalizeApiBase(input.value);
    const url = new URL(apiBase);
    const originPattern = `${url.origin}/*`;
    const hasPermission = await chrome.permissions.contains({ origins: [originPattern] });
    if (!hasPermission) {
      const granted = await chrome.permissions.request({ origins: [originPattern] });
      if (!granted) throw new Error("Access was not granted for that service.");
    }
    await chrome.storage.local.set({ apiBase });
    input.value = apiBase;
    status.textContent = "Connection saved.";
  } catch (error) {
    status.textContent = error.message;
  }
});
