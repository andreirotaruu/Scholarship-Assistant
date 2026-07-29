from backend.services.essay_generator import draft_from_verified_experiences


def test_only_verified_experiences_are_used() -> None:
    experiences = [
        {
            "title": "Verified project",
            "situation": "A verified problem.",
            "actions": ["Built a verified tool"],
            "results": ["Created a verified result"],
            "themes": ["technology"],
            "verified": True,
        },
        {
            "title": "Unverified award",
            "situation": "An invented story.",
            "actions": ["Won an award"],
            "results": ["Changed the world"],
            "themes": ["technology"],
            "verified": False,
        },
    ]
    result = draft_from_verified_experiences("Describe a technical project", experiences)
    assert result.experiences_used == ["Verified project"]
    assert "award" not in result.draft.lower()
    assert result.requires_review is True


def test_missing_information_is_explicit() -> None:
    result = draft_from_verified_experiences("Describe leadership", [])
    assert result.draft == "MISSING_INFORMATION"
    assert result.missing_information
