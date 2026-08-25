from pathlib import Path
from uuid import UUID

import pymupdf
from fastapi.testclient import TestClient

from app.api.dependencies import get_current_user
from app.core.security import AuthenticatedUser
from app.main import app
from app.services.guides import GuideCatalog, get_guide_catalog


def _user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=UUID("d2f7c64a-3e56-4d45-a47d-07331e2a95df"),
        access_token="user-jwt",
        role="authenticated",
        email="learner@example.com",
        claims={},
    )


def _write_pdf(path: Path, *, pages: int, subject: str = "") -> bytes:
    document = pymupdf.open()
    for _ in range(pages):
        document.new_page()
    document.set_metadata({"subject": subject})
    document.save(path)
    document.close()
    return path.read_bytes()


def test_guide_catalog_builds_metadata_and_cleans_filename(tmp_path: Path) -> None:
    _write_pdf(
        tmp_path / "COMPETENCY STANDARD\nFOR\nELECTRICAL WORKS.pdf",
        pages=4,
        subject="Electrical sector competency requirements.",
    )
    (tmp_path / "disguised.pdf").write_text("not a PDF", encoding="utf-8")

    documents = GuideCatalog(tmp_path).list_documents()

    assert len(documents) == 1
    guide = documents[0]
    assert guide.title == "Competency Standard For Electrical Works"
    assert guide.filename == "Competency Standard For Electrical Works.pdf"
    assert "\n" not in guide.filename
    assert guide.description == "Electrical sector competency requirements."
    assert guide.category == "Competency Standards"
    assert guide.page_count == 4


def test_guide_catalog_returns_empty_list_when_directory_is_missing(
    tmp_path: Path,
) -> None:
    assert GuideCatalog(tmp_path / "missing").list_documents() == []


def test_guide_endpoints_require_authentication(tmp_path: Path) -> None:
    app.dependency_overrides[get_guide_catalog] = lambda: GuideCatalog(tmp_path)
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/guides")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401


def test_authenticated_user_can_list_open_and_download_guide(tmp_path: Path) -> None:
    expected_pdf = _write_pdf(
        tmp_path / "Lessons in Electric Circuits.pdf",
        pages=3,
    )
    catalog = GuideCatalog(tmp_path)
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_guide_catalog] = lambda: catalog
    try:
        with TestClient(app) as client:
            listing = client.get("/api/v1/guides")
            guide = listing.json()["documents"][0]
            inline = client.get(f"/api/v1/guides/{guide['id']}/file")
            attachment = client.get(
                f"/api/v1/guides/{guide['id']}/file?download=true"
            )
    finally:
        app.dependency_overrides.clear()

    assert listing.status_code == 200
    assert guide["title"] == "Lessons in Electric Circuits"
    assert guide["page_count"] == 3
    assert inline.status_code == 200
    assert inline.headers["content-type"] == "application/pdf"
    assert inline.headers["content-disposition"].startswith("inline;")
    assert inline.content == expected_pdf
    assert attachment.headers["content-disposition"].startswith("attachment;")


def test_unknown_guide_returns_404(tmp_path: Path) -> None:
    catalog = GuideCatalog(tmp_path)
    app.dependency_overrides[get_current_user] = _user
    app.dependency_overrides[get_guide_catalog] = lambda: catalog
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/guides/0000000000000000/file")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 404
    assert response.json() == {"detail": "Guide not found."}
