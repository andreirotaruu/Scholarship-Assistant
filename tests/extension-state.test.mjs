import assert from "node:assert/strict";
import test from "node:test";

import { normalizeApiBase } from "../extension/settings.js";
import {
  PROGRESS_TTL_MS,
  clearReviewProgress,
  loadReviewSession,
  progressKey,
  refreshApplicationSelectors,
  reviewSessionKey,
  safePageUrl,
  saveReviewSession,
  saveTemporaryReviewSession,
} from "../extension/session_store.js";

class MemoryStorage {
  constructor() { this.values = {}; }
  async set(next) { Object.assign(this.values, next); }
  async get(key) {
    if (key === null) return { ...this.values };
    if (Array.isArray(key)) return Object.fromEntries(key.filter((item) => item in this.values).map((item) => [item, this.values[item]]));
    return { [key]: this.values[key] };
  }
  async remove(key) {
    for (const item of Array.isArray(key) ? key : [key]) delete this.values[item];
  }
}

const application = {
  application_id: 7,
  scholarship_name: "Test Scholarship",
  fields: [
    { field_id: "email", answer: "private@example.edu", approved: true, action: "profile_autofill" },
    { field_id: "income", answer: "", approved: false, action: "sensitive" },
  ],
};

test("normalizes a configurable API base safely", () => {
  assert.equal(normalizeApiBase(" https://api.example.org/v1/ "), "https://api.example.org/v1");
  assert.throws(() => normalizeApiBase("file:///tmp/service"), /http/);
  assert.throws(() => normalizeApiBase("https://user:secret@example.org"), /credentials/);
});

test("temporary review sessions are isolated by tab and exact page URL", async () => {
  const session = new MemoryStorage();
  const persistent = new MemoryStorage();
  const tab = { id: 42, url: "https://example.org/apply/step-1" };
  await saveTemporaryReviewSession(session, tab, application);
  assert.deepEqual((await loadReviewSession(session, persistent, tab, async () => null)).application, application);
  assert.equal((await loadReviewSession(session, persistent, { ...tab, url: "https://example.org/apply/step-2" }, async () => null)).application, null);
  assert.ok(session.values[reviewSessionKey(42)].savedAt);
});

test("persistent progress stores metadata only and restores through FastAPI", async () => {
  const session = new MemoryStorage();
  const persistent = new MemoryStorage();
  const tab = { id: 42, url: "https://example.org/apply/step-1?application_token=secret#private" };
  await saveReviewSession(session, persistent, tab, application, 1_000);

  const storedText = JSON.stringify(persistent.values);
  assert.doesNotMatch(storedText, /private@example\.edu|field_id|income|approved|secret|application_token|#private/);
  assert.match(storedText, /applicationId/);
  assert.equal(safePageUrl(tab.url), "https://example.org/apply/step-1");

  const restored = await loadReviewSession(new MemoryStorage(), persistent, { ...tab, id: 99 }, async (id) => {
    assert.equal(id, 7);
    return application;
  }, 2_000);
  assert.deepEqual(restored.application, application);
});

test("tracks multiple pages from the same application site", async () => {
  const session = new MemoryStorage();
  const persistent = new MemoryStorage();
  await saveReviewSession(session, persistent, { id: 1, url: "https://example.org/apply/step-1" }, application, 1_000);
  await saveReviewSession(session, persistent, { id: 2, url: "https://example.org/apply/step-2" }, { ...application, application_id: 8 }, 2_000);

  const result = await loadReviewSession(session, persistent, { id: 3, url: "https://example.org/apply/step-3" }, async () => null, 3_000);
  assert.equal(result.application, null);
  assert.equal(result.progress.pages.length, 2);
});

test("expired progress is removed instead of restored", async () => {
  const session = new MemoryStorage();
  const persistent = new MemoryStorage();
  const tab = { id: 1, url: "https://example.org/apply" };
  await saveReviewSession(session, persistent, tab, application, 1_000);

  const result = await loadReviewSession(new MemoryStorage(), persistent, tab, async () => application, 1_000 + PROGRESS_TTL_MS + 1);
  assert.equal(result.application, null);
  assert.equal(persistent.values[progressKey(tab.url)], undefined);
});

test("clearing progress removes every temporary page for the same site", async () => {
  const session = new MemoryStorage();
  const persistent = new MemoryStorage();
  const pageOne = { id: 1, url: "https://example.org/apply/step-1" };
  await saveReviewSession(session, persistent, pageOne, application);
  await saveReviewSession(session, persistent, { id: 2, url: "https://example.org/apply/step-2" }, { ...application, application_id: 8 });
  await saveReviewSession(session, persistent, { id: 3, url: "https://other.example/apply" }, application);

  await clearReviewProgress(session, persistent, pageOne);
  assert.equal(session.values[reviewSessionKey(1)], undefined);
  assert.equal(session.values[reviewSessionKey(2)], undefined);
  assert.ok(session.values[reviewSessionKey(3)]);
  assert.equal(persistent.values[progressKey(pageOne.url)], undefined);
});

test("restored reviews refresh selectors injected into the current page", () => {
  const restored = {
    ...application,
    fields: [{ field_id: "custom", selector: "[data-scholar-safe-field=old]", answer: "Approved", approved: true }],
  };
  const refreshed = refreshApplicationSelectors(restored, [
    { field_id: "custom", selector: "[data-scholar-safe-field=new]" },
  ]);
  assert.equal(refreshed.fields[0].selector, "[data-scholar-safe-field=new]");
  assert.equal(refreshed.fields[0].answer, "Approved");
  assert.equal(refreshed.fields[0].approved, true);
});
