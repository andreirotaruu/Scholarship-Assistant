import assert from "node:assert/strict";
import test from "node:test";

import { normalizeApiBase } from "../extension/settings.js";
import { loadReviewSession, reviewSessionKey, saveReviewSession } from "../extension/session_store.js";

test("normalizes a configurable API base safely", () => {
  assert.equal(normalizeApiBase(" https://api.example.org/v1/ "), "https://api.example.org/v1");
  assert.throws(() => normalizeApiBase("file:///tmp/service"), /http/);
  assert.throws(() => normalizeApiBase("https://user:secret@example.org"), /credentials/);
});

test("review sessions are isolated by tab and page URL", async () => {
  const values = {};
  const storage = {
    async set(next) { Object.assign(values, next); },
    async get(key) { return { [key]: values[key] }; },
  };
  const tab = { id: 42, url: "https://example.org/apply" };
  const application = { application_id: 7, fields: [{ field_id: "name", approved: true }] };
  await saveReviewSession(storage, tab, application);
  assert.deepEqual(await loadReviewSession(storage, tab), application);
  assert.equal(await loadReviewSession(storage, { ...tab, url: "https://example.org/other" }), null);
  assert.ok(values[reviewSessionKey(42)].savedAt);
});
