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
]


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
        month_pattern = r"TECHNICAL ASSISTANCE FEEDBACK RESULTS\s*\(?([A-Za-z]+)\)?"
        month_match = re.search(month_pattern, full_text)
        
        if not month_match:
            return jsonify({"error": "Could not find month in PDF header"}), 400
        
        month_name = month_match.group(1).strip().lower()
        
        # Map month names to keys
        month_map = {
            'january': 'jan', 'february': 'feb', 'march': 'mar', 'april': 'apr',
            'may': 'may', 'june': 'jun', 'july': 'jul', 'august': 'aug',
            'september': 'sep', 'october': 'oct', 'november': 'nov', 'december': 'dec'
        }
        
        month_key = month_map.get(month_name)
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



def not_found(e):
    return render_template("404.html", tabs=TABS, active_tab=None), 404


if __name__ == "__main__":
    app.run(debug=True)