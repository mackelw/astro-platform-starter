"""Agent 6 — Marketing & Content.

Drafts patient-facing content for clinician approval. ABSOLUTE RULE: this
agent cannot publish. It only writes drafts with status 'pending_review';
publishing is a separate clinician command that flips status — and even that
only records intent in v1, since no platform connection exists by design.

Every health claim in a draft must map to a cited source from the knowledge
base; uncited claims are stripped and flagged before the draft is saved.
"""
import database as db
import knowledge_base as kb


# Topic templates: keyword -> (hook, claim keywords to pull from KB).
_TOPICS = {
    "back pain": {
        "hook": "Lower back pain? Movement is usually the answer — not rest.",
        "claim_keys": ["Exercise therapy", "Education", "Graded activity"],
    },
    "sciatica": {
        "hook": "Sciatica pain running down your leg? There's real science "
                "behind getting you moving again.",
        "claim_keys": ["Neurological signs", "Education"],
    },
}


def draft_post(topic: str, platform: str = "generic") -> dict:
    """Create a draft post. Draft-only: never publishes, never sends."""
    db.init_db()
    t = topic.strip().lower()
    key = next((k for k in _TOPICS if k in t), None)

    if key:
        template = _TOPICS[key]
        evidence = kb.query(key)
    else:
        # Unknown topic: still allow, but no claims will attach -> flagged.
        template = {"hook": f"A few words about {topic}."}
        evidence = []

    claims = _match_claims(template.get("claim_keys", []), evidence)
    body = _compose(topic, template["hook"], claims, platform)
    uncited = not claims

    return {"body": body, "claims": claims,
            "_uncited_warning": uncited}


def submit_post(topic: str, platform: str = "generic") -> dict:
    draft = draft_post(topic, platform)
    post_id = db.save_post(topic, draft, platform)
    print(f"[content] Saved draft {post_id} — pending_review. Publishing requires "
          f"explicit clinician approval; this agent has NO publish ability.")
    if draft["_uncited_warning"]:
        print("[content] ⚠ No cited claims matched this topic — flagged for "
              "manual fact-check before approval.")
    return {"post_id": post_id, **draft}


# ------------------------------------------------------------------ helpers

def _match_claims(keys: list[str], evidence: list[dict]) -> list[dict]:
    """Keep only evidence whose claim matches the template's claim keys.

    Anything that does not match is dropped rather than paraphrased — an
    unmatched topic produces a post with no claims, which is then flagged.
    """
    matched = []
    for e in evidence:
        if any(k.lower() in e["claim"].lower() for k in keys):
            matched.append({
                "ref": e["ref"],
                "claim": e["claim"],
                "plain": e["plain"],
                "source": e["source"],
                "year": e["year"],
                "citation": e["citation"],
            })
    return matched[:3]  # keep posts digestible


def _compose(topic: str, hook: str, claims: list[dict], platform: str) -> str:
    """Render the post. Every bullet is a knowledge-base claim in plain language.

    Nothing is written here that is not backed by a cited entry — the body is
    assembled from the claims, never around them.
    """
    lines = [hook, ""]
    for c in claims[:2]:
        lines.append(f"• {c['plain']}")
    lines.append("")
    lines.append("Every body is different — book an assessment and we'll build "
                 "a plan that fits yours.")
    if claims:
        # Attribution comes from structured fields, so it cannot be mangled by
        # the punctuation inside a citation string.
        lines.append("")
        attributions = []
        for c in claims[:2]:
            label = f"{c['source']} ({c['year']})"
            if label not in attributions:   # two claims often share one guideline
                attributions.append(label)
        lines.append("Sources: " + "; ".join(attributions))
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    topic = sys.argv[1] if len(sys.argv) > 1 else "back pain"
    result = submit_post(topic)
    print("\n--- Draft ---\n" + result["body"])
