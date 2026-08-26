"""
SGOD_PMES -- Database Models
=============================
SQLAlchemy models for IRC1a through IRC4, IRC5, IRC6, IRC7, and IRC8b, plus
the central `UploadedFile` table that every PDF-extracted record links
back to.

IRC5, IRC6, IRC7, and IRC8b have no PDF extraction pipeline -- everything
in those tables is entered by hand through their own tab's UI, so none of
their models carry an `uploaded_file_id` column. See the section header
above each one for its specific shape.

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

* `UploadedFile.irc_type` is nullable. A per-tab upload (irc1a.html,
  irc1b.html, irc2a.html uploading directly on their own tab) still
  sets it to that single type, same as before. The home page's
  combined monthly upload can feed *several* report tables from one
  PDF, so it leaves `irc_type` NULL and represents "the file for this
  month" instead -- use `UploadedFile.linked_irc_types()` to see which
  section tables actually ended up with rows pointing back to it.
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

IRC5_NATURE_FUNDED = "Funded"
IRC5_NATURE_NONFUNDED = "Non-Funded"

IRC6_KIND_GOAL = "goal"
IRC6_KIND_OUTCOME = "outcome"
IRC6_KIND_OUTPUT = "output"

IRC7_COLUMN_TYPE_TEXT = "text"
IRC7_COLUMN_TYPE_NUMBER = "number"
IRC7_COLUMN_TYPE_PARAGRAPH = "paragraph"

IRC8B_SECTION_CBC = "cbc"
IRC8B_SECTION_CS = "cs"

IRC8A_CATEGORY_QUALITY = "quality"
IRC8A_CATEGORY_EFFICIENCY = "efficiency"
IRC8A_CATEGORY_TIMELINESS = "timeliness"
IRC8A_CATEGORIES = (IRC8A_CATEGORY_QUALITY, IRC8A_CATEGORY_EFFICIENCY, IRC8A_CATEGORY_TIMELINESS)


# ---------------------------------------------------------------------------
# Central file registry
# ---------------------------------------------------------------------------
class UploadedFile(db.Model):
    """One row per PDF ever accepted by an /extract endpoint. Deleting
    this row (via the file manager) cascades to every extracted record
    that points back to it, across every IRC table."""

    __tablename__ = "uploaded_files"

    id = db.Column(db.Integer, primary_key=True)

    # Which single report this PDF was uploaded for: 'irc1a', 'irc1b',
    # 'irc2a', ... . NULL for a home-page combined upload that may feed
    # more than one report table -- see `linked_irc_types()` below for
    # what such a file actually ended up populating.
    irc_type = db.Column(db.String(10), nullable=True, index=True)

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

    def linked_irc_types(self):
        """Which section tables this file actually has rows in -- the
        multi-section replacement for relying on the single `irc_type`
        column. A home-page combined upload (irc_type=NULL) can link to
        several of these at once; a per-tab upload will normally show
        just the one matching its `irc_type`, once its /import step has
        run (right after /extract, before /import, this is still empty
        -- that's expected, nothing has been written yet)."""
        types = []
        if self.ratings:
            types.append("irc1a")
        if self.customer_counts:
            types.append("irc1b")
        if self.school_statuses:
            types.append("irc2a")
        if self.ta_frequencies:
            types.append("irc2b")
        if self.irc3_statuses:
            types.append("irc3")
        if self.irc4_entries:
            types.append("irc4")
        return types

    def to_dict(self):
        return {
            "id": self.id,
            "irc_type": self.irc_type,
            "linked_irc_types": self.linked_irc_types(),
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


# ---------------------------------------------------------------------------
# IRC5 -- Post Program Evaluation Results (one row per activity)
#
# No PDF pipeline for this one (per the SMME Section's evaluation results,
# typed in by hand), so there's no uploaded_file_id here -- unlike the
# tables above, nothing here is ever populated from an /extract endpoint.
# `year` still exists so entries file under a report period the same way
# every other table in this app does.
# ---------------------------------------------------------------------------
class IRC5Entry(db.Model):
    __tablename__ = "irc5_entries"

    id = db.Column(db.Integer, primary_key=True)

    year = db.Column(db.Integer, nullable=False, index=True)

    title = db.Column(db.String(255), nullable=False)
    nature = db.Column(db.String(20), nullable=False)  # IRC5_NATURE_FUNDED | IRC5_NATURE_NONFUNDED

    # List of ISO "YYYY-MM-DD" strings, e.g. ["2026-12-11", "2026-12-14", ...].
    # `date_display` caches the frontend's hybrid "Dec. 11, 14-16, 2026"
    # formatting of that same list, so the table can render without
    # recomputing it -- it's derived data, kept in sync by the save route.
    date_iso_list = db.Column(db.JSON, nullable=False, default=list)
    date_display = db.Column(db.String(255), nullable=False, default="")

    participants = db.Column(db.Text, nullable=True)

    # Overall Rating (1.00-4.00) and its derived Descriptive Value
    # (Strongly Agree / Agree / Disagree / Strongly Disagree, per the
    # 0.75-wide bands in irc5.js's computeDescVal). `desc_val` is cached
    # here for the same reason as `date_display` -- it's recomputed from
    # `rating` on every save, never trusted as independently-entered data.
    rating = db.Column(db.Float, nullable=True)
    desc_val = db.Column(db.String(30), nullable=True)

    indicator = db.Column(db.Text, nullable=True)
    cause = db.Column(db.Text, nullable=True)
    measures = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "year": self.year,
            "title": self.title,
            "nature": self.nature,
            "dateIsoList": self.date_iso_list or [],
            "dateDisplay": self.date_display,
            "participants": self.participants,
            "rating": self.rating,
            "descVal": self.desc_val,
            "indicator": self.indicator,
            "cause": self.cause,
            "measures": self.measures,
        }


# ---------------------------------------------------------------------------
# IRC6 -- Monitoring & Evaluation Plan (Goal / Outcome / Output rows)
#
# One "goal" row and one "outcome" row per year are expected to exist
# (seeded the same way irc6.js seeds them client-side), plus any number of
# "output" rows. `sort_order` preserves each output's position -- outputs
# are numbered by position at render time (see irc6.js's outputNumberFor),
# never stored as a literal "Output N" value, so deleting one still leaves
# the rest numbering cleanly.
#
# The partial unique index below enforces "at most one goal row and one
# outcome row per year" at the DB level without constraining "output" rows,
# which are meant to repeat.
# ---------------------------------------------------------------------------
class IRC6Entry(db.Model):
    __tablename__ = "irc6_entries"
    __table_args__ = (
        db.Index(
            "uq_irc6_goal_outcome_per_year",
            "year", "kind",
            unique=True,
            sqlite_where=db.text("kind != 'output'"),
        ),
    )

    id = db.Column(db.Integer, primary_key=True)

    year = db.Column(db.Integer, nullable=False, index=True)
    kind = db.Column(db.String(10), nullable=False)  # IRC6_KIND_GOAL | IRC6_KIND_OUTCOME | IRC6_KIND_OUTPUT

    # Only meaningful when kind == IRC6_KIND_OUTPUT; blank for goal/outcome.
    title = db.Column(db.String(255), nullable=False, default="")

    objectives = db.Column(db.Text, nullable=True)
    indicators = db.Column(db.Text, nullable=True)
    definition = db.Column(db.Text, nullable=True)

    dc_source = db.Column(db.Text, nullable=True)   # Data Collection: Source/Methods
    dc_person = db.Column(db.String(255), nullable=True)
    dc_freq = db.Column(db.String(255), nullable=True)

    da_used = db.Column(db.Text, nullable=True)      # Data Analysis: Data Used
    da_person = db.Column(db.String(255), nullable=True)
    da_freq = db.Column(db.String(255), nullable=True)

    users = db.Column(db.Text, nullable=True)         # Users of M&E Results

    rep_comm = db.Column(db.Text, nullable=True)      # Reporting: Communication Strategies
    rep_freq = db.Column(db.String(255), nullable=True)

    sort_order = db.Column(db.Integer, nullable=False, default=0)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "year": self.year,
            "kind": self.kind,
            "title": self.title,
            "objectives": self.objectives,
            "indicators": self.indicators,
            "definition": self.definition,
            "dcSource": self.dc_source,
            "dcPerson": self.dc_person,
            "dcFreq": self.dc_freq,
            "daUsed": self.da_used,
            "daPerson": self.da_person,
            "daFreq": self.da_freq,
            "users": self.users,
            "repComm": self.rep_comm,
            "repFreq": self.rep_freq,
        }


# ---------------------------------------------------------------------------
# IRC7 -- SGOD Dashboard Data (user-extensible spreadsheet)
#
# irc7.html ships with a *fixed* set of rows (one per school / curricular
# offering combination -- some schools appear twice, once per offering) and
# a *fixed* set of leading columns (School ID, School Name, Curricular
# Offering, DLC, Status, School Classification). On top of that, the user
# can add any number of extra columns (grouped or standalone, each typed
# text/number/paragraph) via the "Add Column" modal, and fill in a value
# for each one against each row.
#
# That's modeled here as three tables instead of one wide table:
#   - IRC7Row     -- the fixed reference rows, seeded once (see
#                    storage.seed_irc7_rows()), analogous to School.
#   - IRC7Column  -- the user-defined columns/groups, added and removed
#                    freely through the UI.
#   - IRC7CellValue -- one value per (row, column, year) -- EAV-style,
#                    since the set of columns is unbounded and changes at
#                    runtime. `value` is always stored as text; number
#                    columns are parsed/validated at the API layer.
# `year` lives on IRC7CellValue (not IRC7Row/IRC7Column) since the rows and
# the column definitions are shared across years, but the entered data for
# a given school+column is naturally year-scoped, like everything else in
# this app that isn't a static master list.
# ---------------------------------------------------------------------------
class IRC7Row(db.Model):
    """One fixed reference row: a school, or a school's specific curricular
    offering. Seeded once from the dataset baked into the old irc7.html
    (see storage.seed_irc7_rows()); not created/deleted through the UI."""

    __tablename__ = "irc7_rows"

    id = db.Column(db.Integer, primary_key=True)

    # DepEd School ID as printed on the report -- kept as a string since a
    # few source rows have it blank (e.g. "Dela Paz ES"), and it's never
    # used arithmetically. Deliberately NOT unique: several rows legitimately
    # share the same school_id_code (one per curricular offering).
    school_id_code = db.Column(db.String(20), nullable=True)
    school_name = db.Column(db.String(150), nullable=False)
    curricular_offering = db.Column(db.String(50), nullable=False)
    dlc = db.Column(db.String(10), nullable=True)  # District Learning Cluster, e.g. "II-D"
    dedp_status = db.Column(db.String(11), nullable=False, default="non-DEDP")  # "DEDP" | "non-DEDP"
    classification = db.Column(db.String(20), nullable=True)  # Small / Medium / Large / Very Large

    # Preserves the original on-screen row order (seed order), since rows
    # aren't alphabetically unambiguous on their own (duplicate names).
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    cell_values = db.relationship(
        "IRC7CellValue", backref="row",
        cascade="all, delete-orphan", passive_deletes=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "schoolIdCode": self.school_id_code,
            "schoolName": self.school_name,
            "curricularOffering": self.curricular_offering,
            "dlc": self.dlc,
            "dedpStatus": self.dedp_status,
            "classification": self.classification,
            "sortOrder": self.sort_order,
        }


class IRC7Column(db.Model):
    """A user-added column, standalone or part of a named group. Deleting a
    column (or a whole group) cascades to every cell value stored under
    it, mirroring irc7.js's removeColumn()/removeGroup() UI behavior."""

    __tablename__ = "irc7_columns"

    id = db.Column(db.Integer, primary_key=True)

    name = db.Column(db.String(150), nullable=False)
    type = db.Column(db.String(20), nullable=False, default=IRC7_COLUMN_TYPE_TEXT)

    # Null for a standalone column; columns sharing the same group_name are
    # rendered under one spanning header, same as irc7.js's `groupName`.
    group_name = db.Column(db.String(150), nullable=True)

    sort_order = db.Column(db.Integer, nullable=False, default=0)

    cell_values = db.relationship(
        "IRC7CellValue", backref="column",
        cascade="all, delete-orphan", passive_deletes=True,
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "groupName": self.group_name,
            "sortOrder": self.sort_order,
        }


class IRC7CellValue(db.Model):
    __tablename__ = "irc7_cell_values"
    __table_args__ = (
        db.UniqueConstraint("row_id", "column_id", "year", name="uq_irc7_row_column_year"),
    )

    id = db.Column(db.Integer, primary_key=True)
    row_id = db.Column(db.Integer, db.ForeignKey("irc7_rows.id", ondelete="CASCADE"), nullable=False)
    column_id = db.Column(db.Integer, db.ForeignKey("irc7_columns.id", ondelete="CASCADE"), nullable=False)

    year = db.Column(db.Integer, nullable=False, index=True)
    value = db.Column(db.Text, nullable=True)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# IRC8b -- Core Behavioral Competencies and Core Skills (rating sheet)
#
# The sections/subsections/criteria themselves are a fixed, hardcoded list
# (see irc8b.js's DATA) -- nothing about that structure is stored in the DB.
# Only the 1-5 ratings the user assigns per criterion are persisted, keyed
# by which criterion they belong to (subsection_key + its 0-based position
# in that subsection's criteria list) plus year, so a rating survives a
# reload but the criteria text/order still lives in the frontend.
# ---------------------------------------------------------------------------
class IRC8BRating(db.Model):
    __tablename__ = "irc8b_ratings"
    __table_args__ = (
        db.UniqueConstraint("year", "subsection_key", "criterion_index", name="uq_irc8b_year_subsection_criterion"),
    )

    id = db.Column(db.Integer, primary_key=True)

    year = db.Column(db.Integer, nullable=False, index=True)
    section_key = db.Column(db.String(10), nullable=False)      # IRC8B_SECTION_CBC | IRC8B_SECTION_CS
    subsection_key = db.Column(db.String(40), nullable=False)   # e.g. "self_management"
    criterion_index = db.Column(db.Integer, nullable=False)     # 0-based position within the subsection's criteria

    rating = db.Column(db.Integer, nullable=True)  # 1-5, or NULL if cleared

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# IRC8a -- Individual Performance Commitment and Review Form (IPCRF)
#
# No PDF pipeline here (per irc5/irc6/irc7/irc8b), so nothing below carries
# an `uploaded_file_id` -- every row is typed in by hand through the
# "Add KRA" / "Add Objective" / rubric modals in irc8a.js.
#
# The KRA -> Objective -> rubric-indicator hierarchy from irc8a.js's old
# in-memory `state.kras` tree maps onto three tables:
#
#   IRC8AKra        -- one row per Key Result Area. `year` lives here (the
#                       top of the tree) since the whole IPCRF is an annual
#                       document; nothing below cascades to a *different*
#                       year, so Objective/Indicator don't repeat it.
#   IRC8AObjective  -- one row per Objective under a KRA. Carries the
#                       Planning fields (timeline) and Evaluation fields
#                       (MOV link, actual results, and the three per-
#                       category ratings) directly as columns, since each
#                       objective has exactly one of each -- no need for
#                       EAV here the way IRC7's unbounded columns needed it.
#   IRC8AIndicator  -- one row per rubric line ("what earns a 3" etc.)
#                       under one of an objective's three categories
#                       (quality/efficiency/timeliness). irc8a.js caps
#                       these at 5 per category with a unique rate 1-5
#                       each (see populateRateOptions's "already used"
#                       filtering) -- enforced here via the unique
#                       constraint below rather than only in the UI.
#
# `rating_quality` / `rating_efficiency` / `rating_timeliness` on
# IRC8AObjective are the *selected* rating for that category -- set either
# by clicking a rubric indicator (irc8a.js's select-indicator action) or
# picking a value directly from that category's dropdown. They are stored
# independently of IRC8AIndicator on purpose: irc8a.js's delete-rubric
# handler explicitly leaves a previously-selected rating in place even
# after its backing indicator row is deleted ("it may have been set
# manually too"), so the rating is never *derived* from the indicator list
# -- it's its own fact.
#
# The overall Average (per objective) and Score (Average x Objective
# Weight), and the KRA-list-wide Total KRA Weight / Overall Rating summary,
# are all cheap to recompute from the columns above on every read, so none
# of them are persisted -- same treatment as IRC5's rating-band lookup,
# just done without a cached column since nothing here needs to survive a
# schema change to a different formula.
# ---------------------------------------------------------------------------
class IRC8AKra(db.Model):
    __tablename__ = "irc8a_kras"

    id = db.Column(db.Integer, primary_key=True)

    year = db.Column(db.Integer, nullable=False, index=True)
    text = db.Column(db.Text, nullable=False, default="")
    weight = db.Column(db.Float, nullable=True)  # percent, 0-100

    # Preserves on-screen KRA order (also drives the palette color cycle
    # and the "Key Result Area N" numbering in irc8a.js) -- assigned as
    # max(sort_order)+1 at creation time; there's no drag-reorder in the
    # current UI, so nothing else ever rewrites it.
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    objectives = db.relationship(
        "IRC8AObjective", backref="kra",
        cascade="all, delete-orphan", passive_deletes=True,
        order_by="IRC8AObjective.sort_order",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "year": self.year,
            "text": self.text,
            "weight": self.weight,
            "objectives": [o.to_dict() for o in self.objectives],
        }


class IRC8AObjective(db.Model):
    __tablename__ = "irc8a_objectives"

    id = db.Column(db.Integer, primary_key=True)
    kra_id = db.Column(db.Integer, db.ForeignKey("irc8a_kras.id", ondelete="CASCADE"), nullable=False)

    text = db.Column(db.Text, nullable=False, default="")
    weight = db.Column(db.Float, nullable=True)  # percent, 0-100

    # Planning
    timeline = db.Column(db.Text, nullable=True)

    # Evaluation
    mov = db.Column(db.String(2000), nullable=True)   # Means of Verification link
    actual_results = db.Column(db.Text, nullable=True)

    # Selected rating per category -- independent of IRC8AIndicator, see
    # the module-level docstring above for why.
    rating_quality = db.Column(db.Integer, nullable=True)      # 1-5
    rating_efficiency = db.Column(db.Integer, nullable=True)   # 1-5
    rating_timeliness = db.Column(db.Integer, nullable=True)   # 1-5

    # Preserves on-screen order within its KRA -- drives the "Objective A/B/C..."
    # lettering (letterLabel(objIndex) in irc8a.js) by position, not by id.
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    indicators = db.relationship(
        "IRC8AIndicator", backref="objective",
        cascade="all, delete-orphan", passive_deletes=True,
    )

    _RATING_COLUMNS = {
        IRC8A_CATEGORY_QUALITY: "rating_quality",
        IRC8A_CATEGORY_EFFICIENCY: "rating_efficiency",
        IRC8A_CATEGORY_TIMELINESS: "rating_timeliness",
    }

    def rating_for(self, category):
        return getattr(self, self._RATING_COLUMNS[category], None)

    def set_rating(self, category, value):
        setattr(self, self._RATING_COLUMNS[category], value)

    def indicators_for(self, category):
        # Sorted highest rate first, matching irc8a.js's renderIndicatorGroup.
        return sorted(
            (i for i in self.indicators if i.category == category),
            key=lambda i: i.rate,
            reverse=True,
        )

    def average(self):
        values = [
            v for v in (self.rating_quality, self.rating_efficiency, self.rating_timeliness)
            if v is not None
        ]
        if not values:
            return None
        return sum(values) / len(values)

    def score(self):
        avg = self.average()
        if avg is None or self.weight is None:
            return None
        return avg * (self.weight / 100)

    def to_dict(self):
        return {
            "id": self.id,
            "kraId": self.kra_id,
            "text": self.text,
            "weight": self.weight,
            "timeline": self.timeline,
            "mov": self.mov,
            "actualResults": self.actual_results,
            "ratings": {
                IRC8A_CATEGORY_QUALITY: self.rating_quality,
                IRC8A_CATEGORY_EFFICIENCY: self.rating_efficiency,
                IRC8A_CATEGORY_TIMELINESS: self.rating_timeliness,
            },
            "average": self.average(),
            "score": self.score(),
            IRC8A_CATEGORY_QUALITY: [i.to_dict() for i in self.indicators_for(IRC8A_CATEGORY_QUALITY)],
            IRC8A_CATEGORY_EFFICIENCY: [i.to_dict() for i in self.indicators_for(IRC8A_CATEGORY_EFFICIENCY)],
            IRC8A_CATEGORY_TIMELINESS: [i.to_dict() for i in self.indicators_for(IRC8A_CATEGORY_TIMELINESS)],
        }


class IRC8AIndicator(db.Model):
    """One rubric line ("what earns this rating level") under one of an
    objective's three Planning categories. irc8a.js caps these at 5 per
    (objective, category) with a unique rate 1-5 each -- see
    populateRateOptions's "already used" filtering -- enforced here too."""

    __tablename__ = "irc8a_indicators"
    __table_args__ = (
        db.UniqueConstraint("objective_id", "category", "rate", name="uq_irc8a_objective_category_rate"),
    )

    id = db.Column(db.Integer, primary_key=True)
    objective_id = db.Column(db.Integer, db.ForeignKey("irc8a_objectives.id", ondelete="CASCADE"), nullable=False)

    category = db.Column(db.String(12), nullable=False)  # IRC8A_CATEGORY_*
    rate = db.Column(db.Integer, nullable=False)          # 1-5
    label = db.Column(db.Text, nullable=False, default="")

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "objectiveId": self.objective_id,
            "category": self.category,
            "rate": self.rate,
            "label": self.label,
        }