# ScholarSafe

ScholarSafe is a human-in-the-loop scholarship application assistant. It stores
verified student facts and experiences, analyzes ordinary web forms, drafts
answers from traceable evidence, and fills only answers the student approves.
It never submits an application.

## Project structure

- `app/` — student dashboard and application review experience
- `backend/` — FastAPI service, SQLite persistence, and classification logic
- `extension/` — Manifest V3 Chrome extension for ordinary HTML forms
- `db/` — hosted dashboard schema

## Safety contract

1. Only verified profile facts are eligible for high-confidence autofill.
2. Essay drafts may use only verified experience-bank entries.
3. Sensitive, signature, upload, and CAPTCHA fields always remain manual.
4. The extension fills only explicitly approved answers.
5. ScholarSafe never clicks or exposes a submit action.

## Run locally

The dashboard requires Node.js 22 or newer:

```bash
npm install
npm run dev
```

The API requires Python 3.11 or newer (including Python 3.14):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

The API creates `backend/scholarsafe.db` on first launch and seeds an editable
sample profile plus two verified experiences. Override the location with the
`SCHOLARSAFE_DATABASE` environment variable.

## Load the Chrome extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the `extension/` directory.
4. Start the local API, then open an ordinary scholarship form.
5. Select the ScholarSafe extension and choose **Analyze application**.

The MVP supports normal text inputs, textareas, selects, radios, and checkboxes.
Uploads, signatures, CAPTCHAs, sensitive fields, and custom form controls remain
manual. It deliberately contains no automatic submission code.

## Verify

```bash
npm test
python3 -m pytest backend/tests
node --check extension/field_extractor.js
node --check extension/field_filler.js
node --check extension/sidepanel/sidepanel.js
```

API documentation is available at `http://localhost:8000/docs` while the
service is running.

## Prove the complete MVP flow

Open `http://localhost:3000/demo-application.html` after starting the dashboard.
This safe representative application includes profile fields, a select, a radio
group, an essay, missing information, a sensitive question, an upload, a
signature, a final confirmation, and a submit button.

The automated proof runs the real extension extractor and filler against that
form, sends the extracted fields through FastAPI, persists explicit approvals,
and asserts that the final confirmation and submit controls remain untouched:

```bash
npm run prove:flow
```

The test never submits the form. A person can check the final confirmation and
submit the local fixture manually after reviewing the filled values.
