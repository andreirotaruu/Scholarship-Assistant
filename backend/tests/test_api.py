from fastapi.testclient import TestClient

from backend.main import app


def test_analyze_application_end_to_end(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SCHOLARSAFE_DATABASE", str(tmp_path / "test.db"))
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["submission_enabled"] is False

        response = client.post(
            "/api/applications/analyze",
            json={
                "scholarship_name": "Test STEM Scholarship",
                "url": "https://example.org/apply",
                "fields": [
                    {"field_id": "first_name", "label": "First name", "type": "text"},
                    {
                        "field_id": "challenge",
                        "label": "Describe a technical challenge you overcame",
                        "type": "textarea",
                        "max_length": 1000,
                    },
                    {"field_id": "income", "label": "Annual household income", "type": "text"},
                    {"field_id": "signature", "label": "Electronic signature", "type": "text"},
                    {"field_id": "submit", "label": "Submit application", "type": "submit"},
                ],
            },
        )

    assert response.status_code == 200
    body = response.json()
    actions = {field["field_id"]: field["action"] for field in body["fields"]}
    assert actions == {
        "first_name": "profile_autofill",
        "challenge": "draft_for_review",
        "income": "sensitive",
        "signature": "manual_only",
        "submit": "ignore",
    }
    first_name = next(field for field in body["fields"] if field["field_id"] == "first_name")
    assert first_name["answer"] == "Andrei"
    assert first_name["confidence"] >= 0.9
    draft = next(field for field in body["fields"] if field["field_id"] == "challenge")
    assert draft["requires_review"] is True
    assert draft["facts_used"]
