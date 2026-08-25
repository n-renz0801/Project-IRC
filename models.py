"""
SGOD_PMES -- Database Models
=============================
SQLAlchemy models for IRC1a through IRC4, plus the central `UploadedFile`
table that every PDF-extracted record links back to.

Design notes
------------
* Every table that CAN be populated from an uploaded PDF carries a
  nullable `uploaded_file_id` FK with `ondelete="CASCADE"`. Manually
  typed rows (no PDF behind them) simply leave it NULL.

* Cascade deletion is wired two ways so it holds up no matter how a
  file gets deleted later:
    1. DB-level: `ondelete="CASCADE"` on the FK column + `passive_deletes=True`
       on the relationship. This requires SQLite's `PRAGMA foreign_keys=ON`,
       which `storage.py` / `app.py` turn on for every connection.
    2. ORM-level: `cascade="all, delete-orphan"` on the relationship, so
       `db.session.delete(uploaded_file)` cleans up children even before
       the DB-level pragma is considered.
  Belt-and-suspenders: (1) protects you if a file row is ever deleted
  outside the ORM (a script, a DB browser, etc.); (2) is what actually
  fires in the normal Flask-route deletion flow.

* `year` + `month_key` live on every monthly table, so the schema is
  already multi-year even though the current UI only shows one year at
  a time. Nothing here assumes a single year.

* `IRC4Entry` is a deliberately generic placeholder -- no irc4.html/js
  was provided yet, so its shape is unknown. It stores a JSON payload
  so the rest of the pipeline (upload, cascade delete, file manager) is
  already wired up; swap the `payload` column for real typed columns
  once you share IRC4's structure.
"""

from datetime import datetime

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

MONTH_KEYS = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
]

TA_STATUS_PROVIDED = "provided"
TA_STATUS_UNPROVIDED = "unprovided"

SCHOOL_LEVEL_ELEMENTARY = "elementary"
SCHOOL_LEVEL_SECONDARY = "secondary"


# ---------------------------------------------------------------------------
# Central file registry
# ---------------------------------------------------------------------------
class UploadedFile(db.Model):
    """One row per PDF ever accepted by an /extract endpoint. Deleting
    this row (via the file manager) cascades to every extracted record
    that points back to it, across every IRC table."""

    __tablename__ = "uploaded_files"

    id = db.Column(db.Integer, primary_key=True)

    # Which report this PDF was uploaded for: 'irc1a', 'irc1b', 'irc2a', ...
    irc_type = db.Column(db.String(10), nullable=False, index=True)

    original_filename = db.Column(db.String(255), nullable=False)
    stored_filename = db.Column(db.String(255), nullable=False)

    # Path *relative to UPLOAD_ROOT*, e.g. "2026/Jan/irc1a_9f3c1a2b_july.pdf".
    # Always derive the absolute path via UPLOAD_ROOT + relative_path --
    # never hardcode an absolute path, so the DB stays portable between
    # the dev machine and the packaged .exe.
    relative_path = db.Column(db.String(500), nullable=False, unique=True)

    year = db.Column(db.Integer, nullable=False, index=True)
    month_key = db.Column(db.String(3), nullable=True, index=True)   # nullable: not every IRC is monthly
    month_name = db.Column(db.String(20), nullable=True)

    file_size = db.Column(db.Integer, nullable=True)
    content_hash = db.Column(db.String(64), nullable=True, index=True)  # sha256, lets you flag re-uploads of the same PDF

    uploaded_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    # --- Reverse relationships: every table below has a matching one of these ---
    ratings = db.relationship(
        "IRC1ARating", backref="source_file",
        cascade="all, delete-orphan", passive_deletes=True,
    )
    customer_counts = db.relationship(
        "IRC1BCustomerCount", backref="source_file",
        cascade="all, delete-orphan", passive_deletes=True,
    )
    school_statuses = db.relationship(
        "IRC2ASchoolStatus", backref="source_file",
        cascade="all, delete-orphan", passive_deletes=True,
    )
    ta_frequencies = db.relationship(
        "IRC2BTAFrequency", backref="source_file",
        cascade="all, delete-orphan", passive_deletes=True,
    )
    irc3_statuses = db.relationship(
        "IRC3Status", backref="source_file",
        cascade="all, delete-orphan", passive_deletes=True,
    )
    irc4_entries = db.relationship(
        "IRC4Entry", backref="source_file",
        cascade="all, delete-orphan", passive_deletes=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "irc_type": self.irc_type,
            "original_filename": self.original_filename,
            "relative_path": self.relative_path,
            "year": self.year,
            "month_key": self.month_key,
            "month_name": self.month_name,
            "file_size": self.file_size,
            "uploaded_at": self.uploaded_at.isoformat(),
        }


# ---------------------------------------------------------------------------
# School master list (shared by IRC2a + IRC2b)
# ---------------------------------------------------------------------------
class School(db.Model):
    """Master list of schools. Seeded once from the SCHOOLS/DEDP_PRIORITY
    constants currently hardcoded in irc2a.js -- see storage.py's
    `seed_schools()` helper. Not deleted via cascade from UploadedFile,
    since a school's identity shouldn't disappear just because a PDF
    that once mentioned it gets deleted."""

    __tablename__ = "schools"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False, unique=True)
    level = db.Column(db.String(10), nullable=False)  # SCHOOL_LEVEL_ELEMENTARY | SCHOOL_LEVEL_SECONDARY
    is_dedp_priority = db.Column(db.Boolean, nullable=False, default=False)

    ta_statuses = db.relationship("IRC2ASchoolStatus", backref="school", cascade="all, delete-orphan")
    ta_frequencies = db.relationship("IRC2BTAFrequency", backref="school", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "level": self.level,
            "is_dedp_priority": self.is_dedp_priority,
        }


# ---------------------------------------------------------------------------
# IRC1a -- 10 TA indicators x monthly rating (1-5)
# ---------------------------------------------------------------------------
class IRC1ARating(db.Model):
    __tablename__ = "irc1a_ratings"
    __table_args__ = (
        db.UniqueConstraint("year", "month_key", "indicator_id", name="uq_irc1a_year_month_indicator"),
    )

    id = db.Column(db.Integer, primary_key=True)
    uploaded_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id", ondelete="CASCADE"), nullable=True)

    year = db.Column(db.Integer, nullable=False, index=True)
    month_key = db.Column(db.String(3), nullable=False)
    indicator_id = db.Column(db.Integer, nullable=False)  # 1-10
    rating = db.Column(db.Float, nullable=False)  # 1.000-5.000

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# IRC1b -- monthly "No. of Customers Served"
# ---------------------------------------------------------------------------
class IRC1BCustomerCount(db.Model):
    __tablename__ = "irc1b_customer_counts"
    __table_args__ = (
        db.UniqueConstraint("year", "month_key", name="uq_irc1b_year_month"),
    )

    id = db.Column(db.Integer, primary_key=True)
    uploaded_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id", ondelete="CASCADE"), nullable=True)

    year = db.Column(db.Integer, nullable=False, index=True)
    month_key = db.Column(db.String(3), nullable=False)
    customer_count = db.Column(db.Integer, nullable=False, default=0)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# IRC2a -- current provided/unprovided status per school (the Kanban board)
# ---------------------------------------------------------------------------
class IRC2ASchoolStatus(db.Model):
    """Current TA-provision status of a school for a given year -- this
    is the Kanban board's source of truth. `provided_month_key` records
    *when* it was marked provided for display purposes; it is not a
    monthly time series (that's IRC2b)."""

    __tablename__ = "irc2a_school_status"
    __table_args__ = (
        db.UniqueConstraint("school_id", "year", name="uq_irc2a_school_year"),
    )

    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    uploaded_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id", ondelete="CASCADE"), nullable=True)

    year = db.Column(db.Integer, nullable=False, index=True)
    status = db.Column(db.String(11), nullable=False, default=TA_STATUS_UNPROVIDED)
    provided_month_key = db.Column(db.String(3), nullable=True)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# IRC2b -- monthly TA-provided checkbox grid, per school
# ---------------------------------------------------------------------------
class IRC2BTAFrequency(db.Model):
    """One row per school/year/month checkbox in the IRC2b grid."""

    __tablename__ = "irc2b_ta_frequency"
    __table_args__ = (
        db.UniqueConstraint("school_id", "year", "month_key", name="uq_irc2b_school_year_month"),
    )

    id = db.Column(db.Integer, primary_key=True)
    school_id = db.Column(db.Integer, db.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False)
    uploaded_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id", ondelete="CASCADE"), nullable=True)

    year = db.Column(db.Integer, nullable=False, index=True)
    month_key = db.Column(db.String(3), nullable=False)
    provided = db.Column(db.Boolean, nullable=False, default=False)


# ---------------------------------------------------------------------------
# IRC3 -- DEDP / Non-DEDP TA provision summary + targets, per year
# ---------------------------------------------------------------------------
class IRC3Status(db.Model):
    """One row per year. Currently entered manually in the UI (computed
    by the user from their IRC2 results), so `uploaded_file_id` stays
    NULL unless/until IRC3 gets its own PDF extractor."""

    __tablename__ = "irc3_status"
    __table_args__ = (
        db.UniqueConstraint("year", name="uq_irc3_year"),
    )

    id = db.Column(db.Integer, primary_key=True)
    uploaded_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id", ondelete="CASCADE"), nullable=True)

    year = db.Column(db.Integer, nullable=False, index=True)
    dedp_ta_count = db.Column(db.Integer, nullable=False, default=0)
    dedp_target = db.Column(db.Integer, nullable=False, default=0)
    nondedp_ta_count = db.Column(db.Integer, nullable=False, default=0)
    nondedp_target = db.Column(db.Integer, nullable=False, default=0)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# IRC4 -- placeholder (structure not yet provided)
# ---------------------------------------------------------------------------
class IRC4Entry(db.Model):
    """Generic placeholder until irc4.html/js is shared. `payload` holds
    whatever fields IRC4 turns out to need as JSON, so nothing about the
    upload/cascade-delete/file-manager plumbing has to change later --
    only this model (and its route) gets replaced with real columns."""

    __tablename__ = "irc4_entries"

    id = db.Column(db.Integer, primary_key=True)
    uploaded_file_id = db.Column(db.Integer, db.ForeignKey("uploaded_files.id", ondelete="CASCADE"), nullable=True)

    year = db.Column(db.Integer, nullable=False, index=True)
    month_key = db.Column(db.String(3), nullable=True)
    payload = db.Column(db.JSON, nullable=False, default=dict)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)