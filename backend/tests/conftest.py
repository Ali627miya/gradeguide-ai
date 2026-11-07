import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp) / 'test.db'}"
os.environ["OPENAI_API_KEY"] = ""  # tests always use the offline simulator
os.environ["AI_MODE"] = "offline"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from database.seed import init_db
    from main import app

    init_db(reset=True)
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def student(client):
    t = client.post("/api/auth/demo-login", json={"role": "student"}).json()
    return {"Authorization": f"Bearer {t['token']}"}


@pytest.fixture()
def professor(client):
    t = client.post("/api/auth/demo-login", json={"role": "professor"}).json()
    return {"Authorization": f"Bearer {t['token']}"}
