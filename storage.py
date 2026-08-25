"""
SGOD_PMES -- File Storage Helpers
====================================
Centralized upload pipeline. Every accepted PDF is saved under:

    <UPLOAD_ROOT>/<year>/<Mon>/<irc_type>_<8-char-uuid>_<original-name>.pdf

e.g.  uploads/2026/Jan/irc1a_9f3c1a2b_july-report.pdf

The on-disk folder structure (year -> month) is what a person browsing
the file manager sees; the DB row (`UploadedFile.relative_path`) is the
actual source of truth an app route should use to open/delete a file --
never reconstruct a path from year/month/filename by hand.

Also included:
  * `enable_sqlite_foreign_keys` -- SQLite ignores FK constraints (and
    therefore ON DELETE CASCADE) unless you turn it on per-connection.
  * `delete_uploaded_file` -- the one function that should be used to
    delete a file. It removes the DB row (cascading to every extracted
    record via models.py's relationships) *and* the file on disk, as a
    single operation, so they can never drift out of sync.
  * `seed_schools` -- one-time import of the master school list (and
    DEDP-priority flags) currently hardcoded in irc2a.js, into the new
    `School` table.
"""

import hashlib
import os
import uuid

from sqlalchemy import event
from sqlalchemy.engine import Engine
from werkzeug.utils import secure_filename

from models import School, UploadedFile, db

MONTH_KEYS = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
]

# 3-letter, capitalized -- used as the on-disk month folder name.
MONTH_FOLDER_NAMES = {
    "jan": "Jan", "feb": "Feb", "mar": "Mar", "apr": "Apr",
    "may": "May", "jun": "Jun", "jul": "Jul", "aug": "Aug",
    "sep": "Sep", "oct": "Oct", "nov": "Nov", "dec": "Dec",
}


class InvalidUploadError(ValueError):
    """Raised for a bad month_key or an upload_root that can't be created."""


# ---------------------------------------------------------------------------
# SQLite ON DELETE CASCADE only works if foreign_keys is turned on --
# it's OFF by default. Call this once, right after creating the engine
# (see app.py). This is a belt-and-suspenders measure: the app's own
# delete_uploaded_file() below cascades via the ORM regardless, but this
# also protects you if anything ever deletes rows outside the ORM.
# ---------------------------------------------------------------------------
def enable_sqlite_foreign_keys(app_or_engine):
    @event.listens_for(Engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):  # noqa: ARG001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def _hash_and_size(path):
    sha256 = hashlib.sha256()
    size = 0
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
            size += len(chunk)
    return sha256.hexdigest(), size


def save_uploaded_pdf(file_storage, upload_root, irc_type, year, month_key=None):
    """Saves an already-validated PDF (a werkzeug FileStorage) under
    upload_root/<year>/<MonthFolder>/, using a collision-proof stored
    filename, and returns a dict ready to spread into UploadedFile(**dict).

    IMPORTANT: pdfplumber consumes the upload stream when it reads the
    PDF for extraction. Call `file_storage.stream.seek(0)` before
    calling this function (this function also seeks defensively, but
    doing it explicitly at the call site keeps the ordering obvious).
    """
    if month_key is not None and month_key not in MONTH_KEYS:
        raise InvalidUploadError(f"Unknown month_key: {month_key!r}")

    folder_name = MONTH_FOLDER_NAMES[month_key] if month_key else "Unspecified"
    relative_dir = os.path.join(str(year), folder_name)
    absolute_dir = os.path.join(upload_root, relative_dir)
    os.makedirs(absolute_dir, exist_ok=True)

    original_filename = file_storage.filename or "upload.pdf"
    safe_original = secure_filename(original_filename) or "upload.pdf"
    stored_filename = f"{irc_type}_{uuid.uuid4().hex[:8]}_{safe_original}"
    absolute_path = os.path.join(absolute_dir, stored_filename)

    file_storage.stream.seek(0)
    file_storage.save(absolute_path)

    content_hash, file_size = _hash_and_size(absolute_path)

    return {
        "irc_type": irc_type,
        "original_filename": original_filename,
        "stored_filename": stored_filename,
        "relative_path": os.path.join(relative_dir, stored_filename),
        "year": year,
        "month_key": month_key,
        "month_name": folder_name,
        "file_size": file_size,
        "content_hash": content_hash,
    }


def delete_uploaded_file(uploaded_file, upload_root):
    """The single entry point for deleting an uploaded PDF.

    1. Deletes the file from disk (best-effort -- a file already
       missing on disk shouldn't block the DB cleanup).
    2. Deletes the UploadedFile row, which cascades (via the
       relationships defined in models.py) to every IRC1a rating,
       IRC1b count, IRC2a status, etc. that pointed back to it.
    3. Prunes now-empty year/month folders so the upload tree doesn't
       accumulate clutter over time.

    Call this instead of `db.session.delete(uploaded_file)` directly,
    so the file on disk and the DB never drift out of sync.
    """
    absolute_path = os.path.join(upload_root, uploaded_file.relative_path)

    try:
        os.remove(absolute_path)
    except FileNotFoundError:
        pass

    db.session.delete(uploaded_file)  # cascades to all linked IRC records
    db.session.commit()

    month_dir = os.path.dirname(absolute_path)
    year_dir = os.path.dirname(month_dir)
    for d in (month_dir, year_dir):
        try:
            if os.path.isdir(d) and not os.listdir(d):
                os.rmdir(d)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# One-time school master-list seed (source: irc2a.js's SCHOOLS + DEDP_PRIORITY)
# ---------------------------------------------------------------------------
_SCHOOLS_SEED = [
    ("Antipolo City Senior High School", "secondary"),
    ("Antipolo City SPED Center", "elementary"),
    ("Antipolo National Science and Technology HS", "secondary"),
    ("Antipolo NHS", "secondary"),
    ("Apia Integrated School", "secondary"),
    ("Bagong Nayon I ES", "elementary"),
    ("Bagong Nayon II ES", "elementary"),
    ("Bagong Nayon II NHS", "secondary"),
    ("Bagong Nayon IV ES", "elementary"),
    ("Binayoyo Integrated School", "secondary"),
    ("Cabading ES", "elementary"),
    ("Calawis ES", "elementary"),
    ("Calawis NHS", "secondary"),
    ("Canumay ES", "elementary"),
    ("Canumay NHS", "secondary"),
    ("Cupang ES", "elementary"),
    ("Cupang ES Annex", "elementary"),
    ("Cupang NHS", "secondary"),
    ("Dalig ES", "elementary"),
    ("Dalig NHS", "secondary"),
    ("Dela Paz ES", "elementary"),
    ("Dela Paz NHS", "secondary"),
    ("Inuman ES", "elementary"),
    ("Isaias S. Tapales ES", "elementary"),
    ("Jesus S. Cabarrus ES", "elementary"),
    ("Juan Sumulong ES", "elementary"),
    ("Kaila ES", "elementary"),
    ("Kaysakat ES", "elementary"),
    ("Kaysakat NHS", "secondary"),
    ("Knights of Columbus ES", "elementary"),
    ("Libis ES", "elementary"),
    ("Lores ES", "elementary"),
    ("Mambugan I ES", "elementary"),
    ("Mambugan II ES", "elementary"),
    ("Mambugan NHS", "secondary"),
    ("Marcelino M. Santos NHS", "secondary"),
    ("Maximo L. Gatlabayan MNHS", "secondary"),
    ("Mayamot ES", "elementary"),
    ("Mayamot NHS", "secondary"),
    ("Muntindilaw ES", "elementary"),
    ("Muntindilaw NHS", "secondary"),
    ("Nazarene Ville ES", "elementary"),
    ("Old Boso-Boso ES", "elementary"),
    ("Old Boso-Boso NHS", "secondary"),
    ("Paglitaw ES", "elementary"),
    ("Pantay ES", "elementary"),
    ("Peace Village ES", "elementary"),
    ("Pe\u00f1afrancia ES", "elementary"),
    ("Pe\u00f1afrancia ES Annex", "elementary"),
    ("Rizza ES", "elementary"),
    ("Rizza NHS", "secondary"),
    ("San Antonio Village ES", "elementary"),
    ("San Isidro ES", "elementary"),
    ("San Isidro NHS", "secondary"),
    ("San Jose NHS", "secondary"),
    ("San Joseph ES", "elementary"),
    ("San Juan NHS", "secondary"),
    ("San Luis ES", "elementary"),
    ("San Roque NHS", "secondary"),
    ("San Ysiro ES", "elementary"),
    ("Sapinit ES", "elementary"),
    ("Sta. Cruz ES", "elementary"),
    ("Sumilang ES", "elementary"),
    ("Taguete ES", "elementary"),
    ("Tanza ES", "elementary"),
    ("Teofila Z. Rovero MES", "elementary"),
    ("Upper Kilingan ES", "elementary"),
]

_DEDP_PRIORITY = {
    "Antipolo NHS", "Bagong Nayon I ES", "Bagong Nayon II ES", "Bagong Nayon II NHS",
    "Bagong Nayon IV ES", "Cupang ES", "Dalig NHS", "Dela Paz ES",
    "Jesus S. Cabarrus ES", "Juan Sumulong ES", "Kaysakat ES", "Lores ES",
    "Mambugan I ES", "Mambugan II ES", "Mambugan NHS", "Maximo L. Gatlabayan MNHS",
    "Mayamot ES", "Muntindilaw ES", "Peace Village ES", "Pe\u00f1afrancia ES",
    "Rizza ES", "San Antonio Village ES", "San Isidro ES", "San Isidro NHS",
    "San Jose NHS", "Tanza ES",
}


def seed_schools():
    """Idempotent: only inserts schools that don't already exist by name.
    Run this once after `db.create_all()` (see app.py's `init-db` CLI
    command). Re-running it later is safe -- it won't create duplicates
    or touch existing rows' DEDP flags."""
    existing_names = {name for (name,) in db.session.query(School.name).all()}

    new_rows = [
        School(name=name, level=level, is_dedp_priority=name in _DEDP_PRIORITY)
        for name, level in _SCHOOLS_SEED
        if name not in existing_names
    ]

    if new_rows:
        db.session.bulk_save_objects(new_rows)
        db.session.commit()

    return len(new_rows)