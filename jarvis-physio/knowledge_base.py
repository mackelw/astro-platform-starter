"""Evidence knowledge base.

A small, hand-curated store of clinical claims with citations. Every claim
that reaches a patient or the public — treatment plans, education points,
marketing posts — must trace back to an entry here. Nothing in this system
is allowed to assert a health claim that is not in this file.

Entries are deliberately conservative: guideline-level or systematic-review
level sources only, no single small trials, no mechanism hand-waving.
"""

# Each entry:
#   ref            short stable key other modules cite (evidence_ref)
#   claim          the assertion, in clinical language
#   plain          the same assertion in patient-facing language
#   source         issuing body / first author
#   year           publication year
#   citation       full human-readable reference
#   tags           topic keywords used by query()
_ENTRIES: list[dict] = [
    {
        "ref": "NICE-NG59-exercise",
        "claim": "Exercise therapy reduces pain and disability in low back pain "
                 "and should be the first-line intervention.",
        "plain": "Exercise is the treatment with the strongest evidence for back "
                 "pain — it reduces pain and helps you move better.",
        "source": "NICE NG59",
        "year": 2016,
        "citation": "NICE NG59. Low back pain and sciatica in over 16s: assessment "
                    "and management. National Institute for Health and Care "
                    "Excellence, 2016.",
        "tags": ["back pain", "low back pain", "sciatica", "exercise", "exercise therapy"],
    },
    {
        "ref": "Hayden-2021-exercise",
        "claim": "Exercise therapy produces small-to-moderate improvements in pain "
                 "and function versus no treatment in chronic low back pain.",
        "plain": "Across dozens of trials, people who exercise do better than "
                 "people who wait it out.",
        "source": "Hayden et al., Cochrane Review",
        "year": 2021,
        "citation": "Hayden JA et al. Exercise therapy for chronic low back pain. "
                    "Cochrane Database of Systematic Reviews, 2021.",
        "tags": ["back pain", "low back pain", "chronic", "exercise", "exercise therapy"],
    },
    {
        "ref": "NICE-NG59-education",
        "claim": "Education and reassurance that back pain is common and rarely "
                 "dangerous improves outcomes and reduces unnecessary imaging.",
        "plain": "Understanding that back pain is common and rarely dangerous is "
                 "itself part of the treatment.",
        "source": "NICE NG59",
        "year": 2016,
        "citation": "NICE NG59. Low back pain and sciatica in over 16s: assessment "
                    "and management. National Institute for Health and Care "
                    "Excellence, 2016.",
        "tags": ["back pain", "low back pain", "sciatica", "education", "reassurance"],
    },
    {
        "ref": "Cochrane-graded-activity",
        "claim": "Graded activity and staying active produce better outcomes than "
                 "bed rest for acute low back pain.",
        "plain": "Staying gently active beats resting up — rest slows recovery.",
        "source": "Cochrane Database",
        "year": 2010,
        "citation": "Dahm KT et al. Advice to rest in bed versus advice to stay "
                    "active for acute low back pain and sciatica. Cochrane "
                    "Database of Systematic Reviews, 2010.",
        "tags": ["back pain", "low back pain", "acute", "graded activity", "activity"],
    },
    {
        "ref": "NICE-NG59-neuro",
        "claim": "Neurological signs — progressive weakness, saddle anaesthesia or "
                 "bladder/bowel disturbance — require urgent medical review, not "
                 "conservative management.",
        "plain": "Spreading numbness, worsening weakness, or bladder/bowel changes "
                 "are not physio problems — they need urgent medical review.",
        "source": "NICE NG59",
        "year": 2016,
        "citation": "NICE NG59. Low back pain and sciatica in over 16s: assessment "
                    "and management. National Institute for Health and Care "
                    "Excellence, 2016.",
        "tags": ["sciatica", "neurological signs", "red flags", "cauda equina", "back pain"],
    },
    {
        "ref": "NICE-NG59-manual-therapy",
        "claim": "Manual therapy should be used only as part of a treatment package "
                 "that includes exercise, not as a standalone intervention.",
        "plain": "Hands-on treatment can help, but only alongside exercise — never "
                 "instead of it.",
        "source": "NICE NG59",
        "year": 2016,
        "citation": "NICE NG59. Low back pain and sciatica in over 16s: assessment "
                    "and management. National Institute for Health and Care "
                    "Excellence, 2016.",
        "tags": ["back pain", "low back pain", "manual therapy"],
    },
    {
        "ref": "Nerve-glide-sciatica",
        "claim": "Neural mobilisation may reduce pain and improve function in "
                 "nerve-related leg pain when symptoms are not progressive.",
        "plain": "Gentle nerve-gliding movements can ease leg pain from an "
                 "irritated nerve.",
        "source": "Basson et al., JOSPT",
        "year": 2017,
        "citation": "Basson A et al. The effectiveness of neural mobilization for "
                    "neuromusculoskeletal conditions. Journal of Orthopaedic & "
                    "Sports Physical Therapy, 2017.",
        "tags": ["sciatica", "neural mobilisation", "nerve glide", "leg pain"],
    },
]

_BY_REF = {e["ref"]: e for e in _ENTRIES}


def query(topic: str) -> list[dict]:
    """Return evidence entries matching a topic keyword, best match first.

    Matching is on tags and claim text. Returns copies so callers cannot
    mutate the knowledge base.
    """
    t = (topic or "").strip().lower()
    if not t:
        return []
    scored = []
    for e in _ENTRIES:
        score = 0
        if any(t == tag for tag in e["tags"]):
            score += 3
        elif any(t in tag or tag in t for tag in e["tags"]):
            score += 2
        if t in e["claim"].lower():
            score += 1
        if score:
            scored.append((score, e))
    scored.sort(key=lambda pair: -pair[0])
    return [dict(e) for _, e in scored]


def get(ref: str) -> dict | None:
    """Look up a single entry by its stable ref key."""
    entry = _BY_REF.get(ref)
    return dict(entry) if entry else None


def cite(ref: str) -> str:
    """Full citation string for a ref, or a loud placeholder if unknown."""
    entry = _BY_REF.get(ref)
    return entry["citation"] if entry else f"[UNCITED — unknown ref '{ref}']"


def all_refs() -> list[str]:
    return list(_BY_REF)


if __name__ == "__main__":
    import sys
    term = sys.argv[1] if len(sys.argv) > 1 else "back pain"
    hits = query(term)
    print(f"{len(hits)} entries for '{term}':\n")
    for h in hits:
        print(f"  [{h['ref']}] {h['claim']}")
        print(f"      {h['citation']}\n")
