import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { Window } from "happy-dom";

const root = new URL("../", import.meta.url);
const port = 8108;
const apiBase = `http://127.0.0.1:${port}`;
const authHeaders = { Authorization: "Bearer dev-scholar-token" };
const databasePath = `/tmp/scholarsafe-flow-${process.pid}.db`;

async function waitForApi() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await delay(100);
  }
  throw new Error("The test API did not start.");
}

async function loadFixture() {
  const [html, extractor, filler] = await Promise.all([
    readFile(new URL("public/demo-application.html", root), "utf8"),
    readFile(new URL("extension/field_extractor.js", root), "utf8"),
    readFile(new URL("extension/field_filler.js", root), "utf8"),
  ]);
  const window = new Window({ url: "http://localhost:3000/demo-application.html" });
  window.document.write(html);
  window.CSS ??= {};
  window.CSS.escape ??= (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  window.eval(extractor);
  window.eval(filler);
  return window;
}

const server = spawn(
  new URL(".venv/bin/python", root).pathname,
  ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", String(port)],
  {
    cwd: root.pathname,
    env: { ...process.env, SCHOLARSAFE_DATABASE: databasePath },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverError = "";
server.stderr.on("data", (chunk) => {
  serverError += chunk.toString();
});

try {
  await waitForApi();
  const window = await loadFixture();
  const fields = window.ScholarSafe.extractFields();
  const analyzeResponse = await fetch(`${apiBase}/api/applications/analyze`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      scholarship_name: "Horizon STEM Scholarship — Safe Test Application",
      url: "http://localhost:3000/demo-application.html",
      deadline: "2026-10-15",
      fields,
    }),
  });
  assert.equal(analyzeResponse.status, 200);
  const application = await analyzeResponse.json();
  const decisions = new Map([
    ["year_in_school", "Junior"],
    ["stem_program", "Yes"],
  ]);

  for (const field of application.fields) {
    const profileReady = field.action === "profile_autofill" && field.confidence >= 0.9;
    const reviewedDraft = field.action === "draft_for_review" && field.answer;
    const userAnswer = decisions.get(field.field_id);
    if (userAnswer) field.answer = userAnswer;
    field.approved = Boolean(profileReady || reviewedDraft || userAnswer);
    if (!field.approved) continue;
    const approval = await fetch(
      `${apiBase}/api/applications/${application.application_id}/fields/${encodeURIComponent(field.field_id)}/approval`,
      {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ answer: field.answer, approved: true }),
      },
    );
    assert.equal(approval.status, 200);
  }

  const blockedConfirmation = await fetch(
    `${apiBase}/api/applications/${application.application_id}/fields/final_confirmation/approval`,
    {
      method: "PATCH",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ answer: "Yes", approved: true }),
    },
  );
  assert.equal(blockedConfirmation.status, 400);

  let submitEvents = 0;
  window.document.getElementById("scholarship-application").addEventListener("submit", () => {
    submitEvents += 1;
  });
  const results = window.ScholarSafe.fillApprovedFields(application.fields);
  const filled = results.filter((result) => result.status === "filled");

  assert.equal(window.document.getElementById("first_name").value, "Andrei");
  assert.equal(window.document.getElementById("last_name").value, "Rotaru");
  assert.equal(window.document.getElementById("major").value, "Computer Science and Mathematics");
  assert.equal(window.document.getElementById("year_in_school").value, "Junior");
  assert.equal(window.document.querySelector('input[name="stem_program"][value="Yes"]').checked, true);
  assert.ok(window.document.getElementById("technical_challenge").value.length > 80);
  assert.equal(window.document.getElementById("volunteer_hours").value, "");
  assert.equal(window.document.getElementById("household_income").value, "");
  assert.equal(window.document.getElementById("electronic_signature").value, "");
  assert.equal(window.document.getElementById("final_confirmation").checked, false);
  assert.equal(window.document.getElementById("submit_application").disabled, true);
  assert.equal(submitEvents, 0);

  process.stdout.write(`${JSON.stringify({
    result: "passed",
    extracted_fields: fields.length,
    approved_fields: application.fields.filter((field) => field.approved).length,
    filled_fields: filled.length,
    manual_or_missing_fields: application.fields.filter((field) =>
      ["ask_user", "sensitive", "manual_only"].includes(field.action) && !field.approved
    ).length,
    submission_triggered: false,
  }, null, 2)}\n`);
} catch (error) {
  if (serverError) process.stderr.write(serverError);
  throw error;
} finally {
  server.kill("SIGTERM");
  await rm(databasePath, { force: true });
}
