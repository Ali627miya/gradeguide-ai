"""Rubric parsing (CSV / JSON / free text), category inference and validation."""
import csv
import io
import json
import re

from config import settings

# category key -> (section, label, keywords). Order = tie-break priority.
CATEGORIES: dict[str, tuple[str, str, list[str]]] = {
    "problem_objectives": ("report", "Problem & objectives", ["problem", "objective", "aim", "purpose", "research question", "scope", "introduc", "assignment brief"]),
    "argument": ("report", "Argument", ["argument", "thesis", "position", "line of reasoning", "coheren", "persuasive"]),
    "evidence": ("report", "Evidence & research", ["evidence", "research", "source", "literature", "data", "support"]),
    "referencing": ("report", "Referencing", ["referenc", "citation", "cite", "bibliograph", "harvard", "apa"]),
    "methodology": ("report", "Methodology", ["method", "approach", "justif", "design decision"]),
    "critical_evaluation": ("report", "Critical evaluation", ["critical", "evaluat", "limitation", "reflect", "analys", "analyz"]),
    "technical_accuracy": ("report", "Technical explanation", ["technical", "accura", "explanation", "understandable", "concept", "knowledge"]),
    "structure_presentation": ("report", "Structure & presentation", ["structure", "organis", "organiz", "present", "clarity", "professional", "format", "writing style"]),
    "functionality": ("code", "Functionality", ["functionality", "correct", "requirement", "works", "implement"]),
    "error_handling": ("code", "Error handling", ["error", "exception", "unexpected input", "robust", "edge case", "invalid"]),
    "testing": ("code", "Testing", ["test", "validat", "verif", "coverage"]),
    "efficiency": ("code", "Efficiency", ["efficien", "complexity", "performance", "optimi"]),
    "techniques": ("code", "Programming techniques", ["technique", "concept", "paradigm", "data structure", "algorithm", "object-oriented", "programming"]),
    "code_structure": ("code", "Code structure & readability", ["structur", "readab", "logical", "understand", "maintain", "style", "comment", "document"]),
}

DEFAULT_CODE_QUESTIONS = [
    ("Does the code correctly implement the required functionality?", 25),
    ("Is the code logically structured and easy to understand?", 15),
    ("Does the solution handle errors and unexpected inputs appropriately?", 15),
    ("Is the code efficient and does it avoid unnecessary complexity?", 15),
    ("Are appropriate programming techniques and concepts used?", 15),
    ("Has the code been sufficiently tested and validated?", 15),
]
DEFAULT_REPORT_QUESTIONS = [
    ("Does the report clearly explain the problem and objectives?", 15),
    ("Is the technical explanation accurate and understandable?", 15),
    ("Does the report provide appropriate evidence, research and references?", 25),
    ("Does the report explain and justify the chosen methodology?", 15),
    ("Does the report critically evaluate the results and limitations?", 20),
    ("Is the report professionally structured and clearly presented?", 10),
]

CODE_HINTS = ["code", "program", "function", "implement", "software solution", "unit test", "algorithm", "compile"]


class RubricError(ValueError):
    pass


def infer_section(text: str) -> str:
    t = text.lower()
    return "code" if any(h in t for h in CODE_HINTS) else "report"


def infer_category(text: str, section: str) -> str:
    t = text.lower()
    best, best_hits = None, 0
    for key, (sec, _label, keywords) in CATEGORIES.items():
        if sec != section:
            continue
        hits = sum(1 for k in keywords if k in t)
        if hits > best_hits:
            best, best_hits = key, hits
    return best or "general"


def category_label(category: str) -> str:
    return CATEGORIES.get(category, ("", "General criterion", []))[1]


def make_question(text: str, weight: float, section: str | None = None, short_name: str | None = None,
                  category: str | None = None) -> dict:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    section = (section or infer_section(text)).strip().lower()
    if section not in {"code", "report"}:
        raise RubricError(f"Section must be 'code' or 'report' (got '{section}').")
    category = (category or "").strip().lower() or infer_category(text, section)
    if category not in CATEGORIES and category != "general":
        category = infer_category(text, section)
    return {
        "section": section,
        "text": text,
        "weight": round(float(weight), 2),
        "short_name": (short_name or "").strip()[:60] or category_label(category),
        "category": category,
    }


def default_questions(section: str) -> list[dict]:
    src = DEFAULT_CODE_QUESTIONS if section == "code" else DEFAULT_REPORT_QUESTIONS
    return [make_question(t, w, section) for t, w in src]


def _dedupe_names(questions: list[dict]) -> list[dict]:
    seen: dict[str, int] = {}
    for q in questions:
        name = q["short_name"]
        if name in seen:
            seen[name] += 1
            q["short_name"] = f"{name} ({seen[name]})"
        else:
            seen[name] = 1
    return questions


def parse_csv(content: str, default_section: str | None = None) -> list[dict]:
    reader = csv.DictReader(io.StringIO(content.strip()))
    if not reader.fieldnames:
        raise RubricError("The CSV file has no header row. Use the template: section,question,weight,short_name")
    fields = {f.strip().lower(): f for f in reader.fieldnames if f}
    qcol = next((fields[k] for k in ("question", "text", "criterion", "question_text") if k in fields), None)
    if not qcol:
        raise RubricError("The CSV needs a 'question' column. Download the template to see the expected format.")
    out = []
    for i, row in enumerate(reader, start=2):
        text = (row.get(qcol) or "").strip()
        if not text:
            continue
        raw_w = (row.get(fields.get("weight", ""), "") or "").strip().rstrip("%")
        try:
            weight = float(raw_w) if raw_w else 0.0
        except ValueError as exc:
            raise RubricError(f"Row {i}: weight '{raw_w}' is not a number.") from exc
        section = (row.get(fields.get("section", ""), "") or default_section or "").strip().lower() or None
        out.append(make_question(text, weight, section, row.get(fields.get("short_name", ""), ""),
                                 row.get(fields.get("category", ""), "")))
    if not out:
        raise RubricError("No questions were found in the CSV file.")
    return _dedupe_names(out)


def parse_json(content: str, default_section: str | None = None) -> tuple[str | None, list[dict]]:
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RubricError(f"The JSON file is not valid JSON (line {exc.lineno}).") from exc
    name = None
    if isinstance(data, dict):
        name = data.get("name")
        items = data.get("questions")
        if items is None:  # {"code": [...], "report": [...]}
            items = []
            for sec in ("code", "report"):
                for q in data.get(sec, []) or []:
                    q = dict(q) if isinstance(q, dict) else {"question": q}
                    q.setdefault("section", sec)
                    items.append(q)
    else:
        items = data
    if not isinstance(items, list) or not items:
        raise RubricError("The JSON must contain a list of questions. Download the template to see the format.")
    out = []
    for i, q in enumerate(items, start=1):
        if isinstance(q, str):
            q = {"question": q}
        if not isinstance(q, dict):
            raise RubricError(f"Question {i} is not an object.")
        text = q.get("question") or q.get("text") or q.get("criterion")
        if not text:
            raise RubricError(f"Question {i} has no 'question' text.")
        try:
            weight = float(str(q.get("weight", 0)).rstrip("%"))
        except ValueError as exc:
            raise RubricError(f"Question {i}: weight is not a number.") from exc
        out.append(make_question(text, weight, q.get("section") or default_section, q.get("short_name"), q.get("category")))
    return name, _dedupe_names(out)


_WEIGHT_RE = re.compile(r"(\d{1,3}(?:\.\d+)?)\s*%")
_BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d{1,2}[.)]|[A-Fa-f][.)])\s+")


def parse_rubric_text(content: str) -> tuple[list[dict], list[str]]:
    """Best-effort parser for a lecturer rubric extracted from PDF/DOCX/TXT."""
    warnings: list[str] = []
    lines = [ln.strip() for ln in content.splitlines() if ln.strip()]
    candidates: list[tuple[str, float | None]] = []
    for ln in lines:
        m = _WEIGHT_RE.search(ln)
        if m and len(ln) < 300:
            text = _WEIGHT_RE.sub("", ln)
            text = _BULLET_RE.sub("", text)
            text = re.sub(r"[\s\-–:|()\[\]]+$", "", text).strip(" -–:|()")
            if len(text) >= 4 and float(m.group(1)) <= 100:
                candidates.append((text, float(m.group(1))))
    if not candidates:
        for ln in lines:
            if _BULLET_RE.match(ln) and 8 <= len(ln) <= 300:
                candidates.append((_BULLET_RE.sub("", ln).strip(), None))
        if candidates:
            warnings.append("No percentage weights were found, so all criteria were given equal weight. Please check them.")
    if not candidates:
        raise RubricError(
            "We could not find any criteria in this rubric. Put one criterion per line, ideally with a weight, e.g. "
            "'Use of evidence - 30%'."
        )
    questions = []
    for text, weight in candidates:
        questions.append(make_question(text, weight if weight is not None else 0))
    if any(w is None for _, w in candidates):
        share = round(100 / len(questions), 2)
        for q in questions:
            q["weight"] = share
        questions[-1]["weight"] = round(100 - share * (len(questions) - 1), 2)
    for sec in ("code", "report"):
        sec_q = [q for q in questions if q["section"] == sec]
        if len(sec_q) > settings.MAX_QUESTIONS_PER_SECTION:
            warnings.append(f"Only the first {settings.MAX_QUESTIONS_PER_SECTION} {sec} criteria were kept.")
            keep = set(id(q) for q in sec_q[: settings.MAX_QUESTIONS_PER_SECTION])
            questions = [q for q in questions if q["section"] != sec or id(q) in keep]
    total = sum(q["weight"] for q in questions)
    if abs(total - 100) > 0.5 and total > 0:
        warnings.append(f"Weights added up to {total:g}%, so they were scaled to 100%.")
        for q in questions:
            q["weight"] = round(q["weight"] * 100 / total, 2)
        questions[-1]["weight"] = round(100 - sum(q["weight"] for q in questions[:-1]), 2)
    return _dedupe_names(questions), warnings


def validate_questions(questions: list[dict]) -> list[str]:
    """Return a list of validation errors (empty = valid)."""
    errors = []
    if not questions:
        return ["Add at least one question."]
    for sec in ("code", "report"):
        n = sum(1 for q in questions if q["section"] == sec)
        if n > settings.MAX_QUESTIONS_PER_SECTION:
            errors.append(
                f"The {sec} section has {n} questions; the maximum is {settings.MAX_QUESTIONS_PER_SECTION}."
            )
    for i, q in enumerate(questions, start=1):
        if not q.get("text") or len(q["text"]) < 5:
            errors.append(f"Question {i} needs some text.")
        if len(q.get("text", "")) > 300:
            errors.append(f"Question {i} is too long (300 characters max).")
        if q.get("weight", 0) <= 0:
            errors.append(f"Question {i} needs a weight above 0%.")
    total = round(sum(float(q.get("weight", 0)) for q in questions), 2)
    if abs(total - 100) > 0.01:
        errors.append(f"Weights must add up to 100% (currently {total:g}%).")
    return errors
