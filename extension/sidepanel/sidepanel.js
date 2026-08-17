import { authenticatedHeaders, loadApiSettings } from "../settings.js";
import { clearReviewProgress, loadReviewSession, refreshApplicationSelectors, saveReviewSession, saveTemporaryReviewSession } from "../session_store.js";

let apiBase = "http://localhost:8000";
let apiToken = "";
let application = null;
const fieldSaveQueues = new Map();

const byId = (id) => document.getElementById(id);
const emptyState = byId("empty-state");
const reviewState = byId("review-state");
const errorState = byId("error-state");
const continuationState = byId("continuation-state");

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Open a scholarship application tab first.");
  return tab;
}

async function messageTab(message) {
  const tab = await activeTab();
  return chrome.tabs.sendMessage(tab.id, message);
}

async function persistApproval(field, approved) {
  const response = await fetch(
    `${apiBase}/api/applications/${application.application_id}/fields/${encodeURIComponent(field.field_id)}/approval`,
    {
      method: "PATCH",
      headers: authenticatedHeaders(apiToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({ answer: field.answer, approved })
    }
  );
  if (response.status === 401) throw new Error("Your personal API token was rejected. Update it in ScholarSafe settings.");
  if (!response.ok) throw new Error(`Approval could not be saved (${response.status}).`);
}

function queueFieldSave(field, approved) {
  const previous = fieldSaveQueues.get(field.field_id) || Promise.resolve();
  const queued = previous.catch(() => {}).then(() => persistApproval(field, approved));
  fieldSaveQueues.set(field.field_id, queued);
  const cleanup = () => {
    if (fieldSaveQueues.get(field.field_id) === queued) fieldSaveQueues.delete(field.field_id);
  };
  queued.then(cleanup, cleanup);
  return queued;
}

async function persistSession({ persistent = true } = {}) {
  if (!application) return;
  const tab = await activeTab();
  if (persistent) await saveReviewSession(chrome.storage.session, chrome.storage.local, tab, application);
  else await saveTemporaryReviewSession(chrome.storage.session, tab, application);
}

function stateFor(field) {
  if (["sensitive", "manual_only", "ignore"].includes(field.action)) return "manual";
  if (!field.answer || field.confidence < 0.7) return "missing";
  if (field.approved) return "approved";
  return "review";
}

function render() {
  byId("application-title").textContent = application.scholarship_name;
  const visibleFields = application.fields.filter((field) => field.action !== "ignore");
  const approved = visibleFields.filter((field) => field.approved).length;
  const review = visibleFields.filter((field) => stateFor(field) === "review").length;
  const missing = visibleFields.filter((field) => ["missing", "manual"].includes(stateFor(field))).length;
  byId("summary").textContent = `${approved} approved · ${review} to review · ${missing} missing or manual`;
  byId("progress-bar").style.width = `${visibleFields.length ? approved / visibleFields.length * 100 : 0}%`;
  const list = byId("field-list");
  list.replaceChildren();

  application.fields.filter((field) => field.action !== "ignore").forEach((field) => {
    const fragment = byId("field-template").content.cloneNode(true);
    const card = fragment.querySelector(".field-card");
    const state = stateFor(field);
    card.dataset.state = state;
    card.dataset.approved = String(field.approved);
    const stateLabel = card.querySelector(".state");
    stateLabel.classList.add(state === "approved" ? "ready" : state);
    stateLabel.textContent = state === "approved" ? "Approved" : state === "manual" ? "Manual only" : state === "missing" ? "Information needed" : "Review needed";
    card.querySelector(".confidence").textContent = field.action === "sensitive" ? "Sensitive" : `${Math.round(field.confidence * 100)}%`;
    card.querySelector("label").textContent = field.label || field.field_id;
    const textarea = card.querySelector("textarea");
    textarea.value = field.answer || "";
    textarea.placeholder = state === "manual" ? "Enter this directly on the scholarship website" : "Add an answer";
    textarea.disabled = state === "manual";
    textarea.addEventListener("input", () => {
      const wasApproved = field.approved;
      field.answer = textarea.value;
      if (field.approved) field.approved = false;
      if (wasApproved) queueFieldSave(field, false).catch(() => {});
      persistSession({ persistent: false });
    });
    textarea.addEventListener("blur", async () => {
      try {
        await queueFieldSave(field, false);
        await persistSession();
      } finally {
        render();
      }
    });
    card.querySelector(".source").textContent = field.source ? `Source: ${field.source}` : field.reason;
    const details = card.querySelector("details");
    if (!field.facts_used?.length) details.remove();
    else {
      const ul = details.querySelector("ul");
      field.facts_used.forEach((fact) => {
        const li = document.createElement("li");
        li.textContent = fact;
        ul.append(li);
      });
    }
    const approve = card.querySelector(".approve");
    const reject = card.querySelector(".reject");
    if (state === "manual") {
      card.querySelector(".field-actions").remove();
    } else {
      approve.textContent = field.approved ? "✓ Approved" : "Approve";
      approve.disabled = !field.answer.trim();
      approve.addEventListener("click", async () => {
        const nextApproved = !field.approved;
        approve.disabled = true;
        try {
          await queueFieldSave(field, nextApproved);
          field.approved = nextApproved;
          await persistSession();
          render();
        } catch (error) {
          approve.disabled = false;
          card.querySelector(".source").textContent = error.message;
        }
      });
      reject.addEventListener("click", async () => {
        reject.disabled = true;
        const previousAnswer = field.answer;
        field.answer = "";
        try {
          await queueFieldSave(field, false);
          field.approved = false;
          await persistSession();
          render();
        } catch (error) {
          field.answer = previousAnswer;
          reject.disabled = false;
          card.querySelector(".source").textContent = error.message;
        }
      });
    }
    list.append(fragment);
  });
}

async function analyze() {
  emptyState.hidden = true;
  reviewState.hidden = true;
  errorState.hidden = true;
  continuationState.hidden = true;
  try {
    ({ apiBase, apiToken } = await loadApiSettings());
    const page = await messageTab({ type: "SCHOLARSAFE_EXTRACT_FIELDS" });
    if (!page.fields?.length) {
      throw new Error("No visible scholarship application fields were found. Complete any eligibility or terms step on the page, then try again.");
    }
    const response = await fetch(`${apiBase}/api/applications/analyze`, {
      method: "POST",
      headers: authenticatedHeaders(apiToken, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        scholarship_name: page.title || "Scholarship application",
        url: page.url,
        fields: page.fields
      })
    });
    if (response.status === 401) throw new Error("Your personal API token was rejected. Update it in ScholarSafe settings.");
    if (!response.ok) throw new Error(`The ScholarSafe service returned ${response.status}.`);
    application = await response.json();
    await persistSession();
    reviewState.hidden = false;
    render();
  } catch (error) {
    errorState.hidden = false;
    byId("error-message").textContent = error.message.includes("Receiving end")
      ? "This page cannot be inspected. Try an ordinary scholarship form in a regular browser tab."
      : `${error.message} Check the ScholarSafe service address in settings.`;
  }
}

async function restore() {
  try {
    ({ apiBase, apiToken } = await loadApiSettings());
    const tab = await activeTab();
    const restored = await loadReviewSession(
      chrome.storage.session,
      chrome.storage.local,
      tab,
      async (applicationId) => {
        const response = await fetch(`${apiBase}/api/applications/${applicationId}`, { headers: authenticatedHeaders(apiToken) });
        if (!response.ok) throw new Error("Saved application could not be restored.");
        return response.json();
      },
    );
    application = restored.application;
    if (!application && restored.progress) {
      continuationState.hidden = false;
      byId("continuation-copy").textContent = `ScholarSafe remembers ${restored.progress.pages.length} page${restored.progress.pages.length === 1 ? "" : "s"} from this application site. Analyze this page to continue.`;
      return;
    }
    if (!application) return;
    const currentPage = await messageTab({ type: "SCHOLARSAFE_EXTRACT_FIELDS" });
    application = refreshApplicationSelectors(application, currentPage.fields);
    await persistSession({ persistent: false });
    emptyState.hidden = true;
    reviewState.hidden = false;
    render();
  } catch {
    // The normal empty state remains available when this tab has no session.
  }
}

byId("analyze").addEventListener("click", analyze);
byId("retry").addEventListener("click", analyze);
byId("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
byId("clear-progress").addEventListener("click", async () => {
  await clearReviewProgress(chrome.storage.session, chrome.storage.local, await activeTab());
  application = null;
  reviewState.hidden = true;
  errorState.hidden = true;
  continuationState.hidden = true;
  emptyState.hidden = false;
});
byId("fill").addEventListener("click", async () => {
  if (!application) return;
  const approved = application.fields.filter((field) => field.approved && !["sensitive", "manual_only", "ignore"].includes(field.action));
  const response = await messageTab({ type: "SCHOLARSAFE_FILL_APPROVED", fields: approved });
  const filled = response.results.filter((item) => item.status === "filled").length;
  byId("fill").textContent = `${filled} approved field${filled === 1 ? "" : "s"} filled ✓`;
});
byId("final-review").addEventListener("click", () => {
  const approved = application.fields.filter((field) => field.approved).length;
  const remaining = application.fields.filter((field) => !field.approved && field.action !== "ignore").length;
  byId("final-summary").replaceChildren();
  [["Approved answers", approved], ["Remaining checks", remaining], ["Automatic submission", "Disabled"]].forEach(([label, value]) => {
    const row = document.createElement("div");
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    byId("final-summary").append(row);
  });
  byId("final-dialog").showModal();
});
byId("close-dialog").addEventListener("click", () => byId("final-dialog").close());
restore();
