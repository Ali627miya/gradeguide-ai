"""Programmatic verification that quoted evidence really appears in the student's submission."""
import re
from difflib import SequenceMatcher

_QUOTE_CHARS = {
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "“": '"', "”": '"', "„": '"', "–": "-", "—": "-", "…": "...",
}


def canon(text: str) -> str:
    """Canonical form used for matching: unify quotes/dashes, collapse whitespace, lower-case."""
    for k, v in _QUOTE_CHARS.items():
        text = text.replace(k, v)
    text = re.sub(r"\s+", " ", text)
    return text.strip().lower()


def strip_wrapping_quotes(quote: str) -> str:
    q = quote.strip()
    while len(q) >= 2 and q[0] in "\"'“‘" and q[-1] in "\"'”’":
        q = q[1:-1].strip()
    return q.rstrip(".").strip() if q.endswith("...") else q


def verify_quote(quote: str, source: str) -> dict:
    """Classify a quote as verified (exact after normalisation), near (>=90% fuzzy), unverified, or none."""
    if not quote or not quote.strip():
        return {"status": "none", "similarity": 0.0, "matched_text": ""}
    q = canon(strip_wrapping_quotes(quote))
    s = canon(source)
    if len(q) < 8:
        return {"status": "unverified", "similarity": 0.0, "matched_text": "", "reason": "Quote too short to verify"}
    if q in s:
        return {"status": "verified", "similarity": 1.0, "matched_text": q}
    # fuzzy: slide a window of the quote's length over the source, using a cheap anchor search first
    best_ratio, best_text = 0.0, ""
    window = len(q)
    anchors = set()
    for word in sorted(set(re.findall(r"[a-z]{6,}", q)), key=len, reverse=True)[:5]:
        for m in re.finditer(re.escape(word), s):
            anchors.add(max(0, m.start() - window))
    starts = sorted(anchors) if anchors else range(0, max(1, len(s) - window + 1), max(1, window // 4))
    for a in starts:
        segment = s[a: a + window * 2]
        sm = SequenceMatcher(None, q, segment, autojunk=False)
        match = sm.find_longest_match(0, len(q), 0, len(segment))
        lo = max(0, match.b - match.a)
        cand = segment[lo: lo + window]
        ratio = SequenceMatcher(None, q, cand, autojunk=False).ratio()
        if ratio > best_ratio:
            best_ratio, best_text = ratio, cand
    if best_ratio >= 0.9:
        return {"status": "near", "similarity": round(best_ratio, 3), "matched_text": best_text}
    return {"status": "unverified", "similarity": round(best_ratio, 3), "matched_text": ""}


def split_sentences(text: str) -> list[str]:
    """Return sentences as exact substrings of the original text (so quotes stay verifiable)."""
    out = []
    for block in re.split(r"\n\s*\n|\n(?=\s*(?:[-*•]|\d+[.)])\s)", text):
        for line in block.split("\n") if len(block) < 120 else [block]:
            for m in re.finditer(r"[^.!?\n]+(?:[.!?]+(?=\s|$)|$)", line):
                sent = m.group(0).strip()
                if len(sent) >= 3:
                    out.append(sent)
    return out


def trim_quote(sentence: str, max_words: int = 40) -> str:
    """Shorten a sentence to its first max_words words while keeping it an exact substring."""
    words = list(re.finditer(r"\S+", sentence))
    if len(words) <= max_words:
        return sentence
    return sentence[: words[max_words - 1].end()]
