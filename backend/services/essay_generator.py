from __future__ import annotations

import re

from backend.models.schemas import DraftResponse


def _tokens(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-z]{4,}", text.lower()) if token not in {"describe", "about", "their", "would", "could", "should"}}


def draft_from_verified_experiences(
    prompt: str,
    experiences: list[dict],
    max_words: int | None = None,
    max_characters: int | None = None,
) -> DraftResponse:
    verified = [experience for experience in experiences if experience["verified"]]
    prompt_tokens = _tokens(prompt)
    ranked = sorted(
        verified,
        key=lambda item: len(prompt_tokens & _tokens(" ".join([item["title"], *item["themes"], item["situation"]]))),
        reverse=True,
    )
    if not ranked:
        return DraftResponse(
            draft="MISSING_INFORMATION",
            experiences_used=[],
            facts_used=[],
            missing_information=["Add and verify a relevant experience before drafting."],
        )

    experience = ranked[0]
    facts = [*experience["actions"], *experience["results"]]
    if not facts:
        return DraftResponse(
            draft="MISSING_INFORMATION",
            experiences_used=[experience["title"]],
            facts_used=[],
            missing_information=["The selected experience needs verified actions or results."],
        )

    actions = experience["actions"]
    results = experience["results"]
    paragraphs = [experience["situation"].strip()]
    if actions:
        paragraphs.append("I " + "; I ".join(action[0].lower() + action[1:] if action else action for action in actions) + ".")
    if results:
        paragraphs.append("Through this work, I " + "; I ".join(result[0].lower() + result[1:] if result else result for result in results) + ".")
    draft = "\n\n".join(paragraphs)

    if max_words:
        words = draft.split()
        draft = " ".join(words[:max_words])
    if max_characters:
        draft = draft[:max_characters].rstrip()

    return DraftResponse(
        draft=draft,
        experiences_used=[experience["title"]],
        facts_used=facts,
        missing_information=[],
        requires_review=True,
    )
