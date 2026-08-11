from fastapi.testclient import TestClient

from backend.main import app


AUTH_HEADERS = {"Authorization": "Bearer dev-scholar-token"}


def test_analyze_application_end_to_end(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SCHOLARSAFE_DATABASE", str(tmp_path / "test.db"))
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["submission_enabled"] is False
        assert client.get("/api/profile").status_code == 401
        client.headers.update(AUTH_HEADERS)

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
        application_id = response.json()["application_id"]
        restored = client.get(f"/api/applications/{application_id}")
        approved = client.patch(
            f"/api/applications/{application_id}/fields/first_name/approval",
            json={"answer": "Andrei", "approved": True},
        )
        restored_after_approval = client.get(f"/api/applications/{application_id}")
        application_list = client.get("/api/applications")

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
    assert restored.status_code == 200
    assert restored.json()["application_id"] == body["application_id"]
    assert restored.json()["fields"] == body["fields"]
    assert approved.status_code == 200
    restored_first_name = next(field for field in restored_after_approval.json()["fields"] if field["field_id"] == "first_name")
    assert restored_first_name["approved"] is True
    assert application_list.json()[0]["fields_completed"] == 1


def test_experience_create_and_verify(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SCHOLARSAFE_DATABASE", str(tmp_path / "experiences.db"))
    with TestClient(app) as client:
        client.headers.update(AUTH_HEADERS)
        created = client.post(
            "/api/experiences",
            json={
                "title": "Peer tutoring",
                "situation": "A classmate needed help understanding recursion.",
                "actions": ["Made visual examples", "Practiced problems together"],
                "results": ["The classmate completed the assignment independently"],
                "themes": ["service", "communication"],
                "verified": False,
            },
        )
        assert created.status_code == 201
        experience = created.json()
        assert experience["verified"] is False

        experience["verified"] = True
        updated = client.put(f"/api/experiences/{experience['id']}", json=experience)
        assert updated.status_code == 200
        assert updated.json()["verified"] is True

        verified = client.get("/api/experiences?verified_only=true")
        assert verified.status_code == 200
        assert any(item["title"] == "Peer tutoring" for item in verified.json())


def test_users_cannot_read_or_mutate_each_others_records(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("SCHOLARSAFE_DATABASE", str(tmp_path / "ownership.db"))
    monkeypatch.setenv(
        "SCHOLARSAFE_API_TOKENS",
        '{"alice-token":"alice@example.edu","bob-token":"bob@example.edu"}',
    )
    alice = {"Authorization": "Bearer alice-token"}
    bob = {"Authorization": "Bearer bob-token"}
    with TestClient(app) as client:
        alice_profile = client.put(
            "/api/profile",
            headers=alice,
            json={"fields": [{"path": "personal.first_name", "label": "First name", "value": "Alice", "verified": True}]},
        )
        assert alice_profile.status_code == 200
        bob_fields = client.get("/api/profile", headers=bob).json()["fields"]
        assert next(field for field in bob_fields if field["path"] == "personal.email")["value"] == "bob@example.edu"
        assert all(field["value"] != "Alice" for field in bob_fields)

        experience = client.post(
            "/api/experiences",
            headers=alice,
            json={
                "title": "Alice project",
                "situation": "A verified Alice-only situation.",
                "actions": ["Built it"],
                "results": ["Completed it"],
                "themes": ["ownership"],
                "verified": True,
            },
        ).json()
        assert client.get("/api/experiences", headers=bob).json() == []
        assert client.put(f"/api/experiences/{experience['id']}", headers=bob, json=experience).status_code == 404

        analyzed = client.post(
            "/api/applications/analyze",
            headers=alice,
            json={
                "scholarship_name": "Private Scholarship",
                "url": "https://example.org/private-apply",
                "fields": [{"field_id": "first_name", "label": "First name", "type": "text"}],
            },
        ).json()
        assert client.get(f"/api/applications/{analyzed['application_id']}", headers=bob).status_code == 404
        assert client.get("/api/applications", headers=bob).json() == []
