import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Window } from "happy-dom";

const projectRoot = new URL("../", import.meta.url);

async function createFixture() {
  const [html, extractor, filler] = await Promise.all([
    readFile(new URL("public/demo-application.html", projectRoot), "utf8"),
    readFile(new URL("extension/field_extractor.js", projectRoot), "utf8"),
    readFile(new URL("extension/field_filler.js", projectRoot), "utf8"),
  ]);
  const window = new Window({ url: "http://localhost:3000/demo-application.html" });
  window.document.write(html);
  window.CSS ??= {};
  window.CSS.escape ??= (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  window.eval(extractor);
  window.eval(filler);
  return window;
}

async function createRealPatternFixture() {
  const [html, extractor, filler] = await Promise.all([
    readFile(new URL("tests/fixtures/real-form-pattern.html", projectRoot), "utf8"),
    readFile(new URL("extension/field_extractor.js", projectRoot), "utf8"),
    readFile(new URL("extension/field_filler.js", projectRoot), "utf8"),
  ]);
  const window = new Window({ url: "https://scholarship.example/apply" });
  window.document.write(html);
  window.CSS ??= {};
  window.CSS.escape ??= (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  window.eval(extractor);
  window.eval(filler);
  return window;
}

async function createReactPatternFixture() {
  const [html, extractor] = await Promise.all([
    readFile(new URL("tests/fixtures/react-application-pattern.html", projectRoot), "utf8"),
    readFile(new URL("extension/field_extractor.js", projectRoot), "utf8"),
  ]);
  const window = new Window({ url: "https://application.example/student" });
  window.document.write(html);
  window.CSS ??= {};
  window.CSS.escape ??= (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  window.eval(extractor);
  return window;
}

test("extracts the representative scholarship form without duplicate radio groups", async () => {
  const window = await createFixture();
  const fields = window.ScholarSafe.extractFields();
  const byId = new Map(fields.map((field) => [field.field_id, field]));

  assert.equal(byId.has("application_token"), false);
  assert.equal(byId.get("first_name").label, "First name *");
  assert.equal(byId.get("first_name").required, true);
  assert.equal(byId.get("technical_challenge").type, "textarea");
  assert.equal(byId.get("technical_challenge").max_length, 1200);
  assert.deepEqual(Array.from(byId.get("year_in_school").options), [
    "Choose one", "First year", "Sophomore", "Junior", "Senior", "Graduate student",
  ]);

  const stemFields = fields.filter((field) => field.field_id === "stem_program");
  assert.equal(stemFields.length, 1);
  assert.equal(stemFields[0].label, "Are you currently enrolled in a STEM program?");
  assert.deepEqual(Array.from(stemFields[0].options), ["Yes", "No"]);
  assert.equal(byId.get("submit_application").type, "submit");
});

test("fills only explicitly approved fields and never submits", async () => {
  const window = await createFixture();
  const document = window.document;
  let submitEvents = 0;
  document.getElementById("scholarship-application").addEventListener("submit", () => {
    submitEvents += 1;
  });

  const fields = window.ScholarSafe.extractFields();
  const suggestions = fields.map((field) => ({
    ...field,
    answer: "",
    approved: false,
  }));
  const approve = (fieldId, answer) => {
    const suggestion = suggestions.find((field) => field.field_id === fieldId);
    suggestion.answer = answer;
    suggestion.approved = true;
  };

  approve("first_name", "Andrei");
  approve("last_name", "Rotaru");
  approve("email", "example@email.com");
  approve("university", "Marquette University");
  approve("major", "Computer Science and Mathematics");
  approve("graduation_date", "May 2028");
  approve("year_in_school", "Junior");
  approve("stem_program", "Yes");
  approve("technical_challenge", "A reviewed draft based only on verified experience.");

  const results = window.ScholarSafe.fillApprovedFields(suggestions);
  assert.equal(results.filter((result) => result.status === "filled").length, 9);
  assert.equal(document.getElementById("first_name").value, "Andrei");
  assert.equal(document.getElementById("major").value, "Computer Science and Mathematics");
  assert.equal(document.getElementById("year_in_school").value, "Junior");
  assert.equal(document.querySelector('input[name="stem_program"][value="Yes"]').checked, true);
  assert.match(document.getElementById("technical_challenge").value, /reviewed draft/);

  assert.equal(document.getElementById("volunteer_hours").value, "");
  assert.equal(document.getElementById("household_income").value, "");
  assert.equal(document.getElementById("electronic_signature").value, "");
  assert.equal(document.getElementById("final_confirmation").checked, false);
  assert.equal(document.getElementById("submit_application").disabled, true);
  assert.equal(submitEvents, 0);
});

test("refuses direct attempts to fill submit, upload, and password controls", async () => {
  const window = await createFixture();
  const fields = window.ScholarSafe.extractFields();
  const blocked = fields
    .filter((field) => ["submit_application", "transcript"].includes(field.field_id))
    .map((field) => ({ ...field, answer: "unsafe", approved: true }));
  const results = window.ScholarSafe.fillApprovedFields(blocked);
  assert.ok(results.every((result) => result.status === "manual_only"));
  assert.equal(window.document.getElementById("submit_application").disabled, true);
});

test("scopes extraction to the real scholarship form pattern", async () => {
  const window = await createRealPatternFixture();
  const fields = window.ScholarSafe.extractFields();
  const byName = new Map(fields.map((field) => [field.field_id, field]));

  assert.equal(fields.length, 10);
  assert.equal(fields.some((field) => /newsletter|subscribe|username/i.test(`${field.field_id} ${field.label}`)), false);
  assert.equal(byName.get("email").label.toLowerCase(), "email address *");
  assert.equal(byName.get("email").selector, "#scholarship-form #email");
  assert.match(byName.get("essay").label.toLowerCase(), /essay/);
  assert.equal(byName.get("essay").type, "file");
});

test("uses human labels for React controls and opaque application field IDs", async () => {
  const window = await createReactPatternFixture();
  const fields = window.ScholarSafe.extractFields();
  const byId = new Map(fields.map((field) => [field.field_id, field]));

  assert.equal(byId.get("1CVP8h93SiERDeSoz4eH6x").label, "Email address");
  assert.equal(byId.get("react-select-5-input").label, "State or Province *");
  assert.equal(byId.get("react-select-5-input").type, "combobox");
  assert.equal(byId.get("1CVP8esG6XF2CfF3DQUZVe.line1").label, "Street address");
  assert.equal(byId.get("1CVP8esG6XF2CfF3DQUZVe.line2").label, "Address line 2");
  assert.equal(byId.get("1CVP8esG6XF2CfF3DQUZVe.city").label, "City");
  assert.equal(byId.get("1CVP8esG6XF2CfF3DQUZVe.postal").label, "Postal code");
  assert.equal(byId.has("1CVP8totallyOpaqueValue"), false);
  assert.equal(fields.some((field) => /backspace|react-select-\d+-input/i.test(field.label)), false);
});

test("does not extract controls hidden by an eligibility gate", async () => {
  const window = await createRealPatternFixture();
  window.document.getElementById("scholarship-form").style.display = "none";
  assert.deepEqual(Array.from(window.ScholarSafe.extractFields()), []);
});

test("fills only the scoped application field on a page with duplicate IDs", async () => {
  const window = await createRealPatternFixture();
  const scholarshipForm = window.document.getElementById("scholarship-form");
  let submitEvents = 0;
  scholarshipForm.addEventListener("submit", () => { submitEvents += 1; });
  const fields = window.ScholarSafe.extractFields();
  const email = fields.find((field) => field.field_id === "email");
  const upload = fields.find((field) => field.field_id === "essay");
  const submit = fields.find((field) => field.type === "submit");

  const results = window.ScholarSafe.fillApprovedFields([
    { ...email, answer: "reviewed@example.edu", approved: true },
    { ...upload, answer: "essay.pdf", approved: true },
    { ...submit, answer: "submit", approved: true },
  ]);

  assert.equal(scholarshipForm.querySelector("#email").value, "reviewed@example.edu");
  assert.equal(window.document.querySelector("#newsletter #email").value, "");
  assert.deepEqual(Array.from(results, (result) => result.status), ["filled", "manual_only", "manual_only"]);
  assert.equal(submitEvents, 0);
});
