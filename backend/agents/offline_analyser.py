"""Offline rubric simulator (used when no OpenAI key is configured).

This is NOT artificial intelligence. It is a transparent, rule-based text analyser that looks for
measurable signals (citations, evaluative language, headings, justification, tests, error handling...)
for each rubric category. It genuinely reads the submitted text - nothing is hard-coded - so a revised
draft really is re-assessed. Every result it produces is labelled "Simulated" in the API and UI.
Quotations are always exact substrings of the submission.
"""
import re
from dataclasses import dataclass, field

from services.evidence_service import split_sentences, trim_quote

CITATION_RES = [
    re.compile(r"\((?:[A-Z][A-Za-z'\-]+(?:,? (?:and|&) [A-Z][A-Za-z'\-]+)*(?: et al\.)?),? \d{4}[a-z]?(?:, p+\. ?\d+)?\)"),
    re.compile(r"\b[A-Z][A-Za-z'\-]+(?:,? (?:and|&) [A-Z][A-Za-z'\-]+)*(?: et al\.)? \(\d{4}[a-z]?\)"),
    re.compile(r"\[\d{1,3}(?:[,–-]\s?\d{1,3})*\]"),
]
CLAIM_WORDS = re.compile(
    r"\b(everyone|always|never|clearly|obviously|definitely|prove[sd]?|best|worst|huge|massive|completely|"
    r"all (?:teams|companies|students|projects)|terrible|the future|only use|guarantee[sd]?|certainly)\b", re.I)
EVAL_WORDS = re.compile(
    r"\b(however|although|limitation|limitations|on the other hand|trade-off|tradeoff|drawback|weakness|whereas|"
    r"despite|nevertheless|cannot (?:compare|prove|show)|do not prove|suggests?|in contrast|risk|bias|caveat|"
    r"we did not measure|not guarantee)\b", re.I)
OBJECTIVE_WORDS = re.compile(
    r"\b(the aim|aims? (?:of|to)|objective|purpose of this|this report (?:will|explains|evaluates|argues|aims)|"
    r"research question|the problem (?:we|was|is)|we wanted to|this essay (?:will|argues)|I (?:will )?argue)\b", re.I)
ARGUE_WORDS = re.compile(r"\b(argue|recommend|therefore|we conclude|this shows|because|so we|worth)\b", re.I)
METHOD_WORDS = re.compile(r"\b(chose|chosen|selected|method|methodology|approach|we used|we ran|we considered|framework)\b", re.I)
JUSTIFY_WORDS = re.compile(r"\b(because|rather than|instead of|compared (?:to|with)|rejected|alternative|"
                           r"so that|since|due to|less boilerplate|trade-off)\b", re.I)
EXPLAIN_WORDS = re.compile(r"\b(means|for example|e\.g\.|such as|is defined as|in other words|which is|"
                           r"was caused by|this is because|check that|checks? one)\b", re.I)
REF_HEADING = re.compile(r"^\s*(?:\d+\.?\s*)?(references|reference list|bibliography|works cited)\s*:?\s*$", re.I | re.M)
YEAR = re.compile(r"\((?:19|20)\d{2}[a-z]?\)|\b(?:19|20)\d{2}\b")


@dataclass
class Signals:
    text: str
    sentences: list[str] = field(default_factory=list)
    paragraphs: list[str] = field(default_factory=list)
    headings: list[str] = field(default_factory=list)
    body: str = ""
    references: list[str] = field(default_factory=list)


def _cited(sentence: str) -> bool:
    return any(r.search(sentence) for r in CITATION_RES)


def analyse_signals(text: str) -> Signals:
    sig = Signals(text=text)
    m = REF_HEADING.search(text)
    body, refs_block = (text[: m.start()], text[m.end():]) if m else (text, "")
    sig.body = body
    sig.references = [ln.strip() for ln in refs_block.splitlines() if ln.strip() and YEAR.search(ln)]
    for ln in body.splitlines():
        s = ln.strip()
        if not s or s.startswith("["):
            continue
        words = s.split()
        if (s.startswith("#") or re.match(r"^\d+(\.\d+)*\.?\s+[A-Z]", s) or (len(words) <= 7 and not s.endswith((".", "?", "!", ","))
                                                                              and s[0].isupper())) and len(words) <= 10:
            sig.headings.append(s)
    sig.paragraphs = [p.strip() for p in re.split(r"\n\s*\n", body) if len(p.split()) >= 12]
    heads = set(sig.headings)
    sig.sentences = [s for s in split_sentences(body) if len(s.split()) >= 4 and not s.startswith("[") and s not in heads]
    return sig


def _first(sents: list[str], pred) -> str:
    for s in sents:
        if pred(s):
            return trim_quote(s)
    return ""


def _clamp(v: int) -> int:
    return max(1, min(5, v))


def _result(score, quote, explanation, missing, issue_type, question, flags=None):
    return {
        "score": _clamp(score), "evidence_quote": quote, "explanation": explanation, "missing": missing,
        "issue_type": issue_type, "coaching_question": question, "flags": flags or [],
    }


# --------------------------------------------------------------------------- report analysers

def evidence(sig: Signals, w: float):
    cited = [s for s in sig.sentences if _cited(s)]
    claims = [s for s in sig.sentences if CLAIM_WORDS.search(s) and not _cited(s)]
    c, u = len(cited), len(claims)
    score = (1 if u >= 2 else 2) if c == 0 else 3 if c <= 2 else 4 if c <= 4 else 5
    if c and u >= 3:
        score -= 1
    if score <= 3 and claims:
        q = trim_quote(claims[0])
        return _result(score, q,
                       f"This sentence makes a strong claim without citing any research or data. You make {u} claim(s) like this "
                       f"and include {c} citation(s). Evidence is worth {w:g}% of this rubric, so unsupported claims cost a lot here.",
                       "Citations to reliable sources (research papers, textbooks, official data) that back up your main claims.",
                       "unsupported" if c == 0 else "unsupported",
                       "What reliable research or data could show a reader that this statement is accurate?")
    if c == 0:
        return _result(score, "", "No citations or research sources were detected anywhere in the submission, so there is insufficient evidence to quote for this criterion.",
                       "Any research, data or academic sources supporting the report.", "missing",
                       "Which one or two sources would most strengthen your central claim?")
    q = trim_quote(cited[0])
    return _result(score, q,
                   f"Claims are backed by cited sources ({c} sentences include a citation). This is good practice for a criterion worth {w:g}%."
                   + (f" {u} sentence(s) still make strong claims without a source." if u else ""),
                   "" if score >= 5 else "Check every major claim has a source, and that each source is credible and recent enough.",
                   "good" if score >= 4 else "unsupported",
                   "Which of your remaining claims would a sceptical reader most want to see evidence for?")


def referencing(sig: Signals, w: float):
    c = sum(1 for s in sig.sentences if _cited(s))
    n = len(sig.references)
    if n == 0:
        score = 1 if c == 0 else 2
        q = _first(sig.sentences, lambda s: CLAIM_WORDS.search(s) is not None)
        return _result(score, q,
                       "No reference list was found." + (" The sentence quoted relies on outside knowledge but is not referenced." if q else ""),
                       "A reference list in a consistent style, with matching in-text citations.", "missing",
                       "Which referencing style does your module require, and which sources have you actually used?")
    score = 2 if n <= 1 else 3 if n <= 3 else 4
    if n >= 4 and c >= 3:
        score = 5
    return _result(score, trim_quote(sig.references[0]),
                   f"A reference list with {n} entr{'y' if n == 1 else 'ies'} was found, and {c} sentence(s) cite sources in the text.",
                   "" if score >= 5 else "More in-text citations that clearly match entries in the reference list.",
                   "good" if score >= 4 else "missing",
                   "Does every source in your reference list appear in your text, and vice versa?")


def critical(sig: Signals, w: float):
    evals = [s for s in sig.sentences if EVAL_WORDS.search(s)]
    e = len(evals)
    score = 1 if e == 0 else 2 if e == 1 else 3 if e <= 3 else 4 if e <= 5 else 5
    one_sided = [s for s in sig.sentences if CLAIM_WORDS.search(s)]
    if score <= 2:
        q = trim_quote(one_sided[-1]) if one_sided else (trim_quote(sig.sentences[-1]) if sig.sentences else "")
        return _result(score, q,
                       f"The work mostly states conclusions without weighing them up. Only {e} sentence(s) discuss limitations, "
                       f"trade-offs or alternative views, and critical evaluation is worth {w:g}% of the rubric.",
                       "Discussion of limitations, weaknesses of your approach, and what the results do NOT show.",
                       "missing",
                       "What could someone who disagrees with your conclusion point to, and how would you respond?")
    q = trim_quote(next((s for s in evals if re.search(r"limitation|cannot|do not prove", s, re.I)), evals[0]))
    return _result(score, q,
                   f"The submission evaluates its own results: {e} sentences discuss limitations, trade-offs or caveats.",
                   "" if score >= 5 else "Deeper evaluation: explain how the limitations affect how far your conclusions can be trusted.",
                   "good" if score >= 4 else "missing",
                   "Which limitation matters most for your conclusion, and what would you do to reduce it?")


def objectives(sig: Signals, w: float):
    obj = [s for s in sig.sentences if OBJECTIVE_WORDS.search(s)]
    intro = any(re.search(r"introduction|overview|aims?", h, re.I) for h in sig.headings)
    o = len(obj)
    score = 2 if o == 0 else 3 if o == 1 else 4 if not intro else 5 if o >= 2 else 4
    if o == 0:
        q = trim_quote(sig.sentences[0]) if sig.sentences else ""
        return _result(score, q,
                       "The opening does not state what problem the work addresses or what it sets out to achieve. "
                       "The reader has to guess the purpose.",
                       "A clear statement of the problem and the specific objectives of the work.", "missing",
                       "If you had to explain the purpose of this work in one sentence, what would it be?")
    return _result(score, trim_quote(obj[0]),
                   f"The problem and aims are stated explicitly ({o} sentence(s) set out purpose or objectives)"
                   + (" and there is a clear introduction section." if intro else ", but there is no clear introduction section."),
                   "" if score >= 5 else "Make the objectives specific and measurable, and signpost them early.",
                   "good" if score >= 4 else "missing",
                   "Does your conclusion answer each objective you set out at the start?")


def argument(sig: Signals, w: float):
    base = objectives(sig, w)
    reasoned = [s for s in sig.sentences if ARGUE_WORDS.search(s) and not CLAIM_WORDS.search(s)]
    claims = [s for s in sig.sentences if CLAIM_WORDS.search(s) and not _cited(s)]
    score = _clamp(base["score"] + (1 if len(reasoned) >= 4 else 0) - (1 if len(claims) >= 3 else 0))
    if score <= 2 and claims:
        return _result(score, trim_quote(claims[0]),
                       "The argument relies on sweeping statements rather than reasons. Claims like this are asserted, not argued.",
                       "A clear position supported by reasons and evidence, developed step by step.", "unsupported",
                       "What is the single most important point you want the reader to accept, and why should they?")
    base["score"] = score
    return base


def methodology(sig: Signals, w: float):
    meth = [s for s in sig.sentences if METHOD_WORDS.search(s)]
    just = [s for s in meth if JUSTIFY_WORDS.search(s) and not CLAIM_WORDS.search(s)]
    m, j = len(meth), len(just)
    score = 1 if m == 0 else 2 if j == 0 else 3 if j == 1 else 4 if j == 2 else 5
    if j == 0:
        q = trim_quote(meth[0]) if meth else ""
        reason = "The approach is described" if meth else "No description of the method or approach was found"
        return _result(score, q,
                       f"{reason}, but no reasons are given for choosing it over alternatives.",
                       "Why this approach was chosen, which alternatives were considered, and why they were rejected.",
                       "missing" if not meth else "unsupported",
                       "Why was this approach more appropriate than the alternatives you could have used?")
    return _result(score, trim_quote(just[0]),
                   f"The method is described and justified ({j} sentence(s) explain why choices were made or alternatives rejected).",
                   "" if score >= 5 else "Link each methodological choice to the project's constraints or objectives.",
                   "good" if score >= 4 else "unsupported",
                   "What would have changed in your results if you had chosen a different approach?")


def technical(sig: Signals, w: float):
    expl = [s for s in sig.sentences if EXPLAIN_WORDS.search(s)]
    x = len(expl)
    score = 2 if x == 0 else 3 if x <= 3 else 4
    note = (" Note: the offline simulator checks how clearly concepts are explained; it cannot confirm technical "
            "correctness, so a human should verify accuracy.")
    if x == 0:
        return _result(score, trim_quote(sig.sentences[0]) if sig.sentences else "",
                       "Technical terms are used without being explained or illustrated." + note,
                       "Definitions or examples showing you understand the key concepts.", "ambiguous",
                       "How would you explain the key technical idea here to a first-year student?")
    return _result(score, trim_quote(expl[0]),
                   f"Concepts are explained with definitions or examples ({x} explanatory sentences found)." + note,
                   "" if score >= 5 else "Check terminology is precise and explain the reasoning behind technical decisions.",
                   "good" if score >= 4 else "ambiguous",
                   "Which technical explanation would you be least confident defending in a viva, and why?")


def structure(sig: Signals, w: float):
    h, p = len(sig.headings), len(sig.paragraphs)
    has_intro = any(re.search(r"introduction", x, re.I) for x in sig.headings)
    has_concl = any(re.search(r"conclusion|summary", x, re.I) for x in sig.headings)
    longest = max(sig.paragraphs, key=lambda x: len(x.split()), default="")
    long_para = len(longest.split()) > 150
    score = 1 + (p >= 3) + (h >= 3) + (has_intro and has_concl) + (h >= 5 and not long_para)
    if long_para:
        score -= 1
    if score <= 3:
        q = trim_quote(split_sentences(longest)[0]) if longest else ""
        problems = []
        if long_para:
            problems.append(f"one paragraph runs to {len(longest.split())} words, which makes it hard to follow")
        if h < 3:
            problems.append(f"only {h} heading(s) were detected")
        if not (has_intro and has_concl):
            problems.append("there is no clearly labelled introduction and conclusion")
        return _result(score, q, "The structure makes the work harder to read: " + "; ".join(problems) + ".",
                       "Clear sections with headings, focused paragraphs (one main idea each), an introduction and a conclusion.",
                       "missing",
                       "If a reader only skimmed your headings, would they understand the shape of your argument?")
    intro_h = next((x for x in sig.headings if re.search(r"introduction", x, re.I)), sig.headings[0] if sig.headings else "")
    return _result(score, intro_h,
                   f"The work is organised into {h} headed sections and {p} developed paragraphs"
                   + (", with an introduction and conclusion." if has_intro and has_concl else "."),
                   "" if score >= 5 else "Use signposting sentences to link sections together.",
                   "good", "Does each section open with a sentence that tells the reader why it matters?")


# --------------------------------------------------------------------------- code analysers

def _code_lines(text: str) -> list[str]:
    return [ln for ln in text.splitlines() if ln.strip()]


def _line(text: str, pattern: str) -> str:
    for ln in text.splitlines():
        if re.search(pattern, ln) and len(ln.strip()) >= 8:
            return ln.strip()
    return ""


def functionality(sig: Signals, w: float):
    t = sig.text
    funcs = len(re.findall(r"^\s*(?:def|function|public|private|static)\s+\w+\s*\(|^\s*\w+\s*=\s*\(?.*\)?\s*=>", t, re.M))
    returns = len(re.findall(r"\breturn\b", t))
    score = 1 if funcs == 0 else 2 if funcs == 1 else 3 if returns < 2 else 4
    flags = ["The offline simulator cannot run code, so correctness against the brief needs human or test-based checking."]
    if funcs == 0:
        return _result(score, "", "No functions or methods were detected, so there is insufficient evidence that the required functionality is implemented.",
                       "Code that implements the requirements in the brief.", "missing",
                       "Which requirement from the brief does each part of your code satisfy?", flags)
    q = _line(t, r"^\s*(def|function|public|private)\s+\w+")
    return _result(score, q,
                   f"{funcs} function(s) were found with {returns} return statement(s). The structure suggests the main features are present, "
                   "but whether they behave correctly can only be confirmed by running tests.",
                   "Evidence (e.g. tests or example runs) showing each requirement works.",
                   "ambiguous" if score < 4 else "good",
                   "How could you demonstrate, step by step, that each requirement is met?", flags)


def code_structure(sig: Signals, w: float):
    t = sig.text
    lines = _code_lines(t)
    comments = sum(1 for ln in lines if ln.strip().startswith(("#", "//", "/*", "*")))
    docstrings = len(re.findall(r'^\s*("""|\'\'\')', t, re.M)) // 1
    funcs = max(1, len(re.findall(r"^\s*(?:def|function)\s+\w+", t, re.M)))
    avg_len = len(lines) / funcs
    score = 2 + (comments + docstrings >= 3) + (funcs >= 3) + (avg_len <= 15)
    q = _line(t, r'"""|#')
    return _result(score, q,
                   f"The code is split into {funcs} function(s) averaging about {avg_len:.0f} lines, with {comments + docstrings} comments/docstrings.",
                   "" if score >= 5 else "Clear names, short single-purpose functions and docstrings explaining intent.",
                   "good" if score >= 4 else "missing",
                   "If a classmate opened this file tomorrow, which part would confuse them first?")


def error_handling(sig: Signals, w: float):
    t = sig.text
    n = len(re.findall(r"\b(try|except|catch|raise|throw)\b", t)) + len(re.findall(r"\bif not\b|isinstance\(|is None", t))
    bare = len(re.findall(r"except\s*:", t))
    score = 1 if n == 0 else 2 if n <= 1 else 3 if n <= 3 else 4 if n <= 6 else 5
    score -= 1 if bare else 0
    if n == 0:
        return _result(score, "", "No input validation or exception handling was found, so there is insufficient evidence for this criterion.",
                       "Checks for invalid input and handling of failures.", "missing",
                       "What is the most likely way a user could break this program, and what should happen then?")
    return _result(score, _line(t, r"\b(raise|except|throw|catch|if not)\b"),
                   f"{n} error-handling or validation constructs were found." + (" A bare 'except:' hides real errors." if bare else ""),
                   "" if score >= 5 else "Handle edge cases such as empty, malformed or out-of-range input.",
                   "good" if score >= 4 else "missing",
                   "Which unexpected inputs have you NOT yet thought about?")


def efficiency(sig: Signals, w: float):
    t = sig.text
    depth, max_depth = [], 0
    for ln in t.splitlines():
        if not ln.strip():
            continue
        indent = len(ln) - len(ln.lstrip())
        depth = [d for d in depth if d < indent]
        if re.match(r"\s*(for|while)\b", ln):
            depth.append(indent)
            max_depth = max(max_depth, len(depth))
    score = 4 if max_depth <= 1 else 3 if max_depth == 2 else 2
    q = _line(t, r"^\s*(for|while)\b")
    return _result(score, q,
                   f"The deepest loop nesting is {max_depth}. " + ("Deeply nested loops can become slow on large inputs." if max_depth >= 3 else
                                                                "No obviously wasteful nested loops were found; efficiency on large data is not measured."),
                   "Consider the data structures used for lookups and the cost on larger inputs.",
                   "good" if score >= 4 else "ambiguous",
                   "What happens to the running time if the input becomes 100 times larger?")


def techniques(sig: Signals, w: float):
    t = sig.text
    feats = {
        "classes": r"^\s*class\s+\w+", "type hints": r"def \w+\(.*:\s*\w+.*\)\s*->", "comprehensions": r"\[[^\]]+ for [^\]]+ in ",
        "context managers": r"^\s*with\s", "custom exceptions": r"class \w+(Error|Exception)\(", "dictionaries": r"\.setdefault\(|\{\s*\"",
        "f-strings": r"f\"[^\"]*\{",
    }
    found = [k for k, p in feats.items() if re.search(p, t, re.M)]
    n = len(found)
    score = 2 if n == 0 else 3 if n <= 2 else 4 if n <= 4 else 5
    return _result(score, _line(t, r"class\s+\w+|->|\swith\s") if n else "",
                   ("Programming techniques used: " + ", ".join(found) + ".") if found else "Few language features or design techniques were detected.",
                   "" if score >= 5 else "Explain why your chosen data structures and techniques suit the problem.",
                   "good" if score >= 4 else "missing",
                   "Which programming concept from the module could make this solution clearer or safer?")


def testing(sig: Signals, w: float):
    t = sig.text
    tests = len(re.findall(r"^\s*def test_\w+|@Test|\bit\(|\bdescribe\(", t, re.M))
    asserts = len(re.findall(r"\bassert\w*\b|pytest\.raises|expect\(", t))
    edge = len(re.findall(r"pytest\.raises|assertRaises|toThrow", t))
    score = 1 if tests == 0 and asserts == 0 else 2 if tests <= 2 else 3 if tests <= 5 else 4 if tests <= 9 else 5
    score += 1 if edge and score < 5 else 0
    if tests == 0 and asserts == 0:
        return _result(1, "", "No automated tests were found, so there is insufficient evidence that the code has been validated.",
                       "Automated tests covering normal cases, edge cases and invalid input.", "missing",
                       "Which behaviour of your code would be most embarrassing if it broke, and how would you test it?")
    q = _line(t, r"def test_|assert")
    return _result(score, q,
                   f"{tests} test function(s) and {asserts} assertion(s) were found." +
                   (" Tests using 'assert False' inside try/except are fragile - a test framework's exception checks are clearer." if "assert False" in t else ""),
                   "" if score >= 5 else "Tests for edge cases and invalid input, not just the main success path.",
                   "good" if score >= 4 else "missing",
                   "Which edge cases does your test suite not cover yet?")


def general(sig: Signals, w: float, criterion_text: str = ""):
    terms = [t for t in re.findall(r"[a-z]{5,}", criterion_text.lower()) if t not in {"does", "there", "which", "their", "appropriate"}]
    best, best_hits = "", 0
    for s in sig.sentences:
        hits = sum(1 for t in terms if t in s.lower())
        if hits > best_hits:
            best, best_hits = s, hits
    return _result(3, trim_quote(best) if best else "",
                   "The offline simulator does not recognise this criterion, so it cannot rate it reliably. The quote is the passage most related to the criterion's wording.",
                   "A human (or live AI mode) should judge this criterion.", "ambiguous",
                   "How does your work demonstrate what this criterion asks for?",
                   ["Criterion not recognised by the offline simulator - human review recommended."])


ANALYSERS = {
    "evidence": evidence, "referencing": referencing, "critical_evaluation": critical, "problem_objectives": objectives,
    "argument": argument, "methodology": methodology, "technical_accuracy": technical, "structure_presentation": structure,
    "functionality": functionality, "code_structure": code_structure, "error_handling": error_handling,
    "efficiency": efficiency, "techniques": techniques, "testing": testing,
}


def simulate(text: str, questions: list[dict]) -> list[dict]:
    sig = analyse_signals(text)
    out = []
    for q in questions:
        fn = ANALYSERS.get(q["category"])
        res = fn(sig, q["weight"]) if fn else general(sig, q["weight"], q["text"])
        res["question_id"] = q["id"]
        out.append(res)
    return out
