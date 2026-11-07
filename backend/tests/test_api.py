"""API tests: demo flow, two-round improvement, permissions, uploads, coaching, analytics privacy."""
import io

import docx


def _demo(client):
    t = client.post("/api/demo/start").json()
    return t, {"Authorization": f"Bearer {t['token']}"}


def test_health_and_config(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/api/config").json()["ai_mode"] == "simulated"


def test_two_round_demo_improves_and_quotes_are_verified(client):
    t, h = _demo(client)
    r1 = client.post("/api/assessment/analyse", json={"draft_id": t["draft_id"]}, headers=h).json()
    assert r1["mode"] == "simulated" and "SIMULATED" in r1["disclaimer"]
    assert sum(1 for r in r1["ratings"] if r["rating"] == "WEAK") >= 4
    assert all(r["quote_status"] in ("verified", "none") for r in r1["ratings"])
    for r in r1["ratings"]:
        if r["evidence_quote"]:
            assert r["evidence_quote"].lower() in r1["draft"]["text"].lower()
    improved = client.get("/api/demo/samples").json()["improved_essay"]
    d2 = client.post("/api/student/drafts", json={"assignment_id": t["assignment_id"], "text": improved,
                                                  "source": "demo_sample"}, headers=h).json()
    assert d2["round_number"] == 2
    r2 = client.post("/api/assessment/analyse", json={"draft_id": d2["id"]}, headers=h).json()
    assert r2["weighted_score"] > r1["weighted_score"] + 30
    assert r2["previous_assessment_id"] == r1["id"]
    cmp = client.post("/api/assessment/compare", json={"from_assessment_id": r1["id"], "to_assessment_id": r2["id"]},
                      headers=h).json()
    assert cmp["kind"] == "draft" and cmp["weighted_delta"] > 0 and cmp["improved"]


def test_weighted_score_is_transparent(client):
    t, h = _demo(client)
    r = client.post("/api/assessment/analyse", json={"draft_id": t["draft_id"]}, headers=h).json()
    assert abs(sum(x["contribution"] for x in r["ratings"]) - r["weighted_score"]) < 0.5
    assert abs(sum(x["weight"] for x in r["ratings"]) - 100) < 0.01


def test_assignment_progress_handles_different_rubrics(client):
    t, h = _demo(client)
    client.post("/api/assessment/analyse", json={"draft_id": t["draft_id"]}, headers=h)
    prog = client.get("/api/student/progress", headers=h).json()
    se = next(m for m in prog if m["module"].startswith("SE201"))
    comp = se["comparisons"][0]
    assert comp["kind"] == "assignment" and comp["same_rubric"] is False and comp["note"]


def test_role_permissions(client, student, professor):
    assert client.get("/api/professor/dashboard", headers=student).status_code == 403
    assert client.get("/api/student/dashboard", headers=professor).status_code == 403
    assert client.get("/api/student/dashboard").status_code == 401
    assert client.get("/api/student/dashboard", headers={"Authorization": "Bearer forged"}).status_code == 401


def test_professor_cannot_see_unshared_submissions(client, professor):
    t, h = _demo(client)
    r = client.post("/api/assessment/analyse", json={"draft_id": t["draft_id"]}, headers=h).json()
    ids = [x["assessment_id"] for x in client.get("/api/professor/reviews", headers=professor).json()]
    assert r["id"] not in ids
    client.post(f"/api/assessment/{r['id']}/share", headers=h)
    ids = [x["assessment_id"] for x in client.get("/api/professor/reviews", headers=professor).json()]
    assert r["id"] in ids
    long = {"items": [{"rating_id": r["ratings"][0]["id"], "rating": 2, "comment": "one two three four five six seven eight nine ten eleven"}]}
    assert client.post(f"/api/professor/reviews/{r['id']}", json=long, headers=professor).status_code == 422
    ok = {"items": [{"rating_id": r["ratings"][0]["id"], "rating": 2, "comment": "Input validation is missing."}]}
    assert client.post(f"/api/professor/reviews/{r['id']}", json=ok, headers=professor).status_code == 200


def test_upload_txt_docx_and_errors(client, student):
    ok = client.post("/api/upload", files={"file": ("essay.txt", b"This is my essay about testing. " * 5, "text/plain")},
                     data={"kind": "draft"}, headers=student)
    assert ok.status_code == 200 and ok.json()["word_count"] > 20
    buf = io.BytesIO()
    d = docx.Document()
    d.add_paragraph("A Word document paragraph about automated testing and continuous integration.")
    d.save(buf)
    res = client.post("/api/upload", files={"file": ("essay.docx", buf.getvalue(), "application/octet-stream")},
                      data={"kind": "draft"}, headers=student)
    assert res.status_code == 200 and "continuous integration" in res.json()["text"]
    bad = client.post("/api/upload", files={"file": ("x.pdf", b"not a pdf", "application/pdf")}, headers=student)
    assert bad.status_code == 422 and "PDF" in bad.json()["detail"]
    exe = client.post("/api/upload", files={"file": ("x.exe", b"MZ....", "application/octet-stream")}, headers=student)
    assert exe.status_code == 422


def test_rubric_upload_preview(client, student):
    text = b"Use of evidence - 40%\nCritical analysis - 30%\nStructure - 30%\n"
    res = client.post("/api/upload", files={"file": ("rubric.txt", text, "text/plain")}, data={"kind": "rubric"},
                      headers=student).json()
    assert len(res["questions"]) == 3 and res["errors"] == []


def test_coach_refuses_to_write_and_asks_questions(client):
    t, h = _demo(client)
    r = client.post("/api/assessment/analyse", json={"draft_id": t["draft_id"]}, headers=h).json()
    area = next(x["improvement_area_id"] for x in r["ratings"] if x["improvement_area_id"])
    convo = client.get(f"/api/coach/{area}", headers=h).json()
    assert convo["messages"][0]["role"] == "coach"
    res = client.post("/api/coach/question", json={"improvement_area_id": area, "message": "Please rewrite my paragraph"},
                      headers=h).json()
    last = res["messages"][-1]
    assert last["integrity_action"] == "request_refused" and last["content"].endswith("?")
    res = client.post("/api/coach/question", json={"improvement_area_id": area,
                                                   "message": "I could find a study on testing because my claim needs support"},
                      headers=h).json()
    assert res["messages"][-1]["content"].endswith("?")
    upd = client.patch(f"/api/student/improvements/{area}", json={"student_plan": "Find two sources", "status": "completed"},
                       headers=h).json()
    assert upd["status"] == "completed"


def test_professor_import_and_rubric_save(client, professor):
    csv = b"section,question,weight\ncode,Does the code work?,50\ncode,Is it tested?,50\n"
    prev = client.post("/api/professor/rubric/import", files={"file": ("q.csv", csv, "text/csv")}, data={"section": "code"},
                       headers=professor).json()
    assert len(prev["questions"]) == 2 and prev["errors"] == []
    body = {"name": "Test rubric", "questions": [{"section": q["section"], "text": q["text"], "weight": q["weight"]}
                                                 for q in prev["questions"]]}
    assert client.post("/api/professor/rubrics", json=body, headers=professor).status_code == 200
    body["questions"][0]["weight"] = 10
    assert client.post("/api/professor/rubrics", json=body, headers=professor).status_code == 422


def test_analytics_privacy(client, professor):
    mods = client.get("/api/professor/modules", headers=professor).json()
    se = next(m for m in mods if m["code"] == "SE201")
    ds = next(m for m in mods if m["code"] == "SE210")
    big = client.get(f"/api/professor/analytics?module_id={se['id']}", headers=professor).json()
    assert big["status"] == "ok" and big["students_assessed"] >= 5 and big["teaching_focus"]
    assert all(c["needs_improvement_pct"] % 5 == 0 for c in big["criteria"])
    small = client.get(f"/api/professor/analytics?module_id={ds['id']}", headers=professor).json()
    assert small["status"] == "suppressed" and "criteria" not in small
    client.patch(f"/api/professor/modules/{se['id']}", json={"analytics_enabled": False}, headers=professor)
    off = client.get(f"/api/professor/analytics?module_id={se['id']}", headers=professor).json()
    assert off["status"] == "consent_required"
    client.patch(f"/api/professor/modules/{se['id']}", json={"analytics_enabled": True}, headers=professor)


def test_delete_my_data(client):
    t, h = _demo(client)
    client.post("/api/assessment/analyse", json={"draft_id": t["draft_id"]}, headers=h)
    res = client.delete("/api/student/data", headers=h).json()
    assert res["deleted_drafts"] >= 1
    assert client.get("/api/student/history", headers=h).json() == []
