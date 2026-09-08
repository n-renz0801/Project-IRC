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
    IRC4Plan,
    IRC4Objective,
    IRC4Group,
    IRC4GroupSchool,
    IRC5Entry,
    IRC6Entry,
    IRC7Row,
    IRC7Column,
    IRC7CellValue,
    IRC8BRating,
    IRC8AKra,
    IRC8AObjective,
    IRC8AIndicator,
    IRC8A_CATEGORIES,
    IRC8CRow,
    IRC8C_SLOTS,
    IRC9Entry,
    MONTH_KEYS,
    TA_STATUS_PROVIDED,
    TA_STATUS_UNPROVIDED,
    IRC5_NATURE_FUNDED,
    IRC5_NATURE_NONFUNDED,
    IRC6_KIND_GOAL,
    IRC6_KIND_OUTCOME,
    IRC6_KIND_OUTPUT,
    IRC7_COLUMN_TYPE_TEXT,
    IRC7_COLUMN_TYPE_NUMBER,
    IRC7_COLUMN_TYPE_PARAGRAPH,
    IRC8B_SECTION_CBC,
    IRC8B_SECTION_CS,
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
        added_irc7 = storage.seed_irc7_rows()
        print(f"Database ready at {app.config['SQLALCHEMY_DATABASE_URI']}")
        print(f"Seeded {added} new school(s) (existing schools were left untouched).")
        print(f"Seeded {added_irc7} new IRC7 row(s) (existing rows were left untouched).")

# ---------------------------------------------------------------------------
# Fixed list of tabs. This system has exactly 13 Individual Report Cards
# and this list will not grow, so it's kept simple as a constant here.
# ---------------------------------------------------------------------------
TABS = [
    {"id": "irc1a", "short": "IRC1a", "name": "Individual Report Card No. 1a", "desc": "Monthly Customers Feedback Rating"},
    {"id": "irc1b", "short": "IRC1b", "name": "Individual Report Card No. 1b", "desc": "Number of Customers Served"},
    {"id": "irc2a", "short": "IRC2a", "name": "Individual Report Card No. 2a", "desc": "Number of Schools Provided with TA"},
    {"id": "irc2b", "short": "IRC2b", "name": "Individual Report Card No. 2b", "desc": "Frequency of TA Provided to DEDP Priority Schools"},
    {"id": "irc3",  "short": "IRC3",  "name": "Individual Report Card No. 3",  "desc": "Status of TA Provision to Schools"},
    {"id": "irc4",  "short": "IRC4",  "name": "Individual Report Card No. 4",  "desc": "Technical Assistance (TA) Catch-up Plan"},
    {"id": "irc5",  "short": "IRC5",  "name": "Individual Report Card No. 5",  "desc": "Post Program Evaluation Results"},
    {"id": "irc6",  "short": "IRC6",  "name": "Individual Report Card No. 6",  "desc": "Monitoring & Evaluation Plan"},
    {"id": "irc7",  "short": "IRC7",  "name": "Individual Report Card No. 7",  "desc": "SGOD Dashboard Data"},
    {"id": "irc8a", "short": "IRC8a", "name": "Individual Report Card No. 8a", "desc": "Individual Performance Commitment and Review Form (IPCRF)"},
    {"id": "irc8b", "short": "IRC8b", "name": "Individual Report Card No. 8b", "desc": "Core Behavioral Competencies and Core Skills"},
    {"id": "irc8c", "short": "IRC8c", "name": "Individual Report Card No. 8c", "desc": "Summary of Ratings for Discussion"},
    {"id": "irc8d", "short": "IRC8d", "name": "Individual Report Card No. 8d", "desc": "Summary of Ratings for Discussion"},
    {"id": "irc9",  "short": "IRC9",  "name": "Individual Report Card No. 9",  "desc": "Performance Monitoring & Coaching Form (PMCF)"},
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
    {"code": "IRC1", "label": "Monthly Customers Feedback Rating & Number of Customers Served", "tabs": [TAB_LOOKUP["irc1a"], TAB_LOOKUP["irc1b"]]},
    {"code": "IRC2", "label": "Number of Schools Provided with TA & Frequency of TA Provided to DEDP Priority Schools", "tabs": [TAB_LOOKUP["irc2a"], TAB_LOOKUP["irc2b"]]},
    {"code": "IRC3", "label": "Individual Report Card No. 3", "tabs": [TAB_LOOKUP["irc3"]]},
    {"code": "IRC4", "label": "Individual Report Card No. 4", "tabs": [TAB_LOOKUP["irc4"]]},
    {"code": "IRC5", "label": "Individual Report Card No. 5", "tabs": [TAB_LOOKUP["irc5"]]},
    {"code": "IRC6", "label": "Individual Report Card No. 6", "tabs": [TAB_LOOKUP["irc6"]]},
    {"code": "IRC7", "label": "Individual Report Card No. 7", "tabs": [TAB_LOOKUP["irc7"]]},
    {"code": "IRC8", "label": "Individual Performance Commitment and Review Form (IPCRF)", "tabs": [
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
# Shared section parsers
#
# Each of these parses ONE section out of a monthly report's full text and
# returns "nothing found" in a form its caller can check with a plain
# truthiness test (empty dict / None / empty list) rather than raising --
# that's what lets the home page's combined extractor try all of them
# against a single upload and simply skip whichever ones don't match,
# without one missing section aborting the others. The single-type
# per-tab routes below (extract_irc1a_pdf, etc.) call the same helpers,
# then layer their own "this whole upload failed" checks on top.
# ---------------------------------------------------------------------------
def _parse_irc1a_indicators(full_text):
    """Returns {indicator_id (1-10): rating (float)} for whatever
    indicators could be matched in the text -- may be a partial set, or
    empty if the section isn't present at all."""
    indicators_data = {}
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
    return indicators_data


def _parse_irc1b_customers(full_text):
    """Returns the customer count (int), or None if the "No. of
    Customers:" line isn't present or couldn't be parsed."""
    customers_pattern = r"No\.\s*of\s*Customers\s*:?\s*([\d,]+)"
    match = re.search(customers_pattern, full_text, re.IGNORECASE)
    if not match:
        return None
    try:
        return int(match.group(1).replace(",", ""))
    except ValueError:
        return None


def _parse_irc2a_schools(full_text):
    """Returns a list of school names parsed from the "Schools Provided
    with TA" section, or [] if that section isn't present or nothing
    could be parsed from it."""
    section_match = re.search(
        r"Schools Provided with TA(.*?)(?:Prepared by:|$)",
        full_text,
        re.DOTALL | re.IGNORECASE,
    )
    if not section_match:
        return []
    return _parse_numbered_school_list(section_match.group(1))


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


def _upsert_irc2b_from_names(year, month_key, school_names, uploaded_file=None):
    """Marks each named school as TA-provided for this year/month in the
    IRC2b monthly grid. Meant to be called with the same list of names a
    PDF upload already wrote into IRC2a (see import_home_sections /
    import_irc2a_schools) -- so one upload feeds both report cards
    instead of just IRC2a. Names that don't match a School row are
    skipped silently; the caller has already reported those as
    'not_found' against IRC2a itself.
    """
    if month_key not in MONTH_KEYS:
        return
    for name in school_names:
        school = School.query.filter_by(name=name).first()
        if school is None:
            continue
        _upsert_irc2b_frequency(year, school.id, month_key, True, uploaded_file)


def _compute_irc3_ta_counts(year):
    """Counts, for a given year, how many DEDP-priority and how many
    Non-DEDP schools currently have status 'provided' in IRC2a. This is
    IRC3's live source of truth for the 'Provided with TA' column --
    it's no longer typed in manually (see get_irc3_data / save_irc3_status)."""
    rows = (
        db.session.query(IRC2ASchoolStatus, School)
        .join(School, IRC2ASchoolStatus.school_id == School.id)
        .filter(IRC2ASchoolStatus.year == year, IRC2ASchoolStatus.status == TA_STATUS_PROVIDED)
        .all()
    )
    dedp_count = sum(1 for _, school in rows if school.is_dedp_priority)
    nondedp_count = sum(1 for _, school in rows if not school.is_dedp_priority)
    return dedp_count, nondedp_count


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
    """Landing page shown when the app first opens. Also builds the
    fixed 12-row month grid (current year only, for now -- see
    storage.MONTH_KEYS/MONTH_FOLDER_NAMES) for the centralized upload
    section's file manager: one file per month, or an empty slot."""
    year = _current_year()

    # Ordered ascending so that if more than one file ever ends up
    # sharing a month/year (stale data from before the replace-on-
    # reupload behavior existed), the most recently uploaded one wins
    # the dict comprehension below.
    files_this_year = (
        UploadedFile.query
        .filter_by(year=year)
        .order_by(UploadedFile.uploaded_at.asc())
        .all()
    )
    files_by_month = {f.month_key: f for f in files_this_year if f.month_key}

    month_grid = [
        {
            "month_key": month_key,
            "month_label": storage.MONTH_FOLDER_NAMES[month_key],
            "file": files_by_month.get(month_key),
        }
        for month_key in MONTH_KEYS
    ]

    return render_template(
        "home.html",
        tabs=TABS,
        groups=GROUPS,
        active_tab=None,
        month_grid=month_grid,
        current_year=year,
    )


@app.route("/irc/<tab_id>")
def view_tab(tab_id):
    """Renders the dedicated template for whichever tab was requested.
    Templates are static markup with no server-side value binding -- each
    tab's own JS is responsible for fetching /irc/<tab_id>/data on load and
    populating the page client-side (see irc1a.js, irc1b.js, irc2a.js,
    irc2b.js)."""
    active_tab = TAB_LOOKUP.get(tab_id)
    if active_tab is None:
        abort(404)
    return render_template(TEMPLATE_MAP[tab_id], tabs=TABS, active_tab=active_tab)


# ---------------------------------------------------------------------------
# Per-tab "give me what's already saved" endpoints. Every tab's JS calls its
# matching one of these on page load so a reload shows previously-saved data
# instead of a blank page (the templates themselves have no server-side
# value binding -- see view_tab above).
# ---------------------------------------------------------------------------
@app.route("/irc/irc1a/data", methods=["GET"])
def get_irc1a_data():
    year = request.args.get("year", type=int) or _current_year()
    rows = IRC1ARating.query.filter_by(year=year).all()
    ratings = {}
    for row in rows:
        ratings.setdefault(str(row.indicator_id), {})[row.month_key] = row.rating
    return jsonify({"year": year, "ratings": ratings}), 200


@app.route("/irc/irc1b/data", methods=["GET"])
def get_irc1b_data():
    year = request.args.get("year", type=int) or _current_year()
    rows = IRC1BCustomerCount.query.filter_by(year=year).all()
    counts = {row.month_key: row.customer_count for row in rows}
    return jsonify({"year": year, "counts": counts}), 200


@app.route("/irc/schools", methods=["GET"])
def get_schools():
    """Master school list (id, name, level, is_dedp_priority), sourced
    from the shared `School` table -- the same one IRC2a/IRC2b already
    read from. irc4.js fetches this once on init instead of hardcoding
    its own SCHOOLS/DEDP_PRIORITY roster, so it can never drift out of
    sync with the rest of the app."""
    rows = School.query.order_by(School.name.asc()).all()
    return jsonify({"schools": [s.to_dict() for s in rows]}), 200


@app.route("/irc/irc2a/data", methods=["GET"])
def get_irc2a_data():
    year = request.args.get("year", type=int) or _current_year()
    rows = (
        db.session.query(IRC2ASchoolStatus, School)
        .join(School, IRC2ASchoolStatus.school_id == School.id)
        .filter(IRC2ASchoolStatus.year == year)
        .all()
    )
    statuses = {school.name: status.status for status, school in rows}
    return jsonify({"year": year, "statuses": statuses}), 200


@app.route("/irc/irc2a/status", methods=["POST"])
def set_irc2a_status():
    """Persists a single manual status toggle (dragging/clicking a school
    between the Provided / Not Yet Provided columns) -- as opposed to
    /irc/irc2a/import, which is for the PDF-review-then-confirm flow and
    only ever marks schools 'provided'. No PDF is involved here, so the
    resulting row keeps uploaded_file_id = NULL.

    Expected JSON body:
        { "school_name": "Antipolo NHS", "status": "provided", "year": 2026 }
    """
    data = request.get_json(silent=True) or {}
    name = data.get("school_name")
    status = data.get("status")
    year = data.get("year") or _current_year()

    if status not in (TA_STATUS_PROVIDED, TA_STATUS_UNPROVIDED):
        return jsonify({"error": f"Invalid status: {status!r}"}), 400

    outcome = _upsert_irc2a_status(year, name, status, None, None)
    if outcome == "not-found":
        return jsonify({"error": f"Unknown school: {name!r}"}), 404

    return jsonify({"school_name": name, "status": status, "year": year}), 200


@app.route("/irc/irc2b/data", methods=["GET"])
def get_irc2b_data():
    year = request.args.get("year", type=int) or _current_year()
    rows = (
        db.session.query(IRC2BTAFrequency, School)
        .join(School, IRC2BTAFrequency.school_id == School.id)
        .filter(IRC2BTAFrequency.year == year)
        .all()
    )
    frequencies = {}
    for freq, school in rows:
        frequencies.setdefault(school.name, {})[freq.month_key] = freq.provided
    return jsonify({"year": year, "frequencies": frequencies}), 200


@app.route("/irc/irc3/data", methods=["GET"])
def get_irc3_data():
    """'Provided with TA' counts are computed live from IRC2a's school
    status (see _compute_irc3_ta_counts) -- they're no longer stored
    directly. Targets still come from IRC3Status, since those are the
    one thing on this page that's still genuinely manual entry."""
    year = request.args.get("year", type=int) or _current_year()
    row = IRC3Status.query.filter_by(year=year).first()
    dedp_ta_count, nondedp_ta_count = _compute_irc3_ta_counts(year)

    return jsonify({
        "year": year,
        "dedp_ta_count": dedp_ta_count,
        "nondedp_ta_count": nondedp_ta_count,
        "dedp_target": row.dedp_target if row else 0,
        "nondedp_target": row.nondedp_target if row else 0,
    }), 200


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


@app.route("/files/reset", methods=["DELETE"])
def reset_all_files():
    """Wipes every uploaded PDF for a given year (defaults to the current
    year -- the same year the home page's Monthly Files grid is scoped
    to), one at a time through storage.delete_uploaded_file so each file
    gets the same on-disk cleanup and cascading DB delete (ratings,
    customer counts, school statuses, ...) as a single-row delete via
    DELETE /files/<id>. Used by the home page's "Reset" button to clear
    every month in one action instead of deleting rows one by one.
    """
    year = request.args.get("year", type=int) or _current_year()
    files = UploadedFile.query.filter_by(year=year).all()
    for uploaded_file in files:
        storage.delete_uploaded_file(uploaded_file, app.config["UPLOAD_ROOT"])
    return jsonify({"reset": True, "year": year, "deleted": len(files)}), 200


@app.route("/irc/home/extract", methods=["POST"])
def extract_home_pdf():
    """Combined home-page upload: runs every applicable section
    extractor (IRC1a ratings, IRC1b customer count, IRC2a school list)
    against a single PDF, instead of requiring one upload per report
    type. A section that isn't found is simply omitted from the
    response -- the whole upload only fails if the month header itself
    can't be located, or if none of the sections matched anything.

    As with the per-type extract routes, the file is saved and its
    UploadedFile row registered immediately (irc_type left NULL, since
    it may end up feeding more than one table -- see
    UploadedFile.linked_irc_types()); nothing is written to the IRC
    tables themselves until /irc/home/import confirms it.

    If this year/month already has a file on record, its info is
    returned as `existing_file` so the frontend can warn the user that
    confirming the import will replace it (the actual replacement --
    deleting the old file -- happens at /irc/home/import time, only
    once the new one's data has been safely written).
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

        month_name, month_key = _extract_month(full_text)

        if not month_name:
            return jsonify({"error": "Could not find month in PDF header"}), 400
        if not month_key:
            return jsonify({"error": f"Unknown month: {month_name}"}), 400

        sections = {}

        irc1a_ratings = _parse_irc1a_indicators(full_text)
        if irc1a_ratings:
            sections["irc1a"] = {
                str(indicator_id): {month_key: rating}
                for indicator_id, rating in irc1a_ratings.items()
            }

        irc1b_customers = _parse_irc1b_customers(full_text)
        if irc1b_customers is not None:
            sections["irc1b"] = {"customers": irc1b_customers}

        irc2a_schools = _parse_irc2a_schools(full_text)
        if irc2a_schools:
            sections["irc2a"] = {"schools": irc2a_schools}

        if not sections:
            return jsonify({
                "error": "Found the report header but couldn't match any known "
                         "section (TA ratings, customer count, or school list) "
                         "in this PDF."
            }), 400

        year = _current_year()

        existing = (
            UploadedFile.query
            .filter_by(year=year, month_key=month_key)
            .order_by(UploadedFile.uploaded_at.desc())
            .first()
        )
        existing_info = (
            {"id": existing.id, "filename": existing.original_filename}
            if existing else None
        )

        file_fields = storage.save_uploaded_pdf(
            file, app.config["UPLOAD_ROOT"], irc_type="monthly", year=year, month_key=month_key
        )
        file_fields["irc_type"] = None  # combined upload -- see UploadedFile docstring
        uploaded_file = UploadedFile(**file_fields)
        db.session.add(uploaded_file)
        db.session.commit()

        return jsonify({
            "month": month_name,
            "month_key": month_key,
            "year": year,
            "file_id": uploaded_file.id,
            "sections": sections,
            "existing_file": existing_info,
        }), 200

    except Exception as e:
        return jsonify({"error": f"Error processing PDF: {str(e)}"}), 500


@app.route("/irc/home/import", methods=["POST"])
def import_home_sections():
    """Commits the user-confirmed (and possibly edited) subset of a
    combined home-page upload.

    Expected JSON body:
        {
          "file_id": 42,        // from /irc/home/extract's response
          "year": 2026,         // optional, defaults to current year
          "month_key": "jul",
          "sections": {
            "irc1a": {"1": 4.0, "2": 3.5, ...},      // optional
            "irc1b": {"customers": 1234},             // optional
            "irc2a": {"schools": ["School A", ...]}   // optional
          }
        }

    Only the sections present in `sections` are written -- a section the
    user removed/cleared in the review modal simply isn't included and
    is left untouched, same spirit as the per-type /import routes.

    Once the new file's data is safely written, this is also where a
    month's file actually gets replaced: any *other* UploadedFile rows
    for this exact year/month are deleted (cascading to their own
    extracted records), so a month never ends up with more than one
    file behind it.
    """
    data = request.get_json(silent=True) or {}
    file_id = data.get("file_id")
    month_key = data.get("month_key")
    year = data.get("year") or _current_year()
    sections = data.get("sections")

    if month_key not in MONTH_KEYS:
        return jsonify({"error": f"Invalid month_key: {month_key!r}"}), 400
    if not isinstance(sections, dict) or not sections:
        return jsonify({"error": "'sections' must include at least one section to import"}), 400

    uploaded_file = UploadedFile.query.get(file_id) if file_id else None
    results = {}

    if "irc1a" in sections and isinstance(sections["irc1a"], dict):
        ratings_by_indicator = {}
        for key, value in sections["irc1a"].items():
            try:
                indicator_id = int(key)
                rating = float(value)
            except (TypeError, ValueError):
                continue
            if not (1 <= indicator_id <= 10):
                continue
            if not (1 <= rating <= 5):
                continue
            ratings_by_indicator[indicator_id] = rating
        if ratings_by_indicator:
            _upsert_irc1a_ratings(year, month_key, ratings_by_indicator, uploaded_file)
            results["irc1a"] = {"updated": sorted(ratings_by_indicator.keys())}

    if "irc1b" in sections and isinstance(sections["irc1b"], dict):
        try:
            customers = int(sections["irc1b"].get("customers"))
        except (TypeError, ValueError):
            customers = None
        if customers is not None and customers >= 0:
            _upsert_irc1b_customer_count(year, month_key, customers, uploaded_file)
            results["irc1b"] = {"customers": customers}

    if "irc2a" in sections and isinstance(sections["irc2a"], dict):
        school_names = sections["irc2a"].get("schools")
        if isinstance(school_names, list) and school_names:
            updated, not_found = [], []
            for name in school_names:
                outcome = _upsert_irc2a_status(year, name, TA_STATUS_PROVIDED, month_key, uploaded_file)
                (updated if outcome == "ok" else not_found).append(name)
            results["irc2a"] = {"updated": updated, "not_found": not_found}

            # Same school list also checks the corresponding month's box
            # in IRC2b's monthly TA-frequency grid, not just IRC2a's
            # current status -- one upload now feeds both report cards.
            if updated:
                _upsert_irc2b_from_names(year, month_key, updated, uploaded_file)
                results["irc2b"] = {"updated": updated}

    if not results:
        return jsonify({"error": "No valid section data to import"}), 400

    # Replace-on-reupload: now that the new file's sections are safely
    # written, remove any other file(s) previously on record for this
    # exact year/month, cascading to whatever they had extracted.
    if uploaded_file is not None:
        stale_files = UploadedFile.query.filter(
            UploadedFile.year == year,
            UploadedFile.month_key == month_key,
            UploadedFile.id != uploaded_file.id,
        ).all()
        for stale in stale_files:
            storage.delete_uploaded_file(stale, app.config["UPLOAD_ROOT"])

    return jsonify({"year": year, "month_key": month_key, "results": results}), 200


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
        indicators_data = _parse_irc1a_indicators(full_text)

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


@app.route("/irc/irc1a/rating/<month_key>/<int:indicator_id>", methods=["DELETE"])
def delete_irc1a_rating(month_key, indicator_id):
    """Deletes a single manually-cleared IRC1a rating cell (year/month/
    indicator). This is the counterpart to /irc/irc1a/import's upsert --
    without it, clearing a cell in the table had nowhere to send that
    change, so the old value silently came back on the next page load.

    Only the rating row itself is removed. If it happened to be populated
    by a PDF import, that PDF and its UploadedFile row are left untouched
    -- deleting the PDF from the home page's month grid (delete_file) is
    still the only way to remove that. This lets the user clear/edit a
    cell without being forced to also remove the source PDF, and vice
    versa.

    Idempotent: returns 200 whether or not a row existed, since "delete"
    here really means "make sure this cell has no saved value."
    """
    year = request.args.get("year", type=int) or _current_year()

    if month_key not in MONTH_KEYS:
        return jsonify({"error": f"Invalid month_key: {month_key!r}"}), 400
    if not (1 <= indicator_id <= 10):
        return jsonify({"error": f"Invalid indicator_id: {indicator_id!r}"}), 400

    row = IRC1ARating.query.filter_by(
        year=year, month_key=month_key, indicator_id=indicator_id
    ).first()
    if row is not None:
        db.session.delete(row)
        db.session.commit()

    return jsonify({
        "deleted": True,
        "year": year,
        "month_key": month_key,
        "indicator_id": indicator_id,
    }), 200


@app.route("/irc/irc1a/reset", methods=["DELETE"])
def reset_irc1a_ratings():
    """Wipes every IRC1a rating for a given year (defaults to current
    year) in one shot. This is the "Reset All Data" button's counterpart
    to delete_irc1a_rating above, which only ever clears a single cell.

    Uploaded PDF files themselves (and their UploadedFile rows) are left
    untouched -- this only clears the rating values, same scoping as
    delete_irc1a_rating.
    """
    year = request.args.get("year", type=int) or _current_year()
    IRC1ARating.query.filter_by(year=year).delete()
    db.session.commit()
    return jsonify({"reset": True, "year": year}), 200


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
        customers = _parse_irc1b_customers(full_text)

        if customers is None:
            return jsonify({
                "error": "Could not find 'No. of Customers:' in the PDF. Please ensure the PDF has the correct format."
            }), 400

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


@app.route("/irc/irc1b/count/<month_key>", methods=["DELETE"])
def delete_irc1b_count(month_key):
    """Deletes a single manually-cleared IRC1b customer count (year/
    month). Same rationale and same "PDF stays put" behavior as
    delete_irc1a_rating above -- see its docstring."""
    year = request.args.get("year", type=int) or _current_year()

    if month_key not in MONTH_KEYS:
        return jsonify({"error": f"Invalid month_key: {month_key!r}"}), 400

    row = IRC1BCustomerCount.query.filter_by(year=year, month_key=month_key).first()
    if row is not None:
        db.session.delete(row)
        db.session.commit()

    return jsonify({"deleted": True, "year": year, "month_key": month_key}), 200


@app.route("/irc/irc1b/reset", methods=["DELETE"])
def reset_irc1b_counts():
    """Wipes every IRC1b customer count for a given year (defaults to
    current year) in one shot. This is the "Reset All Data" button's
    counterpart to delete_irc1b_count above, which only ever clears a
    single cell -- same scoping as reset_irc1a_ratings.

    Uploaded PDF files themselves (and their UploadedFile rows) are left
    untouched -- this only clears the customer-count values.
    """
    year = request.args.get("year", type=int) or _current_year()
    IRC1BCustomerCount.query.filter_by(year=year).delete()
    db.session.commit()
    return jsonify({"reset": True, "year": year}), 200


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

    # Same list also feeds IRC2b's monthly grid for this month, mirroring
    # the home-page combined upload's behavior (see import_home_sections).
    if results["updated"] and month_key:
        _upsert_irc2b_from_names(year, month_key, results["updated"], uploaded_file)

    return jsonify(results), 200


@app.route("/irc/irc2a/reset", methods=["DELETE"])
def reset_irc2a_statuses():
    """Wipes every IRC2a school status for a given year (defaults to
    current year) in one shot -- the "Reset All Data" button's
    counterpart to set_irc2a_status, which only ever toggles a single
    school. Every school reverts to "Not Yet Provided with TA" (the
    frontend's baseline for a school with no row at all -- see
    initState() in irc2a.js).

    Scoped to IRC2a only: uploaded PDF files and IRC2b's monthly TA
    grid are left untouched, same as IRC1a/IRC1b's own reset routes
    only ever clear their own table.
    """
    year = request.args.get("year", type=int) or _current_year()
    IRC2ASchoolStatus.query.filter_by(year=year).delete()
    db.session.commit()
    return jsonify({"reset": True, "year": year}), 200


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


@app.route("/irc/irc2b/reset", methods=["DELETE"])
def reset_irc2b_frequencies():
    """Wipes every IRC2b TA-frequency checkbox for a given year (defaults
    to current year) in one shot -- the "Reset All Data" button's
    counterpart to save_irc2b_frequency, which only ever toggles
    individual checkboxes. Every school/month reverts to unchecked (the
    frontend's baseline for a school/month with no row at all -- see
    loadPersistedFrequencies() in irc2b.js).

    Scoped to IRC2b only: uploaded PDF files and IRC2a's status board
    are left untouched, same as IRC1a/IRC1b/IRC2a's own reset routes
    only ever clear their own table.
    """
    year = request.args.get("year", type=int) or _current_year()
    IRC2BTAFrequency.query.filter_by(year=year).delete()
    db.session.commit()
    return jsonify({"reset": True, "year": year}), 200


@app.route("/irc/irc3/save", methods=["POST"])
def save_irc3_status():
    """Persists the manually-entered IRC3 *targets* for a year. The
    'Provided with TA' counts are no longer entered here -- they're
    computed live from IRC2a's school status (see get_irc3_data /
    _compute_irc3_ta_counts), since IRC2a already tracks that. This
    endpoint still snapshots the computed counts into IRC3Status
    alongside the targets, purely so a DB browse of that table shows a
    consistent picture -- the counts themselves are never read from
    there for display.

    Expected JSON body:
        { "year": 2026, "dedp_target": 26, "nondedp_target": 41 }
    """
    data = request.get_json(silent=True) or {}
    year = data.get("year") or _current_year()

    try:
        dedp_target = int(data.get("dedp_target", 0))
        nondedp_target = int(data.get("nondedp_target", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Target fields must be integers"}), 400

    dedp_ta_count, nondedp_ta_count = _compute_irc3_ta_counts(year)
    row = _upsert_irc3_status(year, dedp_ta_count, dedp_target, nondedp_ta_count, nondedp_target)
    return jsonify({
        "year": row.year,
        "dedp_ta_count": row.dedp_ta_count,
        "dedp_target": row.dedp_target,
        "nondedp_ta_count": row.nondedp_ta_count,
        "nondedp_target": row.nondedp_target,
    }), 200


# ---------------------------------------------------------------------------
# IRC4 -- Technical Assistance (TA) Catch-up Plan
#
# No PDF pipeline here (see models.py) -- these routes just persist
# whatever irc4.js's fields/modal submit, same treatment as IRC5/IRC6.
# One plan per year; `_ensure_irc4_plan` also guarantees at least three
# blank objectives exist for a brand-new year, mirroring _ensure_irc6_seed
# (irc4.js's init() comment relies on this: "the server guarantees at
# least three blank objectives exist" instead of seeding them client-side).
# ---------------------------------------------------------------------------
IRC4_MIN_OBJECTIVES = 3

# Matches irc4.js's own MONTH_LABELS keys exactly (capitalized 3-letter
# codes) -- irc4.js is the source of truth for this format, not this
# app's usual lowercase MONTH_KEYS (see save_irc4_group's note below).
IRC4_SCHEDULE_MONTHS = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

IRC4_PLAN_FIELD_MAP = {
    "activity": "activity",
    "taReceiver": "ta_receiver",
    "movs": "movs",
}


def _ensure_irc4_plan(year):
    plan = IRC4Plan.query.filter_by(year=year).first()
    if plan is None:
        plan = IRC4Plan(year=year)
        db.session.add(plan)
        db.session.flush()  # assigns plan.id before objectives reference it

    existing_count = IRC4Objective.query.filter_by(plan_id=plan.id).count()
    for i in range(existing_count, IRC4_MIN_OBJECTIVES):
        db.session.add(IRC4Objective(plan_id=plan.id, text="", sort_order=i))

    db.session.commit()
    return plan


@app.route("/irc/irc4/data", methods=["GET"])
def get_irc4_data():
    year = request.args.get("year", type=int) or _current_year()
    plan = _ensure_irc4_plan(year)
    return jsonify(plan.to_dict()), 200


@app.route("/irc/irc4/plan", methods=["POST"])
def save_irc4_plan():
    """Persists a single field of the plan (Activity, TA Receiver, or
    MOV's) -- irc4.js debounces and saves one field at a time, mirroring
    IRC2b's per-checkbox save.

    Expected JSON body (one of):
        { "activity": "..." }
        { "taReceiver": "..." }
        { "movs": "..." }
    """
    data = request.get_json(silent=True) or {}
    year = data.get("year") or _current_year()
    plan = _ensure_irc4_plan(year)

    for json_key, col_name in IRC4_PLAN_FIELD_MAP.items():
        if json_key in data:
            setattr(plan, col_name, data[json_key])

    db.session.commit()
    return jsonify(plan.to_dict()), 200


@app.route("/irc/irc4/objective", methods=["POST"])
def save_irc4_objective():
    """Creates a new objective (id omitted), or updates an existing one's
    text (id included).

    Expected JSON body:
        { "id": 7, "text": "..." }   // omit/null id to create
    """
    data = request.get_json(silent=True) or {}
    obj_id = data.get("id")
    year = data.get("year") or _current_year()

    if obj_id:
        obj = IRC4Objective.query.get(obj_id)
        if obj is None:
            return jsonify({"error": "Objective not found"}), 404
        obj.text = data.get("text", obj.text)
    else:
        plan = _ensure_irc4_plan(year)
        max_order = (
            db.session.query(db.func.max(IRC4Objective.sort_order))
            .filter_by(plan_id=plan.id)
            .scalar()
            or 0
        )
        obj = IRC4Objective(plan_id=plan.id, text=data.get("text", ""), sort_order=max_order + 1)
        db.session.add(obj)

    db.session.commit()
    return jsonify(obj.to_dict()), 200


@app.route("/irc/irc4/objective/<int:objective_id>", methods=["DELETE"])
def delete_irc4_objective(objective_id):
    obj = IRC4Objective.query.get(objective_id)
    if obj is None:
        return jsonify({"error": "Objective not found"}), 404
    db.session.delete(obj)
    db.session.commit()
    return jsonify({"deleted": True, "id": objective_id}), 200


@app.route("/irc/irc4/group", methods=["POST"])
def save_irc4_group():
    """Creates a new group (id omitted), or updates an existing one's
    schools + schedule (id included). The full `schools` list is always
    sent by irc4.js's modal (the whole draft, not a delta), so this
    replaces the group's school set wholesale rather than diffing it.

    Expected JSON body:
        {
          "id": 7,                      // omit/null to create a new group
          "schools": ["Antipolo NHS", ...],
          "schedule": "Jul"              // one of IRC4_SCHEDULE_MONTHS, or null
        }
    """
    data = request.get_json(silent=True) or {}
    group_id = data.get("id")
    year = data.get("year") or _current_year()

    # NOTE: irc4.js's own MONTH_LABELS keys ("Jan".."Dec", capitalized) are
    # the codes it actually sends and expects back -- NOT the lowercase
    # "jan".."dec" MONTH_KEYS the rest of this app uses for monthly grids.
    # Validating against the wrong casing here silently discarded every
    # schedule pick (always fell through to None), which is why groups
    # showed "No month selected" on the main page even after a month was
    # chosen in the modal. See IRC4_SCHEDULE_MONTHS below.
    schedule = data.get("schedule")
    if schedule not in IRC4_SCHEDULE_MONTHS:
        schedule = None

    school_names = data.get("schools") or []

    if group_id:
        group = IRC4Group.query.get(group_id)
        if group is None:
            return jsonify({"error": "Group not found"}), 404
    else:
        plan = _ensure_irc4_plan(year)
        max_order = (
            db.session.query(db.func.max(IRC4Group.sort_order))
            .filter_by(plan_id=plan.id)
            .scalar()
            or 0
        )
        group = IRC4Group(plan_id=plan.id, sort_order=max_order + 1)
        db.session.add(group)
        db.session.flush()  # assigns group.id before IRC4GroupSchool rows reference it

    group.schedule_month_key = schedule

    # Replace the school set wholesale. Unknown names (no matching School
    # row) are skipped silently, same convention as _upsert_irc2b_from_names.
    IRC4GroupSchool.query.filter_by(group_id=group.id).delete()
    seen_ids = set()
    for name in school_names:
        school = School.query.filter_by(name=name).first()
        if school is None or school.id in seen_ids:
            continue
        seen_ids.add(school.id)
        db.session.add(IRC4GroupSchool(group_id=group.id, school_id=school.id))

    db.session.commit()
    return jsonify(group.to_dict()), 200


@app.route("/irc/irc4/group/<int:group_id>", methods=["DELETE"])
def delete_irc4_group(group_id):
    group = IRC4Group.query.get(group_id)
    if group is None:
        return jsonify({"error": "Group not found"}), 404
    db.session.delete(group)
    db.session.commit()
    return jsonify({"deleted": True, "id": group_id}), 200


@app.route("/irc/irc4/school-ta-status", methods=["GET"])
def get_irc4_school_ta_status():
    """{ school_name: count } of IRC2b months marked 'provided' this
    year -- the source for irc4.js's TA-provided indicator box. Schools
    with a count of 0 are omitted entirely (per the modal's spec: no
    entry means 'not yet provided'). Resets every year, same as every
    other year-scoped table in this app -- a school's count here is
    IRC2b's `provided` rows for THIS year only, not a running total."""
    year = request.args.get("year", type=int) or _current_year()

    rows = (
        db.session.query(School.name, db.func.count(IRC2BTAFrequency.id))
        .join(IRC2BTAFrequency, IRC2BTAFrequency.school_id == School.id)
        .filter(IRC2BTAFrequency.year == year, IRC2BTAFrequency.provided.is_(True))
        .group_by(School.name)
        .all()
    )
    return jsonify({name: count for name, count in rows if count > 0}), 200


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

        # --- Persist: save the PDF and register its UploadedFile row now
        # (so file_id is available for the preview modal and a later
        # delete still cleans up the file). We deliberately do NOT write
        # IRC9Entry rows here -- the frontend shows a preview modal first
        # and lets the user edit/remove any entry before committing, so
        # the actual writes happen in /irc/irc9/import once confirmed.
        # This mirrors IRC1a/IRC2a's extract/import split. No month_key:
        # a PMCF file isn't tied to a single month the way IRC1a's is. ---
        year = _current_year()
        file_fields = storage.save_uploaded_pdf(
            file, app.config["UPLOAD_ROOT"], irc_type="irc9", year=year
        )
        uploaded_file = UploadedFile(**file_fields)
        db.session.add(uploaded_file)
        db.session.commit()

        return jsonify({
            "entries": entries,
            "file_id": uploaded_file.id,
            "year": year,
        }), 200

    except Exception as e:
        return jsonify({"error": f"Error processing PDF: {str(e)}"}), 500


# ---------------------------------------------------------------------------
# IRC9 -- Performance Monitoring & Coaching Form (PMCF)
#
# Manually-added entries persist with uploaded_file_id = NULL; entries
# confirmed from the PDF-import preview above are saved via
# /irc/irc9/import, which links them back to the UploadedFile row already
# created in /irc/irc9/extract -- same two-step extract-then-import flow
# as IRC1a/IRC1b/IRC2a.
# ---------------------------------------------------------------------------
@app.route("/irc/irc9/data", methods=["GET"])
def get_irc9_data():
    year = request.args.get("year", type=int) or _current_year()
    rows = (
        IRC9Entry.query.filter_by(year=year)
        .order_by(IRC9Entry.sort_order.asc(), IRC9Entry.id.asc())
        .all()
    )
    return jsonify({"year": year, "entries": [r.to_dict() for r in rows]}), 200


@app.route("/irc/irc9/entry", methods=["POST"])
def save_irc9_entry():
    """Creates a new entry, or updates an existing one if 'id' is included.

    Expected JSON body:
        {
          "id": 7,              // omit/null to create a new entry
          "year": 2026,
          "date": "2026-07-01",
          "incident": "...", "output": "...", "impact": "..."
        }
    """
    data = request.get_json(silent=True) or {}
    entry_id = data.get("id")
    year = data.get("year") or _current_year()
    incident = (data.get("incident") or "").strip()

    if not incident:
        return jsonify({"error": "'incident' is required"}), 400

    if entry_id:
        entry = IRC9Entry.query.get(entry_id)
        if entry is None:
            return jsonify({"error": "Entry not found"}), 404
    else:
        max_order = (
            db.session.query(db.func.max(IRC9Entry.sort_order))
            .filter_by(year=year)
            .scalar()
        )
        entry = IRC9Entry(year=year, sort_order=(max_order or 0) + 1)
        db.session.add(entry)

    entry.year = year
    entry.date = data.get("date") or None
    entry.incident = incident
    entry.output = (data.get("output") or "").strip() or None
    entry.impact = (data.get("impact") or "").strip() or None

    db.session.commit()
    return jsonify(entry.to_dict()), 200


@app.route("/irc/irc9/entry/<int:entry_id>", methods=["DELETE"])
def delete_irc9_entry(entry_id):
    entry = IRC9Entry.query.get(entry_id)
    if entry is None:
        return jsonify({"error": "Entry not found"}), 404
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"deleted": True, "id": entry_id}), 200


@app.route("/irc/irc9/import", methods=["POST"])
def import_irc9_entries():
    """Commits the user-confirmed (and possibly edited) entries from the
    PDF-import preview modal, linking them back to the UploadedFile row
    /irc/irc9/extract already created.

    Expected JSON body:
        {
          "fileId": 42,          // from /irc/irc9/extract's response
          "year": 2026,          // optional, defaults to current year
          "entries": [
            {"date": "2026-07-01", "incident": "...", "output": "...", "impact": "..."},
            ...
          ]
        }
    """
    data = request.get_json(silent=True) or {}
    year = data.get("year") or _current_year()
    file_id = data.get("fileId")
    entries_data = data.get("entries")

    if not isinstance(entries_data, list) or not entries_data:
        return jsonify({"error": "'entries' must be a non-empty list"}), 400

    uploaded_file = UploadedFile.query.get(file_id) if file_id else None

    max_order = (
        db.session.query(db.func.max(IRC9Entry.sort_order))
        .filter_by(year=year)
        .scalar()
        or 0
    )

    created = []
    for i, e in enumerate(entries_data):
        incident = (e.get("incident") or "").strip()
        if not incident:
            continue  # skip a blank/removed-in-preview entry rather than failing the whole batch
        entry = IRC9Entry(
            year=year,
            uploaded_file_id=uploaded_file.id if uploaded_file else None,
            date=e.get("date") or None,
            incident=incident,
            output=(e.get("output") or "").strip() or None,
            impact=(e.get("impact") or "").strip() or None,
            sort_order=max_order + i + 1,
        )
        db.session.add(entry)
        created.append(entry)

    if not created:
        return jsonify({"error": "No valid entries to import"}), 400

    db.session.commit()
    return jsonify({"entries": [e.to_dict() for e in created]}), 200


# ---------------------------------------------------------------------------
# IRC5 -- Post Program Evaluation Results
#
# No PDF pipeline here (see models.py) -- these routes just persist
# whatever the "Add Entry" modal in irc5.js submits.
# ---------------------------------------------------------------------------
@app.route("/irc/irc5/data", methods=["GET"])
def get_irc5_data():
    year = request.args.get("year", type=int) or _current_year()
    rows = IRC5Entry.query.filter_by(year=year).order_by(IRC5Entry.id.asc()).all()
    return jsonify({"year": year, "entries": [r.to_dict() for r in rows]}), 200


@app.route("/irc/irc5/entry", methods=["POST"])
def save_irc5_entry():
    """Creates a new entry, or updates an existing one if 'id' is included.

    Expected JSON body:
        {
          "id": 7,                 // omit/null to create a new entry
          "year": 2026,
          "title": "...", "nature": "Funded",
          "dateIsoList": ["2026-07-01", ...], "dateDisplay": "Jul. 1, 2026",
          "participants": "...", "rating": 3.75, "descVal": "Strongly Agree",
          "indicator": "...", "cause": "...", "measures": "..."
        }
    """
    data = request.get_json(silent=True) or {}
    entry_id = data.get("id")
    year = data.get("year") or _current_year()
    title = (data.get("title") or "").strip()
    nature = data.get("nature")

    if not title:
        return jsonify({"error": "'title' is required"}), 400
    if nature not in (IRC5_NATURE_FUNDED, IRC5_NATURE_NONFUNDED):
        return jsonify({"error": f"Invalid nature: {nature!r}"}), 400

    rating_raw = data.get("rating")
    try:
        rating = float(rating_raw) if rating_raw not in (None, "") else None
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid rating"}), 400

    if entry_id:
        entry = IRC5Entry.query.get(entry_id)
        if entry is None:
            return jsonify({"error": "Entry not found"}), 404
    else:
        entry = IRC5Entry(year=year)
        db.session.add(entry)

    entry.year = year
    entry.title = title
    entry.nature = nature
    entry.date_iso_list = data.get("dateIsoList") or []
    entry.date_display = data.get("dateDisplay") or ""
    entry.participants = data.get("participants")
    entry.rating = rating
    entry.desc_val = data.get("descVal")
    entry.indicator = data.get("indicator")
    entry.cause = data.get("cause")
    entry.measures = data.get("measures")

    db.session.commit()
    return jsonify(entry.to_dict()), 200


@app.route("/irc/irc5/entry/<int:entry_id>", methods=["DELETE"])
def delete_irc5_entry(entry_id):
    entry = IRC5Entry.query.get(entry_id)
    if entry is None:
        return jsonify({"error": "Entry not found"}), 404
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"deleted": True, "id": entry_id}), 200


# ---------------------------------------------------------------------------
# IRC6 -- Monitoring & Evaluation Plan
# ---------------------------------------------------------------------------
def _ensure_irc6_seed(year):
    """Guarantees a Goal row and an Outcome row exist for `year`, mirroring
    the seeding irc6.js used to do purely in memory before this table
    existed. Safe to call on every GET/POST -- it's a no-op once both
    rows exist."""
    if not IRC6Entry.query.filter_by(year=year, kind=IRC6_KIND_GOAL).first():
        db.session.add(IRC6Entry(year=year, kind=IRC6_KIND_GOAL, sort_order=0))
    if not IRC6Entry.query.filter_by(year=year, kind=IRC6_KIND_OUTCOME).first():
        db.session.add(IRC6Entry(year=year, kind=IRC6_KIND_OUTCOME, sort_order=1))
    db.session.commit()


@app.route("/irc/irc6/data", methods=["GET"])
def get_irc6_data():
    year = request.args.get("year", type=int) or _current_year()
    _ensure_irc6_seed(year)
    rows = (
        IRC6Entry.query.filter_by(year=year)
        .order_by(IRC6Entry.sort_order.asc(), IRC6Entry.id.asc())
        .all()
    )
    return jsonify({"year": year, "entries": [r.to_dict() for r in rows]}), 200


@app.route("/irc/irc6/entry", methods=["POST"])
def save_irc6_entry():
    """Creates a new Output (id omitted), or updates an existing Goal /
    Outcome / Output row (id included). A row's `kind` is fixed at
    creation and never changes here -- only Outputs can be created this
    way; Goal/Outcome only ever come from _ensure_irc6_seed.

    Expected JSON body:
        {
          "id": 7,          // omit/null to create a new Output
          "year": 2026,
          "title": "...",   // Output only -- ignored for Goal/Outcome
          "objectives": "...", "indicators": "...", "definition": "...",
          "dcSource": "...", "dcPerson": "...", "dcFreq": "...",
          "daUsed": "...", "daPerson": "...", "daFreq": "...",
          "users": "...",
          "repComm": "...", "repFreq": "..."
        }
    """
    data = request.get_json(silent=True) or {}
    entry_id = data.get("id")
    year = data.get("year") or _current_year()

    field_map = {
        "objectives": "objectives", "indicators": "indicators", "definition": "definition",
        "dcSource": "dc_source", "dcPerson": "dc_person", "dcFreq": "dc_freq",
        "daUsed": "da_used", "daPerson": "da_person", "daFreq": "da_freq",
        "users": "users", "repComm": "rep_comm", "repFreq": "rep_freq",
    }

    if entry_id:
        entry = IRC6Entry.query.get(entry_id)
        if entry is None:
            return jsonify({"error": "Entry not found"}), 404
    else:
        _ensure_irc6_seed(year)
        max_order = db.session.query(db.func.max(IRC6Entry.sort_order)).filter_by(year=year).scalar() or 0
        entry = IRC6Entry(year=year, kind=IRC6_KIND_OUTPUT, sort_order=max_order + 1)
        db.session.add(entry)

    if entry.kind == IRC6_KIND_OUTPUT:
        entry.title = (data.get("title") or "").strip()

    for json_key, col_name in field_map.items():
        if json_key in data:
            setattr(entry, col_name, data[json_key])

    db.session.commit()
    return jsonify(entry.to_dict()), 200


@app.route("/irc/irc6/entry/<int:entry_id>", methods=["DELETE"])
def delete_irc6_entry(entry_id):
    entry = IRC6Entry.query.get(entry_id)
    if entry is None:
        return jsonify({"error": "Entry not found"}), 404
    if entry.kind != IRC6_KIND_OUTPUT:
        return jsonify({"error": "Goal and Outcome rows cannot be deleted"}), 400
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"deleted": True, "id": entry_id}), 200


# ---------------------------------------------------------------------------
# IRC7 -- SGOD Dashboard Data
#
# Fixed rows (schools/curricular offerings) come from IRC7Row, seeded once
# via storage.seed_irc7_rows() -- these routes never create/delete rows.
# Columns (IRC7Column) are user-defined and fully CRUD-able; values
# (IRC7CellValue) are year-scoped and saved one cell at a time as the user
# edits the table. See the IRC7* section of models.py for the full
# rationale behind this EAV-style shape.
# ---------------------------------------------------------------------------
@app.route("/irc/irc7/data", methods=["GET"])
def get_irc7_data():
    year = request.args.get("year", type=int) or _current_year()
    rows = IRC7Row.query.order_by(IRC7Row.sort_order.asc()).all()
    columns = IRC7Column.query.order_by(IRC7Column.sort_order.asc()).all()
    cell_values = IRC7CellValue.query.filter_by(year=year).all()
    values = {f"{cv.row_id}:{cv.column_id}": cv.value for cv in cell_values}
    return jsonify({
        "year": year,
        "rows": [r.to_dict() for r in rows],
        "columns": [c.to_dict() for c in columns],
        "values": values,
    }), 200


@app.route("/irc/irc7/columns", methods=["POST"])
def add_irc7_columns():
    """Adds one or more columns in one call, matching the "Add Columns"
    modal's ability to submit several groups/columns at once.

    Expected JSON body:
        { "columns": [ {"name": "...", "type": "text", "groupName": "..."}, ... ] }

    Columns sharing the same non-empty groupName are meant to render
    under one spanning group header on the frontend (see irc7.js);
    nothing about that grouping is enforced here beyond storing the name.
    """
    data = request.get_json(silent=True) or {}
    new_columns = data.get("columns")
    if not isinstance(new_columns, list) or not new_columns:
        return jsonify({"error": "'columns' must be a non-empty list"}), 400

    valid_types = (IRC7_COLUMN_TYPE_TEXT, IRC7_COLUMN_TYPE_NUMBER, IRC7_COLUMN_TYPE_PARAGRAPH)
    max_order = db.session.query(db.func.max(IRC7Column.sort_order)).scalar() or 0

    created = []
    for col in new_columns:
        name = (col.get("name") or "").strip()
        col_type = col.get("type") or IRC7_COLUMN_TYPE_TEXT
        group_name = (col.get("groupName") or "").strip() or None
        if not name:
            continue
        if col_type not in valid_types:
            return jsonify({"error": f"Invalid column type: {col_type!r}"}), 400
        max_order += 1
        new_col = IRC7Column(name=name, type=col_type, group_name=group_name, sort_order=max_order)
        db.session.add(new_col)
        created.append(new_col)

    if not created:
        return jsonify({"error": "Please add at least one column with a name."}), 400

    db.session.commit()
    return jsonify({"columns": [c.to_dict() for c in created]}), 200


@app.route("/irc/irc7/column/<int:column_id>", methods=["PUT"])
def edit_irc7_column(column_id):
    """Expected JSON body: { "name": "...", "type": "text" }"""
    data = request.get_json(silent=True) or {}
    column = IRC7Column.query.get(column_id)
    if column is None:
        return jsonify({"error": "Column not found"}), 404

    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name cannot be empty"}), 400
    col_type = data.get("type") or column.type
    if col_type not in (IRC7_COLUMN_TYPE_TEXT, IRC7_COLUMN_TYPE_NUMBER, IRC7_COLUMN_TYPE_PARAGRAPH):
        return jsonify({"error": f"Invalid column type: {col_type!r}"}), 400

    column.name = name
    column.type = col_type
    db.session.commit()
    return jsonify(column.to_dict()), 200


@app.route("/irc/irc7/column/<int:column_id>", methods=["DELETE"])
def delete_irc7_column(column_id):
    column = IRC7Column.query.get(column_id)
    if column is None:
        return jsonify({"error": "Column not found"}), 404
    db.session.delete(column)  # cascades to this column's cell values
    db.session.commit()
    return jsonify({"deleted": True, "id": column_id}), 200


@app.route("/irc/irc7/group/<path:group_name>", methods=["PUT"])
def rename_irc7_group(group_name):
    """Renames every column currently sharing `group_name` -- there's no
    separate "group" row in the schema (see models.py), so a group's
    identity IS its name; renaming necessarily applies to all of its
    columns at once, however many separate "Add Columns" batches they
    originally came from.

    Expected JSON body: { "name": "New Group Name" }
    """
    data = request.get_json(silent=True) or {}
    new_name = (data.get("name") or "").strip()
    if not new_name:
        return jsonify({"error": "Name cannot be empty"}), 400

    columns = IRC7Column.query.filter_by(group_name=group_name).all()
    if not columns:
        return jsonify({"error": "Group not found"}), 404

    for col in columns:
        col.group_name = new_name
    db.session.commit()
    return jsonify({"groupName": new_name, "columnIds": [c.id for c in columns]}), 200


@app.route("/irc/irc7/group/<path:group_name>", methods=["DELETE"])
def delete_irc7_group(group_name):
    """Deletes every column sharing `group_name` (and, via cascade, every
    cell value stored under them) -- see rename_irc7_group's docstring
    for why this applies to the whole name, not just one batch."""
    columns = IRC7Column.query.filter_by(group_name=group_name).all()
    if not columns:
        return jsonify({"error": "Group not found"}), 404

    for col in columns:
        db.session.delete(col)
    db.session.commit()
    return jsonify({"deleted": True, "groupName": group_name}), 200


@app.route("/irc/irc7/cell", methods=["POST"])
def save_irc7_cell():
    """Expected JSON body:
        { "rowId": 12, "columnId": 5, "year": 2026, "value": "1234" }

    Saving an empty string just clears the cell (stored as NULL) rather
    than being treated as an error -- irc7.js calls this on every cell's
    "change" event, including clearing one out."""
    data = request.get_json(silent=True) or {}
    row_id = data.get("rowId")
    column_id = data.get("columnId")
    year = data.get("year") or _current_year()
    value = data.get("value")

    if IRC7Row.query.get(row_id) is None:
        return jsonify({"error": "Row not found"}), 404
    if IRC7Column.query.get(column_id) is None:
        return jsonify({"error": "Column not found"}), 404

    if value == "":
        value = None

    cell = IRC7CellValue.query.filter_by(row_id=row_id, column_id=column_id, year=year).first()
    if cell is None:
        cell = IRC7CellValue(row_id=row_id, column_id=column_id, year=year)
        db.session.add(cell)
    cell.value = value
    db.session.commit()

    return jsonify({"rowId": row_id, "columnId": column_id, "year": year, "value": value}), 200


@app.route("/irc/irc7/reset", methods=["DELETE"])
def reset_irc7_data():
    """Two reset scopes for the "Reset" button/modal, chosen via
    ?scope=values|all (defaults to "values"):

      - scope=values (default): wipes every IRC7CellValue for a given
        year (defaults to current year) -- the "Clear entered values
        only" option. Same as before: IRC7Row (fixed schools) and
        IRC7Column (columns/groups, with their names and types) are left
        completely untouched, so the table's shape survives.

      - scope=all: the "Reset entire table" option. Deletes every
        IRC7Column outright, which cascades to delete all of its cell
        values too (see the FK relationship in models.py) -- across
        every year, not just the one passed in, since a deleted column
        no longer exists for any year. IRC7Row (fixed schools) is still
        never touched; only user-added columns/groups and their data.
    """
    scope = request.args.get("scope", "values")
    year = request.args.get("year", type=int) or _current_year()

    if scope == "all":
        IRC7Column.query.delete()
        db.session.commit()
        return jsonify({"reset": True, "scope": "all"}), 200

    IRC7CellValue.query.filter_by(year=year).delete()
    db.session.commit()
    return jsonify({"reset": True, "scope": "values", "year": year}), 200


# ---------------------------------------------------------------------------
# IRC8b -- Core Behavioral Competencies and Core Skills
#
# The sections/subsections/criteria are a fixed list hardcoded in irc8b.js
# (DATA) -- only the 1-5 ratings themselves are persisted here, keyed by
# which criterion they belong to (see models.py's IRC8BRating).
# ---------------------------------------------------------------------------
@app.route("/irc/irc8b/data", methods=["GET"])
def get_irc8b_data():
    year = request.args.get("year", type=int) or _current_year()
    rows = IRC8BRating.query.filter_by(year=year).all()

    ratings = {}
    for row in rows:
        ratings.setdefault(row.subsection_key, {})[str(row.criterion_index)] = row.rating

    return jsonify({"year": year, "ratings": ratings}), 200


@app.route("/irc/irc8b/rating", methods=["POST"])
def save_irc8b_rating():
    """Expected JSON body:
        { "year": 2026, "sectionKey": "cbc", "subsectionKey": "self_management",
          "criterionIndex": 0, "rating": 4 }

    'rating' may be null/omitted to clear a previously-set rating --
    irc8b.js does this when the user clicks an already-selected button.
    """
    data = request.get_json(silent=True) or {}
    year = data.get("year") or _current_year()
    section_key = data.get("sectionKey")
    subsection_key = data.get("subsectionKey")
    criterion_index = data.get("criterionIndex")
    rating = data.get("rating")

    if section_key not in (IRC8B_SECTION_CBC, IRC8B_SECTION_CS):
        return jsonify({"error": f"Invalid sectionKey: {section_key!r}"}), 400
    if not subsection_key or criterion_index is None:
        return jsonify({"error": "'subsectionKey' and 'criterionIndex' are required"}), 400
    if rating is not None and rating not in (1, 2, 3, 4, 5):
        return jsonify({"error": f"Invalid rating: {rating!r}"}), 400

    row = IRC8BRating.query.filter_by(
        year=year, subsection_key=subsection_key, criterion_index=criterion_index
    ).first()
    if row is None:
        row = IRC8BRating(year=year, subsection_key=subsection_key, criterion_index=criterion_index)
        db.session.add(row)
    row.section_key = section_key
    row.rating = rating
    db.session.commit()

    return jsonify({
        "year": year,
        "sectionKey": section_key,
        "subsectionKey": subsection_key,
        "criterionIndex": criterion_index,
        "rating": rating,
    }), 200


# ---------------------------------------------------------------------------
# IRC8a -- Individual Performance Commitment and Review Form (IPCRF)
#
# No PDF pipeline here (per irc5/irc6/irc7/irc8b) -- these routes just
# persist whatever the KRA / Objective / rubric-indicator modals in
# irc8a.js submits. See the IRC8A* section of models.py for the full
# rationale behind the KRA -> Objective -> Indicator shape.
# ---------------------------------------------------------------------------
def _validate_weight(raw):
    """Returns (weight_or_None, error_message_or_None). Mirrors irc8a.js's
    own "Weight must be a number between 0 and 100" client-side check."""
    if raw in (None, ""):
        return None, None
    try:
        weight = float(raw)
    except (TypeError, ValueError):
        return None, "Weight must be a number between 0 and 100."
    if weight < 0 or weight > 100:
        return None, "Weight must be a number between 0 and 100."
    return weight, None


@app.route("/irc/irc8a/data", methods=["GET"])
def get_irc8a_data():
    year = request.args.get("year", type=int) or _current_year()
    kras = (
        IRC8AKra.query.filter_by(year=year)
        .order_by(IRC8AKra.sort_order.asc(), IRC8AKra.id.asc())
        .all()
    )
    return jsonify({"year": year, "kras": [k.to_dict() for k in kras]}), 200


@app.route("/irc/irc8a/kra", methods=["POST"])
def save_irc8a_kra():
    """Creates a new KRA (id omitted), or updates an existing one's text/
    weight (id included) -- a KRA's `year` is fixed at creation and never
    changes here, same treatment as IRC6's `kind`.

    Expected JSON body:
        { "id": 3, "year": 2026, "text": "...", "weight": 25 }
    """
    data = request.get_json(silent=True) or {}
    kra_id = data.get("id")
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Please describe the KRA."}), 400

    weight, err = _validate_weight(data.get("weight"))
    if err:
        return jsonify({"error": err}), 400

    if kra_id:
        kra = IRC8AKra.query.get(kra_id)
        if kra is None:
            return jsonify({"error": "KRA not found"}), 404
    else:
        year = data.get("year") or _current_year()
        max_order = db.session.query(db.func.max(IRC8AKra.sort_order)).filter_by(year=year).scalar() or 0
        kra = IRC8AKra(year=year, sort_order=max_order + 1)
        db.session.add(kra)

    kra.text = text
    kra.weight = weight
    db.session.commit()
    return jsonify(kra.to_dict()), 200


@app.route("/irc/irc8a/kra/<int:kra_id>", methods=["DELETE"])
def delete_irc8a_kra(kra_id):
    kra = IRC8AKra.query.get(kra_id)
    if kra is None:
        return jsonify({"error": "KRA not found"}), 404
    db.session.delete(kra)  # cascades to its objectives and their indicators
    db.session.commit()
    return jsonify({"deleted": True, "id": kra_id}), 200


@app.route("/irc/irc8a/objective", methods=["POST"])
def save_irc8a_objective():
    """Creates a new Objective under `kraId` (id omitted), or updates an
    existing one's text/weight (id included).

    Expected JSON body:
        { "id": 9, "kraId": 3, "text": "...", "weight": 40 }
    """
    data = request.get_json(silent=True) or {}
    obj_id = data.get("id")
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Please describe the objective."}), 400

    weight, err = _validate_weight(data.get("weight"))
    if err:
        return jsonify({"error": err}), 400

    if obj_id:
        objective = IRC8AObjective.query.get(obj_id)
        if objective is None:
            return jsonify({"error": "Objective not found"}), 404
    else:
        kra_id = data.get("kraId")
        kra = IRC8AKra.query.get(kra_id) if kra_id else None
        if kra is None:
            return jsonify({"error": "KRA not found"}), 404
        max_order = (
            db.session.query(db.func.max(IRC8AObjective.sort_order))
            .filter_by(kra_id=kra.id).scalar() or 0
        )
        objective = IRC8AObjective(kra_id=kra.id, sort_order=max_order + 1)
        db.session.add(objective)

    objective.text = text
    objective.weight = weight
    db.session.commit()
    return jsonify(objective.to_dict()), 200


@app.route("/irc/irc8a/objective/<int:obj_id>", methods=["DELETE"])
def delete_irc8a_objective(obj_id):
    objective = IRC8AObjective.query.get(obj_id)
    if objective is None:
        return jsonify({"error": "Objective not found"}), 404
    db.session.delete(objective)  # cascades to its rubric indicators
    db.session.commit()
    return jsonify({"deleted": True, "id": obj_id}), 200


@app.route("/irc/irc8a/objective/<int:obj_id>/mov", methods=["POST"])
def save_irc8a_objective_mov(obj_id):
    """Expected JSON body: { "url": "https://..." }
    An empty/omitted url clears the MOV link, matching irc8a.js's
    delete-mov action."""
    objective = IRC8AObjective.query.get(obj_id)
    if objective is None:
        return jsonify({"error": "Objective not found"}), 404

    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    objective.mov = url or None
    db.session.commit()
    return jsonify(objective.to_dict()), 200


@app.route("/irc/irc8a/objective/<int:obj_id>/actual-results", methods=["POST"])
def save_irc8a_objective_actual_results(obj_id):
    """Expected JSON body: { "text": "..." }"""
    objective = IRC8AObjective.query.get(obj_id)
    if objective is None:
        return jsonify({"error": "Objective not found"}), 404

    data = request.get_json(silent=True) or {}
    objective.actual_results = (data.get("text") or "").strip() or None
    db.session.commit()
    return jsonify(objective.to_dict()), 200


@app.route("/irc/irc8a/objective/<int:obj_id>/timeline", methods=["POST"])
def save_irc8a_objective_timeline(obj_id):
    """Expected JSON body: { "text": "..." }"""
    objective = IRC8AObjective.query.get(obj_id)
    if objective is None:
        return jsonify({"error": "Objective not found"}), 404

    data = request.get_json(silent=True) or {}
    objective.timeline = (data.get("text") or "").strip() or None
    db.session.commit()
    return jsonify(objective.to_dict()), 200


@app.route("/irc/irc8a/objective/<int:obj_id>/rating", methods=["POST"])
def save_irc8a_objective_rating(obj_id):
    """Sets (or clears) one category's selected rating on an objective --
    fired both by clicking a rubric indicator (select-indicator) and by
    picking a value directly from that category's dropdown.

    Expected JSON body: { "category": "quality", "rating": 4 }
    'rating' may be null/omitted to clear it."""
    objective = IRC8AObjective.query.get(obj_id)
    if objective is None:
        return jsonify({"error": "Objective not found"}), 404

    data = request.get_json(silent=True) or {}
    category = data.get("category")
    rating = data.get("rating")

    if category not in IRC8A_CATEGORIES:
        return jsonify({"error": f"Invalid category: {category!r}"}), 400
    if rating is not None and rating not in (1, 2, 3, 4, 5):
        return jsonify({"error": f"Invalid rating: {rating!r}"}), 400

    objective.set_rating(category, rating)
    db.session.commit()
    return jsonify(objective.to_dict()), 200


@app.route("/irc/irc8a/indicator", methods=["POST"])
def save_irc8a_indicator():
    """Creates a new rubric indicator under `objectiveId` (id omitted), or
    updates an existing one's rate/label (id included). A category is
    fixed at creation and never changes here -- irc8a.js's edit-rubric
    modal only ever lets you change the rate/description within the
    category you opened it from.

    Expected JSON body:
        { "id": 5, "objectiveId": 9, "category": "quality", "rate": 3, "label": "..." }

    Rejects a rate already used by another indicator in the same
    (objective, category) -- matching populateRateOptions's "already
    used" filtering on the frontend, enforced here at the DB level too.
    """
    data = request.get_json(silent=True) or {}
    indicator_id = data.get("id")
    label = (data.get("label") or "").strip()
    rate = data.get("rate")

    if not label:
        return jsonify({"error": "Please describe what earns this rating level."}), 400
    if rate not in (1, 2, 3, 4, 5):
        return jsonify({"error": "Please select a rating level."}), 400

    if indicator_id:
        indicator = IRC8AIndicator.query.get(indicator_id)
        if indicator is None:
            return jsonify({"error": "Indicator not found"}), 404
        objective_id = indicator.objective_id
        category = indicator.category  # fixed at creation
    else:
        indicator = None
        objective_id = data.get("objectiveId")
        category = data.get("category")
        if category not in IRC8A_CATEGORIES:
            return jsonify({"error": f"Invalid category: {category!r}"}), 400
        objective = IRC8AObjective.query.get(objective_id) if objective_id else None
        if objective is None:
            return jsonify({"error": "Objective not found"}), 404
        if len(objective.indicators_for(category)) >= 5:
            return jsonify({"error": "At most 5 indicators are allowed per category."}), 400

    # Dupe check runs before the new row is added to the session (and
    # before any field is set on an existing one), so autoflush never
    # tries to insert/update a half-filled row while this query runs.
    dupe_query = IRC8AIndicator.query.filter_by(
        objective_id=objective_id, category=category, rate=rate
    )
    if indicator_id:
        dupe_query = dupe_query.filter(IRC8AIndicator.id != indicator_id)
    if dupe_query.first() is not None:
        return jsonify({"error": f"Rating level {rate} is already used for this category."}), 400

    if indicator is None:
        indicator = IRC8AIndicator(objective_id=objective_id, category=category)
        db.session.add(indicator)

    indicator.rate = rate
    indicator.label = label
    db.session.commit()
    return jsonify(indicator.to_dict()), 200


@app.route("/irc/irc8a/indicator/<int:indicator_id>", methods=["DELETE"])
def delete_irc8a_indicator(indicator_id):
    indicator = IRC8AIndicator.query.get(indicator_id)
    if indicator is None:
        return jsonify({"error": "Indicator not found"}), 404
    db.session.delete(indicator)
    db.session.commit()
    return jsonify({"deleted": True, "id": indicator_id}), 200


@app.route("/irc/irc8a/reset", methods=["DELETE"])
def reset_irc8a_data():
    """Two reset scopes for the "Reset All Data" button/modal, chosen via
    ?scope=ratings_mov|all (defaults to "ratings_mov") -- mirrors IRC7's
    values/all reset split. irc8a.js reads the returned "scope" back to
    decide whether to clear ratings in place or drop every KRA client-side.

      - scope=ratings_mov (default): clears every objective's three
        ratings (quality/efficiency/timeliness) and its MOV link for the
        given year -- the "Clear ratings & MOV links only" option. KRAs,
        objectives, weights, rubric indicators, timeline, and actual
        results are left completely untouched.

      - scope=all: the "Reset entire form" option. Deletes every KRA for
        the given year outright, which cascades to delete its objectives
        and their rubric indicators too (same FK cascade delete_irc8a_kra
        relies on for a single KRA).
    """
    scope = request.args.get("scope", "ratings_mov")
    year = request.args.get("year", type=int) or _current_year()

    if scope == "all":
        IRC8AKra.query.filter_by(year=year).delete()
        db.session.commit()
        return jsonify({"reset": True, "scope": "all", "year": year}), 200

    objectives = (
        IRC8AObjective.query.join(IRC8AKra, IRC8AObjective.kra_id == IRC8AKra.id)
        .filter(IRC8AKra.year == year)
        .all()
    )
    for objective in objectives:
        for category in IRC8A_CATEGORIES:
            objective.set_rating(category, None)
        objective.mov = None
    db.session.commit()
    return jsonify({"reset": True, "scope": "ratings_mov", "year": year}), 200


# ---------------------------------------------------------------------------
# IRC8c -- Summary of Ratings for Discussion
#
# Just two routes: one to read the (always-exactly-four) Development Plan
# rows plus the live Final Rating, one to patch a single row. There's no
# create/delete here -- see models.py's IRC8CRow docstring for why the four
# rows are permanent slots rather than a user-managed list, and why
# "top 5" ranking/label resolution is left to irc8c.js instead of computed
# here (short version: IRC8b's subsection titles and per-subsection
# criteria only exist in irc8b.js, so IRC8c's route can't resolve an
# irc8b_* ref into a label without duplicating that list here too).
# ---------------------------------------------------------------------------
@app.route("/irc/irc8c/data", methods=["GET"])
def get_irc8c_data():
    year = request.args.get("year", type=int) or _current_year()

    existing = {r.slot: r for r in IRC8CRow.query.filter_by(year=year).all()}
    added = False
    for slot in IRC8C_SLOTS:
        if slot not in existing:
            row = IRC8CRow(year=year, slot=slot, is_locked=True)
            db.session.add(row)
            existing[slot] = row
            added = True
    if added:
        db.session.commit()

    rows = [existing[slot].to_dict() for slot in IRC8C_SLOTS]

    # Final Performance Results Rating = sum of every objective's Score
    # (Average x Weight) for the year -- the same arithmetic irc8a.js's
    # summary footer uses, just computed here via IRC8AObjective.score()
    # so IRC8c never has to re-derive it (or store a stale copy).
    objectives = (
        IRC8AObjective.query.join(IRC8AKra, IRC8AObjective.kra_id == IRC8AKra.id)
        .filter(IRC8AKra.year == year)
        .all()
    )
    scores = [s for s in (o.score() for o in objectives) if s is not None]
    final_rating = sum(scores) if scores else None

    return jsonify({"year": year, "finalRating": final_rating, "rows": rows}), 200


@app.route("/irc/irc8c/row", methods=["POST"])
def save_irc8c_row():
    """Partial update of one fixed Development Plan row. Every field is
    optional -- only keys present in the body are changed, so the dropdown
    picks, the text cells, and the lock toggle can each be saved
    independently without clobbering the others.

    Expected JSON body (all fields but 'slot' optional):
        {
          "year": 2026, "slot": "irc8a_1",
          "strengthRef": "17", "devNeedsRef": "42",
          "actionPlan": "...", "timeline": "...", "resourcesNeeded": "...",
          "isLocked": true
        }
    """
    data = request.get_json(silent=True) or {}
    year = data.get("year") or _current_year()
    slot = data.get("slot")

    if slot not in IRC8C_SLOTS:
        return jsonify({"error": f"Invalid slot: {slot!r}"}), 400

    row = IRC8CRow.query.filter_by(year=year, slot=slot).first()
    if row is None:
        row = IRC8CRow(year=year, slot=slot, is_locked=True)
        db.session.add(row)

    if "strengthRef" in data:
        row.strength_ref = str(data["strengthRef"]) if data["strengthRef"] not in (None, "") else None
    if "devNeedsRef" in data:
        row.dev_needs_ref = str(data["devNeedsRef"]) if data["devNeedsRef"] not in (None, "") else None
    if "actionPlan" in data:
        row.action_plan = (data.get("actionPlan") or "").strip() or None
    if "timeline" in data:
        row.timeline = (data.get("timeline") or "").strip() or None
    if "resourcesNeeded" in data:
        row.resources_needed = (data.get("resourcesNeeded") or "").strip() or None
    if "isLocked" in data:
        row.is_locked = bool(data["isLocked"])

    db.session.commit()
    return jsonify(row.to_dict()), 200


@app.route("/irc/irc8c/reset", methods=["DELETE"])
def reset_irc8c_data():
    """Clears every Development Plan row for the given year back to blank
    and locked. The four rows themselves are fixed slots (see IRC8C_SLOTS
    / IRC8CRow) so they're never deleted here, only their editable fields
    -- same "clear in place, don't delete the row" treatment IRC6 gives
    its own permanent Goal/Outcome rows. irc8c.js just re-fetches
    everything via loadAll() afterward, so no scope/body is needed in the
    response beyond a success flag."""
    year = request.args.get("year", type=int) or _current_year()

    rows = IRC8CRow.query.filter_by(year=year).all()
    for row in rows:
        row.strength_ref = None
        row.dev_needs_ref = None
        row.action_plan = None
        row.timeline = None
        row.resources_needed = None
        row.is_locked = True

    db.session.commit()
    return jsonify({"reset": True, "year": year}), 200


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
        storage.seed_irc7_rows()
    app.run(debug=True)