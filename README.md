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

Setup instructions will be completed alongside the backend and extension.
