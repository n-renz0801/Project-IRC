import os
from datetime import datetime
from flask import Flask, render_template, abort, request, jsonify
import pdfplumber
import re

from models import (
    db,
    School,
    UploadedFile,
    IRC1ARating,
    IRC1BCustomerCount,
    IRC2ASchoolStatus,
    IRC2BTAFrequency,
    IRC3Status,
    IRC4Entry,
    MONTH_KEYS,
    TA_STATUS_PROVIDED,
    TA_STATUS_UNPROVIDED,
)
import storage

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Database + upload-storage configuration
#
# BASE_DIR anchors both the SQLite file and the uploads tree to the app's
# own folder rather than the current working directory, since the future
# pywebview .exe build won't reliably be launched from a fixed cwd.
# ---------------------------------------------------------------------------
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
INSTANCE_DIR = os.path.join(BASE_DIR, "instance")
os.makedirs(INSTANCE_DIR, exist_ok=True)

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(INSTANCE_DIR, "sgod_pmes.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["UPLOAD_ROOT"] = os.path.join(BASE_DIR, "uploads")
os.makedirs(app.config["UPLOAD_ROOT"], exist_ok=True)

app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB per upload, generous for these PDFs

db.init_app(app)
storage.enable_sqlite_foreign_keys(app)


@app.cli.command("init-db")
def init_db_command():
    """Usage: flask --app app init-db
    Creates all tables (if missing) and seeds the School master list.
    Safe to run more than once."""
    with app.app_context():
        db.create_all()
        added = storage.seed_schools()
        print(f"Database ready at {app.config['SQLALCHEMY_DATABASE_URI']}")
        print(f"Seeded {added} new school(s) (existing schools were left untouched).")

# ---------------------------------------------------------------------------
# Fixed list of tabs. This system has exactly 13 Individual Report Cards
# and this list will not grow, so it's kept simple as a constant here.
# ---------------------------------------------------------------------------
TABS = [
    {"id": "irc1a", "short": "IRC1a", "name": "Individual Report Card No. 1a"},
    {"id": "irc1b", "short": "IRC1b", "name": "Individual Report Card No. 1b"},
    {"id": "irc2a", "short": "IRC2a", "name": "Individual Report Card No. 2a"},
    {"id": "irc2b", "short": "IRC2b", "name": "Individual Report Card No. 2b"},
    {"id": "irc3",  "short": "IRC3",  "name": "Individual Report Card No. 3"},
    {"id": "irc4",  "short": "IRC4",  "name": "Individual Report Card No. 4"},
    {"id": "irc5",  "short": "IRC5",  "name": "Individual Report Card No. 5"},
    {"id": "irc6",  "short": "IRC6",  "name": "Individual Report Card No. 6"},
    {"id": "irc7",  "short": "IRC7",  "name": "Individual Report Card No. 7"},
    {"id": "irc8a", "short": "IRC8a", "name": "Individual Report Card No. 8a"},
    {"id": "irc8b", "short": "IRC8b", "name": "Individual Report Card No. 8b"},
    {"id": "irc8c", "short": "IRC8c", "name": "Individual Report Card No. 8c"},
    {"id": "irc8d", "short": "IRC8d", "name": "Individual Report Card No. 8d"},
    {"id": "irc9",  "short": "IRC9",  "name": "Individual Report Card No. 9"},
]

# Quick lookup by id, e.g. TAB_LOOKUP["irc1a"]
TAB_LOOKUP = {tab["id"]: tab for tab in TABS}

# Each tab renders its own template file under templates/tabs/, since every
# report card has its own structure/functionality. E.g. "irc1a" -> "tabs/irc1a.html"
TEMPLATE_MAP = {tab["id"]: f"tabs/{tab['id']}.html" for tab in TABS}

# ---------------------------------------------------------------------------
# Groupings used only on the home page, so related sub-reports (1a/1b,
# 2a/2b, 8a-8d) can be shown under one parent card instead of 13 separate
# tiles. Each group's "tabs" list holds the actual tab dicts from TABS above.
# ---------------------------------------------------------------------------
GROUPS = [
    {"code": "IRC1", "label": "Individual Report Card No. 1", "tabs": [TAB_LOOKUP["irc1a"], TAB_LOOKUP["irc1b"]]},
    {"code": "IRC2", "label": "Individual Report Card No. 2", "tabs": [TAB_LOOKUP["irc2a"], TAB_LOOKUP["irc2b"]]},
    {"code": "IRC3", "label": "Individual Report Card No. 3", "tabs": [TAB_LOOKUP["irc3"]]},
    {"code": "IRC4", "label": "Individual Report Card No. 4", "tabs": [TAB_LOOKUP["irc4"]]},
    {"code": "IRC5", "label": "Individual Report Card No. 5", "tabs": [TAB_LOOKUP["irc5"]]},
    {"code": "IRC6", "label": "Individual Report Card No. 6", "tabs": [TAB_LOOKUP["irc6"]]},
    {"code": "IRC7", "label": "Individual Report Card No. 7", "tabs": [TAB_LOOKUP["irc7"]]},
    {"code": "IRC8", "label": "Individual Report Card No. 8", "tabs": [
        TAB_LOOKUP["irc8a"], TAB_LOOKUP["irc8b"], TAB_LOOKUP["irc8c"], TAB_LOOKUP["irc8d"],
    ]},
    {"code": "IRC9", "label": "Individual Report Card No. 9", "tabs": [TAB_LOOKUP["irc9"]]},
]

# Shared by every "extract month from header" route, since every one of these
# monthly PDFs uses the same "TECHNICAL ASSISTANCE FEEDBACK RESULTS (MONTH)"
# header format.
MONTH_HEADER_PATTERN = r"TECHNICAL ASSISTANCE FEEDBACK RESULTS\s*\(?([A-Za-z]+)\)?"
MONTH_MAP = {
    'january': 'jan', 'february': 'feb', 'march': 'mar', 'april': 'apr',
    'may': 'may', 'june': 'jun', 'july': 'jul', 'august': 'aug',
    'september': 'sep', 'october': 'oct', 'november': 'nov', 'december': 'dec'
}


def _extract_month(full_text):
    """Returns (month_name, month_key) parsed from the report header, or
    (None, None) if it couldn't be found/recognized."""
    month_match = re.search(MONTH_HEADER_PATTERN, full_text)
    if not month_match:
        return None, None

    month_name = month_match.group(1).strip().lower()
    month_key = MONTH_MAP.get(month_name)
    return month_name, month_key


def _parse_numbered_school_list(section_text):
    """Parses a numbered list of school names that may wrap across lines.

    Handles both layouts seen in these PDFs:
      "1 Apia Integrated School"                    (number + name, one line)
      "1\\nAntipolo National Science and\\nTechnology HS"  (number alone on
      its own line, with the name wrapping across the following lines until
      the next number)

    Numbers are expected to increase by 1 each time (1, 2, 3, ...) — this is
    what lets the parser tell "this line starts a new entry" apart from
    "this line is a continuation of the current school's name", even though
    both cases can be plain text lines.
    """
    lines = [ln.strip() for ln in section_text.split("\n") if ln.strip()]

    num_pattern = re.compile(r"^(\d{1,3})\b\s*(.*)$")
    expected = 1
    current_name_parts = []
    have_entry = False
    schools = []

    def finalize():
        name = " ".join(current_name_parts).strip()
        name = re.sub(r"\s+", " ", name)
        if name:
            schools.append(name)

    for line in lines:
        m = num_pattern.match(line)
        if m and int(m.group(1)) == expected:
            if have_entry:
                finalize()
            expected += 1
            have_entry = True
            rest = m.group(2).strip()
            current_name_parts = [rest] if rest else []
        else:
            current_name_parts.append(line)

    if have_entry:
        finalize()

    return schools


# ---------------------------------------------------------------------------
# IRC9 (PMCF) PDF extraction helpers
#
# The DepEd PMCF ("Annex E") form has a genuine vector-drawn table with 4
# columns: DATE / CRITICAL INCIDENCE DESCRIPTION / OUTPUT / IMPACT ON JOB.
# Rather than guessing columns from raw word x/y positions (which breaks on
# every hard-wrapped line inside a cell), these helpers read pdfplumber's
# actual detected table/cell geometry, then crop the page to each column's
# x-range within a row's y-range and extract that whole region as one block
# of text — so a paragraph that wraps across many lines, or spans multiple
# pages, comes back intact as a single field.
#
# Within that block, _extract_text_with_paragraph_breaks further tells
# apart an ordinary hard-wrapped line (part of the same paragraph) from a
# genuine paragraph break (an intentionally blank line the writer left in
# the form), by comparing the vertical gap between consecutive lines
# against that cell's own typical line spacing.
# ---------------------------------------------------------------------------

def _is_full_width_row(row_bbox, table_bbox, tol=3):
    """A table row that spans the table's full left-to-right width, as
    opposed to a partial-width sub-row (used by the header's wrapped
    lines, e.g. the "(Actual events...)" subtitle, which only spans the
    Critical Incidence Description column)."""
    return (
        abs(row_bbox[0] - table_bbox[0]) <= tol
        and abs(row_bbox[2] - table_bbox[2]) <= tol
    )


def _find_irc9_header_cells(page, table):
    """Locates the full-width header row (DATE / CRITICAL INCIDENCE
    DESCRIPTION / OUTPUT / IMPACT ON JOB) and returns its 4 real header
    cells (each as (x0, top, x1, bottom, text)), or None if this
    page/table isn't the header."""
    for row in table.rows:
        if not _is_full_width_row(row.bbox, table.bbox):
            continue

        header_cells = []
        for c in row.cells:
            if c is None:
                continue
            text = (page.crop(c).extract_text() or "").strip()
            if text:
                header_cells.append((c[0], c[1], c[2], c[3], text))

        # The real header row has exactly 4 non-empty cells (some table
        # grids include extra empty "gutter" cells between columns,
        # which extract_text() returns as blank and get filtered above).
        if len(header_cells) != 4:
            continue

        upper_texts = [c[4].upper() for c in header_cells]
        if (
            upper_texts[0].startswith("DATE")
            and upper_texts[1].startswith("CRITICAL")
            and upper_texts[2].startswith("OUTPUT")
            and upper_texts[3].startswith("IMPACT")
        ):
            return header_cells

    return None


def _derive_irc9_column_bounds(header_cells, table_bbox):
    """Turns the 4 header cells' x-ranges into 4 column x-boundaries
    ([left, b1, b2, b3, right]), splitting the gap between adjacent
    header cells down the middle so narrow "gutter" cells are divided
    fairly between the columns on either side of them."""
    cells = sorted(header_cells, key=lambda c: c[0])
    bounds = [table_bbox[0]]
    for i in range(len(cells) - 1):
        bounds.append((cells[i][2] + cells[i + 1][0]) / 2.0)
    bounds.append(table_bbox[2])
    return bounds


def _extract_text_with_paragraph_breaks(page, bbox):
    """Extracts text from a cropped region of a page, preserving
    paragraph breaks.

    pdfplumber's extract_text() joins every line in a region with a
    plain "\\n", whether that line is a hard-wrap continuation of the
    same paragraph or the start of a brand-new paragraph — so a
    two-paragraph cell comes back looking like one long paragraph. This
    reconstructs line positions from word geometry instead, measures the
    vertical gap between consecutive lines, and treats any gap noticeably
    larger than the region's typical line spacing as a paragraph break
    (represented as a blank line, i.e. two consecutive "\\n"s) rather than
    an ordinary line wrap (a single "\\n").
    """
    cropped = page.crop(bbox)
    words = cropped.extract_words(use_text_flow=False, keep_blank_chars=False)
    if not words:
        return ""

    # Group words into lines using their vertical ("top") position.
    line_tol = 3  # px tolerance for words considered to be on the same line
    words_sorted = sorted(words, key=lambda w: (w["top"], w["x0"]))

    lines = []  # list of (top, [words])
    current_line = []
    current_top = None
    for w in words_sorted:
        if current_top is None or abs(w["top"] - current_top) <= line_tol:
            current_line.append(w)
            current_top = w["top"] if current_top is None else current_top
        else:
            lines.append((current_top, current_line))
            current_line = [w]
            current_top = w["top"]
    if current_line:
        lines.append((current_top, current_line))

    if len(lines) <= 1:
        return " ".join(w["text"] for w in words_sorted)

    tops = [t for t, _ in lines]
    gaps = [tops[i + 1] - tops[i] for i in range(len(tops) - 1)]
    sorted_gaps = sorted(gaps)
    median_gap = sorted_gaps[len(sorted_gaps) // 2]
    # A gap noticeably bigger than the typical line-to-line spacing
    # signals extra whitespace in the original layout, i.e. a new
    # paragraph rather than a wrapped continuation line.
    paragraph_threshold = median_gap * 1.5 if median_gap else float("inf")

    out_lines = []
    for i, (top, line_words) in enumerate(lines):
        line_text = " ".join(
            w["text"] for w in sorted(line_words, key=lambda w: w["x0"])
        )
        if i > 0 and (top - tops[i - 1]) > paragraph_threshold:
            out_lines.append("")  # blank line marks a paragraph break
        out_lines.append(line_text)

    return "\n".join(out_lines)


def _normalize_irc9_text(text):
    """Collapses a cell's hard-wrapped PDF lines into flowing paragraphs,
    while preserving genuine paragraph breaks.

    A paragraph break comes out of _extract_text_with_paragraph_breaks as
    a blank line (two or more consecutive "\\n"s) and is kept here as a
    single "\\n\\n" between paragraphs. Within a paragraph, ordinary
    hard-wrapped line breaks are collapsed into spaces, and words
    hyphenated across a line wrap (e.g. "priority-\\nschool") are rejoined
    without an extra space.
    """
    if not text:
        return ""

    text = re.sub(r"-\n", "-", text)

    paragraphs = re.split(r"\n\s*\n", text)
    cleaned_paragraphs = []
    for para in paragraphs:
        para = re.sub(r"\s+", " ", para).strip()
        if para:
            cleaned_paragraphs.append(para)

    return "\n\n".join(cleaned_paragraphs)


def _parse_date_to_iso(date_str):
    """Best-effort parse of a PMCF date cell (e.g. 'July 7, 2026') into
    yyyy-mm-dd for the <input type="date"> field. Returns None if it
    can't be parsed, so the frontend can leave the field blank for the
    user to fill in manually."""
    if not date_str:
        return None
    cleaned = re.sub(r"\s+", " ", date_str).strip().rstrip(",")
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%B %d %Y", "%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(cleaned, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _extract_irc9_entries(pdf):
    """Extracts PMCF entries (Date / Critical Incidence Description /
    Output / Impact on Job) from a DepEd PMCF PDF by reading its actual
    vector-drawn table structure, rather than guessing columns from raw
    text/word positions.

    Approach:
    1. Find the page containing the table header and derive the 4
       column x-boundaries from the header cells' own positions.
    2. Walk every page's table from there. Each "full width" table row
       (spanning the whole table, as opposed to a header sub-row) is a
       candidate entry row. Its 4 fields are read by cropping the page
       to each column's x-range within that row's y-range and running
       _extract_text_with_paragraph_breaks on it — so multi-line
       paragraphs stay intact as single cells (with real paragraph
       breaks preserved) instead of being split into separate rows or
       flattened into one run-on paragraph.
    3. A row whose Date cell is non-empty starts a new entry. A row
       whose Date cell is empty is a continuation of the current entry
       (this is how a single entry's paragraphs that span multiple
       pages are stitched back together, since continuation pages have
       no divider line in the Date column at all) — and is itself
       treated as starting a new paragraph within that field.

    This is template-specific (DepEd PMCF "Annex E" form), like the
    other IRC extractors in this app — if the PMCF layout changes, the
    header-detection text above may need adjusting.
    """
    col_bounds = None
    start_page_index = None

    for i, page in enumerate(pdf.pages):
        tables = page.find_tables()
        if not tables:
            continue
        table = tables[0]
        header_cells = _find_irc9_header_cells(page, table)
        if header_cells:
            col_bounds = _derive_irc9_column_bounds(header_cells, table.bbox)
            start_page_index = i
            break

    if col_bounds is None:
        return []

    entries = []
    current = None

    for i, page in enumerate(pdf.pages):
        if i < start_page_index:
            continue

        tables = page.find_tables()
        if not tables:
            continue
        table = tables[0]

        for row in table.rows:
            if not _is_full_width_row(row.bbox, table.bbox):
                continue

            row_top, row_bottom = row.bbox[1], row.bbox[3]

            # Read this row's 4 fields directly from the known column
            # x-boundaries (not from row.cells indices, since the
            # detected column count can vary row-to-row), preserving
            # any genuine paragraph breaks within each field.
            field_texts = []
            for col_idx in range(4):
                cx0, cx1 = col_bounds[col_idx], col_bounds[col_idx + 1]
                try:
                    text = _extract_text_with_paragraph_breaks(
                        page, (cx0, row_top, cx1, row_bottom)
                    )
                except Exception:
                    text = ""
                field_texts.append(text.strip())

            date_val, incident_val, output_val, impact_val = field_texts

            # Skip the header row itself (its Date cell literally reads "DATE").
            if date_val.strip().upper() == "DATE":
                continue

            if date_val:
                if current:
                    entries.append(current)
                current = {
                    "date": date_val,
                    "incident": incident_val,
                    "output": output_val,
                    "impact": impact_val,
                }
            else:
                if current is None:
                    # Defensive fallback; shouldn't happen once past the header.
                    current = {"date": "", "incident": "", "output": "", "impact": ""}
                for key, val in (
                    ("incident", incident_val),
                    ("output", output_val),
                    ("impact", impact_val),
                ):
                    if val:
                        # Joined with a blank line so a continuation
                        # page's field starts as its own paragraph
                        # rather than merging into the prior page's
                        # last line.
                        current[key] = (current[key] + "\n\n" + val).strip() if current[key] else val

    if current:
        entries.append(current)

    cleaned_entries = []
    for e in entries:
        date_norm = _normalize_irc9_text(e["date"])
        cleaned_entries.append(
            {
                "date_raw": date_norm,
                "date_iso": _parse_date_to_iso(date_norm),
                "incident": _normalize_irc9_text(e["incident"]),
                "output": _normalize_irc9_text(e["output"]),
                "impact": _normalize_irc9_text(e["impact"]),
            }
        )

    return cleaned_entries


# ---------------------------------------------------------------------------
# DB persistence helpers
#
# Each of these does an "upsert" keyed on the table's unique constraint
# (see models.py), so re-importing the same month twice updates the
# existing row instead of creating a duplicate. Every one accepts an
# optional `uploaded_file` so manual edits (no PDF) can call them too,
# just passing uploaded_file=None.
# ---------------------------------------------------------------------------
def _current_year():
    return datetime.now().year


def _upsert_irc1a_ratings(year, month_key, ratings_by_indicator, uploaded_file):
    """ratings_by_indicator: { indicator_id (int): rating (float) }"""
    for indicator_id, rating in ratings_by_indicator.items():
        row = IRC1ARating.query.filter_by(
            year=year, month_key=month_key, indicator_id=indicator_id
        ).first()
        if row is None:
            row = IRC1ARating(year=year, month_key=month_key, indicator_id=indicator_id)
            db.session.add(row)
        row.rating = rating
        row.uploaded_file_id = uploaded_file.id if uploaded_file else row.uploaded_file_id
    db.session.commit()


def _upsert_irc1b_customer_count(year, month_key, customer_count, uploaded_file):
    row = IRC1BCustomerCount.query.filter_by(year=year, month_key=month_key).first()
    if row is None:
        row = IRC1BCustomerCount(year=year, month_key=month_key)
        db.session.add(row)
    row.customer_count = customer_count
    row.uploaded_file_id = uploaded_file.id if uploaded_file else row.uploaded_file_id
    db.session.commit()


def _upsert_irc2a_status(year, school_name, status, month_key, uploaded_file):
    """Marks a school (matched by exact name) as provided/unprovided for
    `year`. Returns 'ok', 'not-found', or 'ambiguous' so the caller can
    report per-school import results, mirroring the frontend's existing
    not-found / already-provided / will-mark preview states."""
    school = School.query.filter_by(name=school_name).first()
    if school is None:
        return "not-found"

    row = IRC2ASchoolStatus.query.filter_by(school_id=school.id, year=year).first()
    if row is None:
        row = IRC2ASchoolStatus(school_id=school.id, year=year)
        db.session.add(row)
    row.status = status
    if status == TA_STATUS_PROVIDED:
        row.provided_month_key = month_key
    row.uploaded_file_id = uploaded_file.id if uploaded_file else row.uploaded_file_id
    db.session.commit()
    return "ok"


def _upsert_irc2b_frequency(year, school_id, month_key, provided, uploaded_file=None):
    row = IRC2BTAFrequency.query.filter_by(
        school_id=school_id, year=year, month_key=month_key
    ).first()
    if row is None:
        row = IRC2BTAFrequency(school_id=school_id, year=year, month_key=month_key)
        db.session.add(row)
    row.provided = provided
    row.uploaded_file_id = uploaded_file.id if uploaded_file else row.uploaded_file_id
    db.session.commit()


def _upsert_irc3_status(year, dedp_ta_count, dedp_target, nondedp_ta_count, nondedp_target):
    row = IRC3Status.query.filter_by(year=year).first()
    if row is None:
        row = IRC3Status(year=year)
        db.session.add(row)
    row.dedp_ta_count = dedp_ta_count
    row.dedp_target = dedp_target
    row.nondedp_ta_count = nondedp_ta_count
    row.nondedp_target = nondedp_target
    db.session.commit()
    return row


@app.route("/")
def home():
    """Landing page shown when the app first opens. Also surfaces the
    most recently uploaded PDFs, grouped by year/month, for the
    centralized upload section on the home page."""
    recent_uploads = (
        UploadedFile.query.order_by(UploadedFile.uploaded_at.desc()).limit(10).all()
    )
    return render_template(
        "home.html",
        tabs=TABS,
        groups=GROUPS,
        active_tab=None,
        recent_uploads=recent_uploads,
    )


@app.route("/irc/<tab_id>")
def view_tab(tab_id):
    """Renders the dedicated template for whichever tab was requested,
    loading any previously-saved data for it back out of the database so
    a page reload doesn't appear to "lose" data that was already imported.

    NOTE: the context variable names below (irc1a_ratings, irc1b_counts,
    etc.) are a best guess -- I don't have tabs/irc1a.html etc. to confirm
    what variable names those templates actually read. If a template
    expects different names/shapes, tell me and I'll line these up exactly.
    """
    active_tab = TAB_LOOKUP.get(tab_id)
    if active_tab is None:
        abort(404)

    year = _current_year()
    context = {"tabs": TABS, "active_tab": active_tab, "year": year}

    if tab_id == "irc1a":
        rows = IRC1ARating.query.filter_by(year=year).all()
        # { indicator_id (int): { month_key: rating (float) } }
        ratings = {i: {} for i in range(1, 11)}
        for row in rows:
            ratings.setdefault(row.indicator_id, {})[row.month_key] = row.rating
        context["irc1a_ratings"] = ratings

    elif tab_id == "irc1b":
        rows = IRC1BCustomerCount.query.filter_by(year=year).all()
        # { month_key: customer_count (int) }
        context["irc1b_counts"] = {row.month_key: row.customer_count for row in rows}

    elif tab_id == "irc2a":
        rows = (
            db.session.query(IRC2ASchoolStatus, School)
            .join(School, IRC2ASchoolStatus.school_id == School.id)
            .filter(IRC2ASchoolStatus.year == year)
            .all()
        )
        # { school_name: {"status": "provided"|"unprovided", "provided_month_key": "jul"|None} }
        context["irc2a_statuses"] = {
            school.name: {
                "status": status.status,
                "provided_month_key": status.provided_month_key,
            }
            for status, school in rows
        }

    elif tab_id == "irc2b":
        rows = (
            db.session.query(IRC2BTAFrequency, School)
            .join(School, IRC2BTAFrequency.school_id == School.id)
            .filter(IRC2BTAFrequency.year == year)
            .all()
        )
        # { school_name: { month_key: provided (bool) } }
        frequencies = {}
        for freq, school in rows:
            frequencies.setdefault(school.name, {})[freq.month_key] = freq.provided
        context["irc2b_frequencies"] = frequencies
        context["schools"] = [s.to_dict() for s in School.query.order_by(School.name).all()]

    elif tab_id == "irc3":
        row = IRC3Status.query.filter_by(year=year).first()
        context["irc3_status"] = (
            {
                "dedp_ta_count": row.dedp_ta_count,
                "dedp_target": row.dedp_target,
                "nondedp_ta_count": row.nondedp_ta_count,
                "nondedp_target": row.nondedp_target,
            }
            if row
            else None
        )

    return render_template(TEMPLATE_MAP[tab_id], **context)


# ---------------------------------------------------------------------------
# Centralized file manager: list every uploaded PDF (optionally filtered
# by IRC/year/month) and delete one (cascading to its extracted DB rows).
# ---------------------------------------------------------------------------
@app.route("/files", methods=["GET"])
def list_files():
    """Returns every uploaded file, most recent first. Supports optional
    ?irc_type=irc1a&year=2026&month=jan filters for a file-manager UI."""
    query = UploadedFile.query

    irc_type = request.args.get("irc_type")
    year = request.args.get("year", type=int)
    month_key = request.args.get("month")

    if irc_type:
        query = query.filter_by(irc_type=irc_type)
    if year:
        query = query.filter_by(year=year)
    if month_key:
        query = query.filter_by(month_key=month_key)

    files = query.order_by(UploadedFile.year.desc(), UploadedFile.uploaded_at.desc()).all()
    return jsonify({"files": [f.to_dict() for f in files]}), 200


@app.route("/files/<int:file_id>", methods=["DELETE"])
def delete_file(file_id):
    """Deletes an uploaded PDF from disk AND every DB record extracted
    from it (ratings, customer counts, school statuses, ...), via
    storage.delete_uploaded_file's cascade."""
    uploaded_file = UploadedFile.query.get(file_id)
    if uploaded_file is None:
        return jsonify({"error": "File not found"}), 404

    storage.delete_uploaded_file(uploaded_file, app.config["UPLOAD_ROOT"])
    return jsonify({"deleted": True, "id": file_id}), 200


@app.route("/irc/irc1a/extract", methods=["POST"])
def extract_irc1a_pdf():
    """Extract TA ratings from a monthly PDF.
    
    Expected PDF structure:
    - Header: "TECHNICAL ASSISTANCE FEEDBACK RESULTS\n(MONTH)"
    - Section listing 10 TA indicators with their ratings
    - Each indicator: "N) Indicator text. RATING" (may span multiple lines)
    
    Returns ratings for the single month specified in the header.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files["file"]
    if not file.filename.endswith(".pdf"):
        return jsonify({"error": "Only PDF files are supported"}), 400
    
    try:
        with pdfplumber.open(file) as pdf:
            # Extract all text from the PDF
            full_text = ""
            for page in pdf.pages:
                full_text += page.extract_text() + "\n"
        
        # Extract month from header
        month_name, month_key = _extract_month(full_text)

        if not month_name:
            return jsonify({"error": "Could not find month in PDF header"}), 400

        if not month_key:
            return jsonify({"error": f"Unknown month: {month_name}"}), 400
        
        # Extract indicators and ratings - handle multiline text
        # Look for patterns like "N) ... RATING" where ... can span multiple lines
        # Use regex to find indicator numbers with ratings
        indicators_data = {}
        
        # Find all instances of "N)" followed eventually by a rating
        pattern = r'(\d+)\)\s*(.+?)\s+([\d.]+)(?:\s|$|Monthly)'
        for match in re.finditer(pattern, full_text, re.DOTALL):
            indicator_num = int(match.group(1))
            if 1 <= indicator_num <= 10:
                try:
                    rating = float(match.group(3))
                    if 1 <= rating <= 5:
                        indicators_data[indicator_num] = rating
                except ValueError:
                    pass
        
        if len(indicators_data) < 10:
            return jsonify({
                "error": f"Could not extract all 10 indicators. Found {len(indicators_data)}. Please ensure the PDF has the correct format."
            }), 400
        
        # Build response with only the extracted month
        extracted_ratings = {}
        for indicator_id in range(1, 11):
            if indicator_id in indicators_data:
                extracted_ratings[str(indicator_id)] = {month_key: indicators_data[indicator_id]}

        # --- Persist: save the PDF to the month-based folder and register
        # its UploadedFile row now (so file_id is available for the preview
        # modal and a later delete still cleans up the file). We deliberately
        # do NOT write IRC1ARating rows here -- the frontend shows a preview
        # modal first and lets the user edit any rating before committing,
        # so the actual writes happen in /irc/irc1a/import once confirmed.
        # This mirrors IRC2a's extract/import split. ---
        year = _current_year()
        file_fields = storage.save_uploaded_pdf(
            file, app.config["UPLOAD_ROOT"], irc_type="irc1a", year=year, month_key=month_key
        )
        uploaded_file = UploadedFile(**file_fields)
        db.session.add(uploaded_file)
        db.session.commit()

        return jsonify({
            "month": month_name,
            "month_key": month_key,
            "extracted_ratings": extracted_ratings,
            "file_id": uploaded_file.id,
            "year": year,
        }), 200
    
    except Exception as e:
        return jsonify({"error": f"Error processing PDF: {str(e)}"}), 500


@app.route("/irc/irc1a/import", methods=["POST"])
def import_irc1a_ratings():
    """Commits the user-confirmed (and possibly edited) IRC1a ratings
    from the preview modal.

    Expected JSON body:
        {
          "file_id": 42,          // from /irc/irc1a/extract's response
          "year": 2026,           // optional, defaults to current year
          "month_key": "jul",
          "ratings": {"1": 4.0, "2": 3.5, ..., "10": 5.0}
        }

    Only indicators present in `ratings` are written -- if the user
    cleared a field in the preview modal before confirming, that
    indicator is simply left untouched rather than zeroed out.
    """
    data = request.get_json(silent=True) or {}
    file_id = data.get("file_id")
    month_key = data.get("month_key")
    ratings = data.get("ratings")
    year = data.get("year") or _current_year()

    if month_key not in MONTH_KEYS:
        return jsonify({"error": f"Invalid month_key: {month_key!r}"}), 400
    if not isinstance(ratings, dict) or not ratings:
        return jsonify({"error": "'ratings' must be a non-empty object of indicator_id -> rating"}), 400

    ratings_by_indicator = {}
    for key, value in ratings.items():
        try:
            indicator_id = int(key)
            rating = float(value)
        except (TypeError, ValueError):
            return jsonify({"error": f"Invalid rating for indicator {key!r}"}), 400
        if not (1 <= indicator_id <= 10):
            continue
        if not (1 <= rating <= 5):
            return jsonify({"error": f"Rating for indicator {indicator_id} must be between 1 and 5"}), 400
        ratings_by_indicator[indicator_id] = rating

    if not ratings_by_indicator:
        return jsonify({"error": "No valid ratings to import"}), 400

    uploaded_file = UploadedFile.query.get(file_id) if file_id else None
    _upsert_irc1a_ratings(year, month_key, ratings_by_indicator, uploaded_file)

    return jsonify({
        "updated": sorted(ratings_by_indicator.keys()),
        "year": year,
        "month_key": month_key,
    }), 200


@app.route("/irc/irc1b/extract", methods=["POST"])
def extract_irc1b_pdf():
    """Extract the number of customers served from a monthly PDF.

    Expected PDF structure:
    - Header: "TECHNICAL ASSISTANCE FEEDBACK RESULTS\n(MONTH)"
    - A line containing "No. of Customers: N" (N may include commas, e.g. "1,234")

    Returns the customer count for the single month specified in the header.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename.endswith(".pdf"):
        return jsonify({"error": "Only PDF files are supported"}), 400

    try:
        with pdfplumber.open(file) as pdf:
            full_text = ""
            for page in pdf.pages:
                full_text += page.extract_text() + "\n"

        # Extract month from header (same pattern as irc1a)
        month_name, month_key = _extract_month(full_text)

        if not month_name:
            return jsonify({"error": "Could not find month in PDF header"}), 400

        if not month_key:
            return jsonify({"error": f"Unknown month: {month_name}"}), 400

        # Extract "No. of Customers: N" — allow commas in the number (e.g. "1,234")
        customers_pattern = r"No\.\s*of\s*Customers\s*:?\s*([\d,]+)"
        customers_match = re.search(customers_pattern, full_text, re.IGNORECASE)

        if not customers_match:
            return jsonify({
                "error": "Could not find 'No. of Customers:' in the PDF. Please ensure the PDF has the correct format."
            }), 400

        try:
            customers = int(customers_match.group(1).replace(",", ""))
        except ValueError:
            return jsonify({"error": "Could not parse the number of customers"}), 400

        # --- Persist: save the PDF and register its UploadedFile row now.
        # As with IRC1a, the actual IRC1BCustomerCount write is deferred to
        # /irc/irc1b/import so the user can review/edit the count first. ---
        year = _current_year()
        file_fields = storage.save_uploaded_pdf(
            file, app.config["UPLOAD_ROOT"], irc_type="irc1b", year=year, month_key=month_key
        )
        uploaded_file = UploadedFile(**file_fields)
        db.session.add(uploaded_file)
        db.session.commit()

        return jsonify({
            "month": month_name,
            "month_key": month_key,
            "customers": customers,
            "file_id": uploaded_file.id,
            "year": year,
        }), 200

    except Exception as e:
        return jsonify({"error": f"Error processing PDF: {str(e)}"}), 500


@app.route("/irc/irc1b/import", methods=["POST"])
def import_irc1b_customer_count():
    """Commits the user-confirmed (and possibly edited) IRC1b customer
    count from the preview modal.

    Expected JSON body:
        {
          "file_id": 42,        // from /irc/irc1b/extract's response
          "year": 2026,         // optional, defaults to current year
          "month_key": "jul",
          "customers": 1234
        }
    """
    data = request.get_json(silent=True) or {}
    file_id = data.get("file_id")
    month_key = data.get("month_key")
    year = data.get("year") or _current_year()

    if month_key not in MONTH_KEYS:
        return jsonify({"error": f"Invalid month_key: {month_key!r}"}), 400

    try:
        customers = int(data.get("customers"))
    except (TypeError, ValueError):
        return jsonify({"error": "'customers' must be an integer"}), 400
    if customers < 0:
        return jsonify({"error": "'customers' cannot be negative"}), 400

    uploaded_file = UploadedFile.query.get(file_id) if file_id else None
    _upsert_irc1b_customer_count(year, month_key, customers, uploaded_file)

    return jsonify({
        "updated": True,
        "year": year,
        "month_key": month_key,
        "customers": customers,
    }), 200


@app.route("/irc/irc2a/extract", methods=["POST"])
def extract_irc2a_pdf():
    """Extract the "Schools Provided with TA" list from a monthly PDF.

    Expected PDF structure:
    - Header: "TECHNICAL ASSISTANCE FEEDBACK RESULTS\n(MONTH)"
    - A "Schools Provided with TA" section containing a numbered list of
      school names (1, 2, 3, ... in order). A school's name may wrap onto
      the following line(s) before the next number starts — this is handled,
      see _parse_numbered_school_list.

    Returns the month and the raw list of school names extracted from that
    section. Matching those names against the system's known school list,
    and actually marking schools as provided, is left to the frontend —
    it's the one source of truth for which schools exist and their current
    status.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename.endswith(".pdf"):
        return jsonify({"error": "Only PDF files are supported"}), 400

    try:
        with pdfplumber.open(file) as pdf:
            full_text = ""
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    full_text += page_text + "\n"

        # Extract month from header (same pattern as irc1a/irc1b)
        month_name, month_key = _extract_month(full_text)

        if not month_name:
            return jsonify({"error": "Could not find month in PDF header"}), 400

        if not month_key:
            return jsonify({"error": f"Unknown month: {month_name}"}), 400

        # Isolate the "Schools Provided with TA" section, up to whatever
        # comes right after it in the PDF (the signature block, if present).
        section_match = re.search(
            r"Schools Provided with TA(.*?)(?:Prepared by:|$)",
            full_text,
            re.DOTALL | re.IGNORECASE,
        )
        if not section_match:
            return jsonify({
                "error": "Could not find a 'Schools Provided with TA' section in the PDF."
            }), 400

        schools = _parse_numbered_school_list(section_match.group(1))

        if not schools:
            return jsonify({
                "error": "Found the 'Schools Provided with TA' section but could not extract any school names from it."
            }), 400

        # --- Persist: save the PDF now so it's registered and file_id is
        # available for the preview modal. NOTE: we deliberately do NOT
        # write IRC2ASchoolStatus rows here -- the frontend shows a
        # preview modal first and lets the user uncheck schools before
        # committing, so the actual status writes happen in
        # /irc/irc2a/import once the user confirms. This mirrors the
        # existing not-found/already-provided/will-mark preview flow. ---
        year = _current_year()
        file_fields = storage.save_uploaded_pdf(
            file, app.config["UPLOAD_ROOT"], irc_type="irc2a", year=year, month_key=month_key
        )
        uploaded_file = UploadedFile(**file_fields)
        db.session.add(uploaded_file)
        db.session.commit()

        return jsonify({
            "month": month_name,
            "month_key": month_key,
            "schools": schools,
            "file_id": uploaded_file.id,
        }), 200

    except Exception as e:
        return jsonify({"error": f"Error processing PDF: {str(e)}"}), 500


@app.route("/irc/irc2a/import", methods=["POST"])
def import_irc2a_schools():
    """Commits the user-confirmed subset of an IRC2a preview import.

    Expected JSON body:
        {
          "file_id": 42,             // from /irc/irc2a/extract's response
          "year": 2026,              // optional, defaults to current year
          "schools": ["School A", "School B", ...]   // names to mark 'provided'
        }

    Only schools the user left checked in the preview modal should be
    included here -- this endpoint marks every listed school 'provided'
    for the given year and leaves everyone else's status untouched.
    """
    data = request.get_json(silent=True) or {}
    file_id = data.get("file_id")
    school_names = data.get("schools")
    year = data.get("year") or _current_year()

    if not isinstance(school_names, list) or not school_names:
        return jsonify({"error": "'schools' must be a non-empty list of school names"}), 400

    uploaded_file = UploadedFile.query.get(file_id) if file_id else None
    month_key = uploaded_file.month_key if uploaded_file else None

    results = {"updated": [], "not_found": []}
    for name in school_names:
        outcome = _upsert_irc2a_status(year, name, TA_STATUS_PROVIDED, month_key, uploaded_file)
        (results["updated"] if outcome == "ok" else results["not_found"]).append(name)

    return jsonify(results), 200


@app.route("/irc/irc2b/save", methods=["POST"])
def save_irc2b_frequency():
    """Persists manual checkbox edits from the IRC2b monthly grid (no
    PDF involved, so these rows keep uploaded_file_id = NULL).

    Expected JSON body:
        {
          "year": 2026,
          "updates": [
            {"school_name": "Antipolo NHS", "month_key": "jul", "provided": true},
            ...
          ]
        }
    """
    data = request.get_json(silent=True) or {}
    year = data.get("year") or _current_year()
    updates = data.get("updates")

    if not isinstance(updates, list) or not updates:
        return jsonify({"error": "'updates' must be a non-empty list"}), 400

    results = {"updated": [], "not_found": []}
    for entry in updates:
        name = entry.get("school_name")
        month_key = entry.get("month_key")
        provided = bool(entry.get("provided"))

        if month_key not in MONTH_KEYS:
            return jsonify({"error": f"Invalid month_key: {month_key!r}"}), 400

        school = School.query.filter_by(name=name).first()
        if school is None:
            results["not_found"].append(name)
            continue

        _upsert_irc2b_frequency(year, school.id, month_key, provided)
        results["updated"].append(name)

    return jsonify(results), 200


@app.route("/irc/irc3/save", methods=["POST"])
def save_irc3_status():
    """Persists the manually-entered IRC3 counts/targets for a year.

    Expected JSON body:
        {
          "year": 2026,
          "dedp_ta_count": 20, "dedp_target": 26,
          "nondedp_ta_count": 30, "nondedp_target": 41
        }
    """
    data = request.get_json(silent=True) or {}
    year = data.get("year") or _current_year()

    try:
        dedp_ta_count = int(data.get("dedp_ta_count", 0))
        dedp_target = int(data.get("dedp_target", 0))
        nondedp_ta_count = int(data.get("nondedp_ta_count", 0))
        nondedp_target = int(data.get("nondedp_target", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "All count/target fields must be integers"}), 400

    row = _upsert_irc3_status(year, dedp_ta_count, dedp_target, nondedp_ta_count, nondedp_target)
    return jsonify({
        "year": row.year,
        "dedp_ta_count": row.dedp_ta_count,
        "dedp_target": row.dedp_target,
        "nondedp_ta_count": row.nondedp_ta_count,
        "nondedp_target": row.nondedp_target,
    }), 200


@app.route("/irc/irc9/extract", methods=["POST"])
def extract_irc9_pdf():
    """Extract PMCF entries (Date, Critical Incidence Description,
    Output, Impact on Job/Action Plan) from a DepEd PMCF PDF.

    See _extract_irc9_entries for how the table structure is parsed,
    including how paragraph breaks within a field are detected and
    preserved.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename.endswith(".pdf"):
        return jsonify({"error": "Only PDF files are supported"}), 400

    try:
        with pdfplumber.open(file) as pdf:
            entries = _extract_irc9_entries(pdf)

        if not entries:
            return jsonify({
                "error": "Could not find the PMCF table (Date / Critical Incidence "
                         "Description / Output / Impact columns) in this PDF. "
                         "Please ensure the PDF has the correct format."
            }), 400

        return jsonify({"entries": entries}), 200

    except Exception as e:
        return jsonify({"error": f"Error processing PDF: {str(e)}"}), 500


def not_found(e):
    return render_template("404.html", tabs=TABS, active_tab=None), 404


if __name__ == "__main__":
    # Convenience for local dev: make sure the schema exists and the
    # school master list is seeded even if `flask init-db` was never run.
    # In production/packaged builds, prefer running the CLI command
    # explicitly once during setup instead of relying on this.
    with app.app_context():
        db.create_all()
        storage.seed_schools()
    app.run(debug=True)