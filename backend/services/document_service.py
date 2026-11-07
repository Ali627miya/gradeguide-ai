"""Extracts plain text from uploaded PDF, DOCX and TXT files.

Raw files are processed in memory and never written to disk.
"""
import io
import re

from config import settings

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".csv", ".json", ".py", ".java", ".js", ".ts", ".c", ".cpp", ".cs"}
TEXT_LIKE = ALLOWED_EXTENSIONS - {".pdf", ".docx"}


class ExtractionError(ValueError):
    """Raised with a student-friendly message when a file cannot be read."""


def _ext(filename: str) -> str:
    m = re.search(r"(\.[A-Za-z0-9]+)$", filename or "")
    return m.group(1).lower() if m else ""


def normalise_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace(" ", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text(filename: str, data: bytes) -> tuple[str, list[str]]:
    """Return (text, warnings). Raises ExtractionError with a friendly message."""
    warnings: list[str] = []
    if not data:
        raise ExtractionError("The file is empty. Please choose a file that contains your work.")
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise ExtractionError(f"The file is larger than {settings.MAX_UPLOAD_MB} MB. Please upload a smaller file.")
    ext = _ext(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise ExtractionError("Unsupported file type. Please upload a PDF, DOCX or TXT file (code files are also accepted).")

    if ext == ".pdf":
        if not data.startswith(b"%PDF"):
            raise ExtractionError("This does not look like a valid PDF file.")
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted:
                raise ExtractionError("This PDF is password-protected. Please upload an unlocked copy.")
            pages = [(p.extract_text() or "") for p in reader.pages]
            text = "\n\n".join(pages)
        except ExtractionError:
            raise
        except Exception as exc:  # pypdf raises many types
            raise ExtractionError("We could not read this PDF. Try exporting it again or upload a DOCX/TXT.") from exc
        if len(text.strip()) < 20:
            raise ExtractionError(
                "No selectable text was found in this PDF (it may be a scanned image). Please upload a DOCX or TXT version."
            )
        warnings.append("PDF text extraction can merge lines or lose formatting. Please check the preview carefully.")
    elif ext == ".docx":
        if not data.startswith(b"PK"):
            raise ExtractionError("This does not look like a valid DOCX file.")
        try:
            import docx

            document = docx.Document(io.BytesIO(data))
            parts = [p.text for p in document.paragraphs]
            for table in document.tables:
                for row in table.rows:
                    parts.append(" | ".join(cell.text for cell in row.cells))
            text = "\n".join(parts)
        except Exception as exc:
            raise ExtractionError("We could not read this Word document. Please re-save it as .docx and try again.") from exc
    else:
        for enc in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
            try:
                text = data.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:  # pragma: no cover
            raise ExtractionError("We could not decode this text file.")
        if "\x00" in text:
            raise ExtractionError("This file appears to be binary, not text.")

    text = normalise_text(text)
    if len(text) < 20:
        raise ExtractionError("Very little text was found in this file. Please check you uploaded the right document.")
    if len(text) > 120_000:
        warnings.append("This document is very long; only the first 120,000 characters will be assessed.")
        text = text[:120_000]
    return text, warnings


def word_count(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))
