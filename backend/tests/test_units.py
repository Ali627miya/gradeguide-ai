"""Unit tests for evidence verification, rubric parsing, integrity and feedback-quality logic."""
from pathlib import Path

import pytest

from agents import feedback_quality_agent, integrity_agent
from services.evidence_service import verify_quote
from services.rubric_service import RubricError, parse_csv, parse_json, parse_rubric_text, validate_questions

TEMPLATES = Path(__file__).resolve().parent.parent / "static" / "templates"
SOURCE = "Testing is very important and everyone knows that automated testing is always better than manual testing."


def test_exact_quote_verified():
    assert verify_quote("everyone knows that automated testing is always better", SOURCE)["status"] == "verified"


def test_smart_quotes_and_whitespace_are_normalised():
    assert verify_quote("“everyone   knows that automated testing”", SOURCE)["status"] == "verified"


def test_invented_quote_is_unverified():
    assert verify_quote("Automated testing reduced defects by 90 percent in our study", SOURCE)["status"] == "unverified"


def test_empty_quote_is_none():
    assert verify_quote("", SOURCE)["status"] == "none"


def test_csv_templates_parse_and_validate():
    for name in ("code_questions_template.csv", "report_questions_template.csv"):
        qs = parse_csv((TEMPLATES / name).read_text())
        assert len(qs) == 6
        assert validate_questions(qs) == []


def test_json_template_parses():
    name, qs = parse_json((TEMPLATES / "rubric_template.json").read_text())
    assert name and len(qs) == 6 and validate_questions(qs) == []


def test_weights_must_total_100():
    qs = parse_csv("section,question,weight\nreport,Is the report clear?,50\nreport,Is there evidence?,30\n")
    assert any("100%" in e for e in validate_questions(qs))


def test_max_six_questions_per_section():
    rows = "\n".join(f"code,Question number {i} about the code?,10" for i in range(7))
    qs = parse_csv("section,question,weight\n" + rows + "\nreport,Is it clear?,30")
    assert any("maximum is 6" in e for e in validate_questions(qs))


def test_bad_csv_gives_friendly_error():
    with pytest.raises(RubricError):
        parse_csv("foo,bar\n1,2")


def test_free_text_rubric_parsing():
    qs, _ = parse_rubric_text((TEMPLATES / "a2_marking_rubric.txt").read_text())
    assert len(qs) == 6 and abs(sum(q["weight"] for q in qs) - 100) < 0.01
    assert {q["category"] for q in qs} >= {"evidence", "methodology", "critical_evaluation"}


@pytest.mark.parametrize("msg", ["Can you rewrite my introduction?", "write my conclusion please",
                                 "Give me the code for the booking function", "paraphrase this paragraph"])
def test_integrity_blocks_ghostwriting_requests(msg):
    assert integrity_agent.screen_request(msg)["blocked"]


def test_integrity_allows_genuine_questions():
    assert not integrity_agent.screen_request("What kind of source would be most convincing for my claim?")["blocked"]


def test_integrity_catches_replacement_text_and_code():
    bad = 'Here is a revised introduction: "This report evaluates automated testing for the CampusBook system in detail."'
    assert not integrity_agent.check_output(bad, SOURCE)["passed"]
    code = "Try this:\n```python\ndef book():\n    pass\n```"
    assert any(v["rule"] == "code_generation" for v in integrity_agent.check_output(code, "")["violations"])


def test_integrity_catches_paraphrase_of_student_sentence():
    para = "Testing matters a lot, and everyone knows automated testing is always better than doing manual testing."
    res = integrity_agent.check_output(para + " What do you think?", SOURCE)
    assert any(v["rule"] == "paraphrase_of_student_work" for v in res["violations"])


def test_integrity_guard_replaces_with_guiding_question():
    g = integrity_agent.guard("You could write: testing is good.", SOURCE, "evidence", use_llm=False)
    assert g["replaced"] and g["text"].endswith("?")


def _row(status, score=2, rating="WEAK"):
    return {"criterion_name": "Evidence", "criterion_text": "Does the report provide evidence and references?",
            "category": "evidence", "weight": 30, "score": score, "rating": rating, "quote_status": status,
            "explanation": "This claim has no supporting research, so the evidence criterion is weak overall here.",
            "missing": "Citations to research.", "coaching_question": "What research could support this statement?",
            "issue_type": "unsupported"}


def test_quality_penalises_unverified_quotes():
    good = feedback_quality_agent.evaluate([_row("verified")], [], {})
    bad = feedback_quality_agent.evaluate([_row("unverified")], [], {})
    assert good["scores"]["evidence_accuracy"] == 5 and bad["scores"]["evidence_accuracy"] == 1
    assert bad["overall"] < good["overall"]


def test_simulated_feedback_cannot_score_perfect():
    res = feedback_quality_agent.evaluate([_row("verified")], [], {}, mode="simulated")
    assert res["overall"] < 100 and res["caps"]


def test_integrity_violations_reduce_compliance():
    res = feedback_quality_agent.evaluate([_row("verified")], [{"violations": [{"rule": "x"}, {"rule": "y"}]}], {})
    assert res["scores"]["integrity_compliance"] == 3
