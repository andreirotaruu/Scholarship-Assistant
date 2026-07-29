def profile_confidence(*, exact_match: bool, verified: bool, ambiguous: bool = False, missing: bool = False) -> float:
    if missing:
        return 0.25
    score = 0.95 if exact_match else 0.86
    if verified:
        score += 0.04
    else:
        score -= 0.22
    if ambiguous:
        score -= 0.14
    return round(max(0.0, min(score, 0.99)), 2)


def generated_confidence(*, facts_count: int, prompt_match: bool, constrained: bool) -> float:
    if facts_count == 0:
        return 0.35
    score = 0.68 + min(facts_count, 4) * 0.035
    if prompt_match:
        score += 0.05
    if constrained:
        score += 0.03
    return round(min(score, 0.88), 2)
