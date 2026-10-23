(function () {
  const listEl = document.getElementById("irc8d-kra-list");
  if (!listEl) return;

  const emptyStateEl = document.getElementById("irc8d-empty-state");
  const weightWarningEl = document.getElementById("irc8d-weight-warning");
  const weightWarningTextEl = document.getElementById(
    "irc8d-weight-warning-text",
  );
  const summaryEl = document.getElementById("irc8d-summary");
  const summaryRatingEl = document.getElementById("irc8d-summary-rating");
  const summaryAdjectivalEl = document.getElementById(
    "irc8d-summary-adjectival",
  );

  // Same 4-hue cycle as irc8a.js's kraPaletteClass, kept in sync by
  // position (not id) so this page's tinting always matches IRC8a's.
  const KRA_PALETTE_SIZE = 4;
  function kraPaletteClass(kraIndex) {
    return "irc8d-kra-palette-" + ((kraIndex % KRA_PALETTE_SIZE) + 1);
  }

  // DepEd RPMS/IPCRF numerical-to-adjectival rating scale (5-point).
  // Adjust the thresholds here if your office uses a different scale --
  // nothing else in this file depends on the exact cutoffs.
  const ADJECTIVAL_BANDS = [
    { min: 4.5, label: "Outstanding", abbr: "O", cls: "outstanding" },
    {
      min: 3.5,
      label: "Very Satisfactory",
      abbr: "VS",
      cls: "very-satisfactory",
    },
    { min: 2.5, label: "Satisfactory", abbr: "S", cls: "satisfactory" },
    { min: 1.5, label: "Unsatisfactory", abbr: "U", cls: "unsatisfactory" },
    { min: -Infinity, label: "Poor", abbr: "P", cls: "poor" },
  ];

  function adjectivalRating(score) {
    return ADJECTIVAL_BANDS.find((band) => score >= band.min);
  }

  // ================= API helper =================
  async function apiCall(method, url) {
    let res;
    try {
      res = await fetch(url, { method });
    } catch (e) {
      throw new Error(
        "Network error — please check your connection and try again.",
      );
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // no/invalid JSON body — fall through with data = null
    }
    if (!res.ok) {
      throw new Error(
        (data && data.error) || "Something went wrong. Please try again.",
      );
    }
    return data;
  }

  // ================= Helpers =================
  function fmtWeight(w) {
    if (w === null || w === undefined || w === "" || isNaN(w)) return "—";
    const n = Number(w);
    return (Math.round(n * 100) / 100).toString() + "%";
  }

  function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function fmtRate(n) {
    return n === null || n === undefined || n === "" ? "—" : String(n);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  function textOrMuted(str, placeholder) {
    const val = (str || "").trim();
    return val
      ? escapeHtml(val)
      : `<span class="irc8d-muted">${placeholder}</span>`;
  }

  function sumWeights(list) {
    return list.reduce((sum, item) => {
      const w = parseFloat(item.weight);
      return sum + (isNaN(w) ? 0 : w);
    }, 0);
  }

  // Last rendered result, read by the print layout below.
  const printState = { kras: [], overall: null, band: null };

  // ================= Render =================
  function renderKraCard(kra, kraIndex) {
    const card = document.createElement("div");
    card.className = "irc8d-kra-card " + kraPaletteClass(kraIndex);

    const objectives = kra.objectives || [];

    let rowsHtml = "";
    if (objectives.length === 0) {
      rowsHtml = "";
    } else {
      rowsHtml = objectives
        .map(
          (obj) => `
        <tr>
          <td class="irc8d-obj-text">${textOrMuted(obj.text, "Untitled objective")}</td>
          <td class="irc8d-timeline-cell">${textOrMuted(obj.timeline, "No timeline set")}</td>
          <td class="irc8d-actual-cell">${textOrMuted(obj.actualResults, "No actual results recorded yet")}</td>
          <td class="irc8d-rate-cell">${fmtRate(obj.ratings.quality)}</td>
          <td class="irc8d-rate-cell">${fmtRate(obj.ratings.efficiency)}</td>
          <td class="irc8d-rate-cell">${fmtRate(obj.ratings.timeliness)}</td>
          <td class="irc8d-avg-cell">${fmtNum(obj.average)}</td>
          <td class="irc8d-score-cell">${fmtNum(obj.score)}</td>
        </tr>
      `,
        )
        .join("");
    }

    card.innerHTML = `
      <div class="irc8d-kra-card-header">
        <span class="irc8d-kra-card-title">${(kra.text || "").trim() ? escapeHtml(kra.text) : '<span class="irc8d-muted--on-dark">Untitled KRA</span>'}</span>
        <span class="irc8d-kra-card-weight">Weight ${fmtWeight(kra.weight)}</span>
      </div>
      ${
        objectives.length === 0
          ? '<p class="irc8d-no-objectives">No objectives yet for this KRA — add one on the IRC8a tab.</p>'
          : `
        <table class="irc8d-obj-table">
          <colgroup>
            <col class="irc8d-col-objective">
            <col class="irc8d-col-timeline">
            <col class="irc8d-col-actual">
            <col class="irc8d-col-rate">
            <col class="irc8d-col-rate">
            <col class="irc8d-col-rate">
            <col class="irc8d-col-avg">
            <col class="irc8d-col-score">
          </colgroup>
          <thead>
            <tr>
              <th>Objective</th>
              <th>Timeline</th>
              <th>Actual results</th>
              <th class="irc8d-col-rate">Q</th>
              <th class="irc8d-col-rate">E</th>
              <th class="irc8d-col-rate">T</th>
              <th class="irc8d-col-avg">Avg</th>
              <th class="irc8d-col-score">Score</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `
      }
    `;

    return card;
  }

  function updateWeightWarning(totalKraWeight) {
    const ok = Math.abs(totalKraWeight - 100) < 0.005;
    if (ok) {
      weightWarningEl.style.display = "none";
      return;
    }
    weightWarningEl.style.display = "flex";
    weightWarningTextEl.textContent = `Total KRA weight is ${fmtWeight(totalKraWeight)} — it should total 100%. Adjust KRA weights on the IRC8a tab.`;
  }

  function render(kras) {
    listEl.innerHTML = "";
    printState.kras = kras;
    printState.overall = null;
    printState.band = null;

    const hasKras = kras.length > 0;
    listEl.style.display = hasKras ? "flex" : "none";
    emptyStateEl.style.display = hasKras ? "none" : "block";

    if (!hasKras) {
      weightWarningEl.style.display = "none";
      summaryEl.style.display = "none";
      return;
    }

    kras.forEach((kra, kraIndex) => {
      listEl.appendChild(renderKraCard(kra, kraIndex));
    });

    updateWeightWarning(sumWeights(kras));

    let allObjectives = [];
    kras.forEach(
      (k) => (allObjectives = allObjectives.concat(k.objectives || [])),
    );

    let scoreSum = 0;
    let hasAnyScore = false;
    allObjectives.forEach((o) => {
      if (o.score !== null && o.score !== undefined) {
        scoreSum += o.score;
        hasAnyScore = true;
      }
    });

    summaryEl.style.display = "block";
    if (hasAnyScore) {
      summaryRatingEl.textContent = fmtNum(scoreSum);
      const band = adjectivalRating(scoreSum);
      printState.overall = scoreSum;
      printState.band = band;
      summaryAdjectivalEl.textContent = band.label;
      summaryAdjectivalEl.className =
        "irc8d-summary-adjectival irc8d-summary-adjectival--" + band.cls;
    } else {
      summaryRatingEl.textContent = "—";
      summaryAdjectivalEl.textContent = "";
      summaryAdjectivalEl.className = "irc8d-summary-adjectival";
    }
  }

  // ================= Print / Save as PDF =================
  // Builds a print-only copy of the page laid out like the IRC8D sheet
  // (single bordered table, overall rating rows, Rater-Ratee Agreement),
  // then calls window.print(). All print styling lives at the bottom of
  // irc8d.css. The root is moved to <body> so the print rules can hide
  // the rest of the page; they only apply while <html> has the
  // "irc8d-printing" class, which is added just for the print.

  // --- Fixed text taken from the printed form -- edit here if needed ---
  const PRINT_MFO = "Basic Education Sector";
  // Same hardcoded "Checked by" signatory as base.html's report footer.
  const PRINT_SUPERIOR_NAME = "DR. JONATHAN P. DOMINGO";
  const PRINT_SUPERIOR_POSITION = "SGOD Chief";
  const PRINT_AGREEMENT_TEXT =
    "The signatures below confirm that the employee and his/her superior have agreed on content of this appraisal form and the performance rating.";

  const printRoot = document.getElementById("irc8d-print-root");
  const printBtn = document.getElementById("irc8d-print-btn");
  const printCache = { preparer: {}, dates: {} };
  // Signatory dates are stored per tab (see /api/signatory-date/<tab>/<role>).
  const TAB_ID = document.body.dataset.activeTab || "irc8d";

  // "Prepared by" is filled live into base.html's footer by index.js, so
  // read it from there first and fall back to /api/preparer.
  const footerText = (id) => {
    const el = document.getElementById(id);
    return el ? el.textContent.replace(/\u00a0/g, " ").trim() : "";
  };

  if (printRoot) document.body.appendChild(printRoot);

  const pFixed = (n, d) =>
    n === null || n === undefined || n === "" || isNaN(n)
      ? ""
      : Number(n).toFixed(d);

  const pUpper = (v) => escapeHtml(v == null ? "" : String(v).toUpperCase());

  const pDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return isNaN(d)
      ? iso
      : d.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
  };

  // Q / E / T cell: blank ratings are shaded gray, as on the form.
  function pRateCell(v) {
    const blank = v === null || v === undefined || v === "";
    return blank
      ? '<td class="p8-c p8-gray"></td>'
      : `<td class="p8-c">${escapeHtml(String(v))}</td>`;
  }

  function buildPrintTable() {
    const kras = printState.kras || [];
    const totalRows = kras.reduce(
      (n, k) => n + Math.max(1, (k.objectives || []).length),
      0,
    );

    let body = "";
    let firstRow = true;

    kras.forEach((kra) => {
      const objs = kra.objectives || [];
      const span = Math.max(1, objs.length);
      const list = objs.length ? objs : [null];

      list.forEach((o, i) => {
        const r = (o && o.ratings) || {};
        let tr = "";

        if (firstRow) {
          tr += `<td class="p8-mfo" rowspan="${totalRows}">${escapeHtml(PRINT_MFO)}</td>`;
          firstRow = false;
        }
        if (i === 0) {
          tr += `<td class="p8-kra" rowspan="${span}">${pUpper(kra.text)}</td>`;
        }
        tr += `<td class="p8-obj">${o ? escapeHtml(o.text) : ""}</td>`;
        tr += `<td class="p8-c p8-pre">${o ? escapeHtml(o.timeline) : ""}</td>`;
        if (i === 0) {
          const w = fmtWeight(kra.weight);
          tr += `<td class="p8-c" rowspan="${span}">${w === "—" ? "" : w}</td>`;
        }
        tr += `<td class="p8-c p8-pre">${o ? escapeHtml(o.actualResults) : ""}</td>`;
        tr += pRateCell(r.quality);
        tr += pRateCell(r.efficiency);
        tr += pRateCell(r.timeliness);
        tr += `<td class="p8-c p8-b">${o ? pFixed(o.average, 1) : ""}</td>`;
        tr += `<td class="p8-c p8-b p8-score">${o ? pFixed(o.score, 3) : ""}</td>`;

        body += `<tr>${tr}</tr>`;
      });
    });

    const overall = printState.overall;
    const band = printState.band;

    const footer = `
      <tr class="p8-total">
        <td colspan="5" rowspan="2" class="p8-gray p8-nob"></td>
        <td colspan="5" class="p8-b p8-l">OVERALL RATING FOR ACCOMPLISHMENTS</td>
        <td class="p8-c p8-b p8-score">${overall == null ? "" : pFixed(overall, 3)}</td>
      </tr>
      <tr class="p8-total">
        <td colspan="5" class="p8-b p8-l">ADJECTIVAL RATING</td>
        <td class="p8-c p8-b p8-score">${band ? escapeHtml(band.abbr) : ""}</td>
      </tr>`;

    return `<table class="p8-table">
      <colgroup>
        <col style="width:8%"><col style="width:11%"><col style="width:26%"><col style="width:5%"><col style="width:5%"><col style="width:25%"><col style="width:3%"><col style="width:3%"><col style="width:3%"><col style="width:4.5%"><col style="width:6.5%">
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2">MFOs</th><th rowspan="2">KRAs</th><th rowspan="2">OBJECTIVES</th><th rowspan="2">TIME<br>LINE</th><th rowspan="2">Weight<br>per KRA</th><th rowspan="2">ACTUAL RESULTS</th><th colspan="4">RATING</th><th rowspan="2">Score</th>
        </tr>
        <tr><th>Q</th><th>E</th><th>T</th><th>Ave</th></tr>
      </thead>
      <tbody>${body}${footer}</tbody>
    </table>`;
  }

  function buildPrintHtml() {
    const employee =
      footerText("reportPreparedByName") || printCache.preparer.name || "";
    const employeePos =
      footerText("reportPreparedByPosition") ||
      printCache.preparer.position ||
      "";

    const cell = (label, name, pos, sigLabel) => `
      <td class="p8-sig-cell">
        <div class="p8-sig-label">${label}</div>
        <div class="p8-sig-name">${pUpper(name)}</div>
        <div class="p8-sig-pos">${pUpper(pos)}</div>
      </td>`;

    return `
      <div class="p8-title">PART III: SUMMARY OF RATINGS FOR DISCUSSION</div>
      ${buildPrintTable()}
      <div class="p8-agree">
        <div class="p8-agree-title">Rater-Ratee Agreement</div>
        <div class="p8-agree-text">${escapeHtml(PRINT_AGREEMENT_TEXT)}</div>
      </div>
      <table class="p8-sig">
        <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
        <tr>${cell("Name of Employee:", employee, employeePos)}${cell("Name of Superior:", PRINT_SUPERIOR_NAME, PRINT_SUPERIOR_POSITION)}</tr>
        <tr><td class="p8-sig-row">Signature:</td><td class="p8-sig-row">Signature:</td></tr>
        <tr><td class="p8-date-row">Date: ${escapeHtml(pDate(printCache.dates.prepared_by))}</td><td class="p8-date-row">Date: ${escapeHtml(pDate(printCache.dates.checked_by))}</td></tr>
      </table>`;
  }

  function refreshPrintRoot() {
    if (printRoot) printRoot.innerHTML = buildPrintHtml();
  }

  async function loadPrintExtras() {
    const [p, d1, d2] = await Promise.allSettled([
      apiCall("GET", "/api/preparer"),
      apiCall("GET", `/api/signatory-date/${TAB_ID}/prepared_by`),
      apiCall("GET", `/api/signatory-date/${TAB_ID}/checked_by`),
    ]);
    if (p.status === "fulfilled") printCache.preparer = p.value || {};
    printCache.dates = {
      prepared_by: d1.status === "fulfilled" && d1.value ? d1.value.date : null,
      checked_by: d2.status === "fulfilled" && d2.value ? d2.value.date : null,
    };
  }

  if (printBtn && printRoot) {
    const root = document.documentElement;

    printBtn.addEventListener("click", async () => {
      printBtn.disabled = true;
      try {
        await loadPrintExtras();
        refreshPrintRoot();
        window.print();
      } finally {
        printBtn.disabled = false;
      }
    });

    // Ctrl+P / browser-menu print gets the same layout from cached data.
    window.addEventListener("beforeprint", () => {
      refreshPrintRoot();
      root.classList.add("irc8d-printing");
    });
    window.addEventListener("afterprint", () => {
      root.classList.remove("irc8d-printing");
    });
  }

  // ================= Initial load =================
  // Deliberately hits IRC8a's own data endpoint rather than a separate
  // IRC8d one -- there's nothing IRC8d-specific to store, it's a pure
  // read-only view of whatever's currently on IRC8a. Same approach IRC8c
  // already takes for its "Strength/Development Need" source data.
  async function init() {
    try {
      const data = await apiCall("GET", "/irc/irc8a/data");
      render(data.kras || []);
    } catch (err) {
      listEl.style.display = "none";
      emptyStateEl.style.display = "none";
      weightWarningEl.style.display = "none";
      summaryEl.style.display = "none";
      const errBox = document.createElement("div");
      errBox.className = "irc8d-load-error";
      errBox.textContent = "Couldn't load this report: " + err.message;
      listEl.closest("section").insertBefore(errBox, listEl);
    }
  }

  init();
})();
