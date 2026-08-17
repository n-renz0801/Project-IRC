from datetime import datetime
from flask import Flask, render_template, abort, request, jsonify
import pdfplumber
import re

app = Flask(__name__)

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


def _normalize_irc9_text(text):
    """Collapses a cell's hard-wrapped PDF lines into a single flowing
    paragraph. Words that were hyphenated across a line wrap (e.g.
    "priority-\\nschool") are rejoined without an extra space; all other
    line breaks become single spaces."""
    text = re.sub(r"-\n", "-", text or "")
    return re.sub(r"\s+", " ", text).strip()


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
       to each column's x-range within that row's y-range and calling
       extract_text() — so multi-line paragraphs stay intact as single
       cells instead of being split into separate rows.
    3. A row whose Date cell is non-empty starts a new entry. A row
       whose Date cell is empty is a continuation of the current entry
       (this is how a single entry's paragraphs that span multiple
       pages are stitched back together, since continuation pages have
       no divider line in the Date column at all).

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
            # detected column count can vary row-to-row).
            field_texts = []
            for col_idx in range(4):
                cx0, cx1 = col_bounds[col_idx], col_bounds[col_idx + 1]
                try:
                    text = page.crop((cx0, row_top, cx1, row_bottom)).extract_text() or ""
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
                        current[key] = (current[key] + "\n" + val).strip() if current[key] else val

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


@app.route("/")
def home():
    """Landing page shown when the app first opens."""
    return render_template("home.html", tabs=TABS, groups=GROUPS, active_tab=None)


@app.route("/irc/<tab_id>")
def view_tab(tab_id):
    """Renders the dedicated template for whichever tab was requested."""
    active_tab = TAB_LOOKUP.get(tab_id)
    if active_tab is None:
        abort(404)
    return render_template(TEMPLATE_MAP[tab_id], tabs=TABS, active_tab=active_tab)


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
        
        return jsonify({
            "month": month_name,
            "month_key": month_key,
            "extracted_ratings": extracted_ratings
        }), 200
    
    except Exception as e:
        return jsonify({"error": f"Error processing PDF: {str(e)}"}), 500


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

        return jsonify({
            "month": month_name,
            "month_key": month_key,
            "customers": customers
        }), 200

    except Exception as e:
        return jsonify({"error": f"Error processing PDF: {str(e)}"}), 500


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

        return jsonify({
            "month": month_name,
            "month_key": month_key,
            "schools": schools,
        }), 200

    except Exception as e:
        return jsonify({"error": f"Error processing PDF: {str(e)}"}), 500


@app.route("/irc/irc9/extract", methods=["POST"])
def extract_irc9_pdf():
    """Extract PMCF entries (Date, Critical Incidence Description,
    Output, Impact on Job/Action Plan) from a DepEd PMCF PDF.

    See _extract_irc9_entries for how the table structure is parsed.
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
    app.run(debug=True)