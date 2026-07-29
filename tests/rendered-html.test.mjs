import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the ScholarSafe review workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>ScholarSafe — Scholarship Application Copilot<\/title>/i);
  assert.match(html, /Review every answer/);
  assert.match(html, /Nothing is placed on the application until you approve it/);
  assert.match(html, /Fill approved fields/);
  assert.match(html, /only you can review and submit/);
  assert.doesNotMatch(html, /automatic submit/i);
  assert.doesNotMatch(html, /codex-preview/i);
  assert.doesNotMatch(html, /react-loading-skeleton/i);
});

test("does not expose a submit application control", async () => {
  const html = await (await render()).text();
  assert.doesNotMatch(html, /<button[^>]*>\s*Submit(?: application)?\s*<\/button>/i);
  assert.match(html, /Open final review/);
});
