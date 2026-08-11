import pytest

from backend.security.auth import configured_tokens, email_for_token


def test_production_requires_explicit_tokens(monkeypatch) -> None:
    monkeypatch.setenv("SCHOLARSAFE_ENV", "production")
    monkeypatch.delenv("SCHOLARSAFE_API_TOKENS", raising=False)
    with pytest.raises(RuntimeError, match="required in production"):
        configured_tokens()


def test_configured_tokens_resolve_exactly(monkeypatch) -> None:
    monkeypatch.setenv("SCHOLARSAFE_API_TOKENS", '{"correct-token":"student@example.edu"}')
    assert email_for_token("correct-token") == "student@example.edu"
    assert email_for_token("correct-token-extra") is None
