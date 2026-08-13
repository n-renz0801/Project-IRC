(function () {
  const SECTIONS = ["elementary", "secondary"];
  const MONTH_KEYS = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const MONTH_LABELS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const QUARTER_KEYS = ["Q1", "Q2", "Q3", "Q4"];

  // Shared plot geometry for the line charts — used both when placing
  // data points and when placing the matching x-axis labels beneath them.
  const CHART_PLOT_LEFT = 44;
  const CHART_PLOT_RIGHT = 740;
  const CHART_PLOT_TOP = 24;
  const CHART_PLOT_BOTTOM = 166;
  const CHART_X_LABEL_Y = 182;

  const tab = document.getElementById("irc2b-tab");
  if (!tab) return;

  // "quarters" = legacy logic (1 point per distinct quarter reached, max 4)
  // "months"   = current logic (1 point per checked month, max 12)
  // Global so both tables always show the same mode side by side.
  let totalDisplayMode = "quarters";

  // "monthly" = 12-point line chart, "quarterly" = 4-point line chart.
  // Global so both charts always show the same interval side by side.
  let chartDisplayMode = "monthly";

  function getTable(section) {
    return document.getElementById(`irc2b-table-${section}`);
  }

  function getRowCheckboxes(section, row) {
    const table = getTable(section);
    return Array.from(
      table.querySelectorAll(`input.irc2b-check[data-row="${row}"]`),
    );
  }

  function getAllRowIndices(section) {
    const table = getTable(section);
    const rows = table.querySelectorAll("tbody tr[data-row-index]");
    return Array.from(rows).map((r) => r.dataset.rowIndex);
  }

  // Computes both totals for a row and stashes them as data-attributes
  // on the badge so toggling later is just a re-read, not a re-scan.
  // Still returns the quarters Set — recalcFooter's grand-total logic
  // (schools reached in 2+ quarters) depends on it and is unchanged.
  function recalcRow(section, row) {
    const checkboxes = getRowCheckboxes(section, row);

    const quartersWithTA = new Set();
    let monthsChecked = 0;

    checkboxes.forEach((cb) => {
      if (cb.checked) {
        quartersWithTA.add(cb.dataset.quarter);
        monthsChecked += 1;
      }
    });

    const totalEl = getTable(section).querySelector(
      `.irc2b-row-total[data-row="${row}"]`,
    );
    if (totalEl) {
      totalEl.dataset.quartersTotal = quartersWithTA.size;
      totalEl.dataset.monthsTotal = monthsChecked;
    }

    return quartersWithTA;
  }

  // Footer row: "how many schools" per quarter, and "how many schools"
  // reached in 2+ quarters overall. Returns { count2Plus, totalSchools }
  // so the caller can roll this up into the page-level dashboard.
  // NOTE: unaffected by totalDisplayMode — always quarter-based.
  function recalcFooter(section) {
    const quarterCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    let schoolsWithTwoPlusQuarters = 0;

    const rowIndices = getAllRowIndices(section);

    rowIndices.forEach((row) => {
      const quartersWithTA = recalcRow(section, row);

      quartersWithTA.forEach((q) => {
        quarterCounts[q] += 1;
      });

      if (quartersWithTA.size >= 2) {
        schoolsWithTwoPlusQuarters += 1;
      }
    });

    const table = getTable(section);
    Object.keys(quarterCounts).forEach((q) => {
      const el = table.querySelector(
        `.irc2b-quarter-footer-total[data-quarter="${q}"]`,
      );
      if (el) el.textContent = quarterCounts[q].toLocaleString();
    });

    const grandEl = table.querySelector(".irc2b-footer-grand-total");
    if (grandEl) {
      grandEl.textContent = schoolsWithTwoPlusQuarters.toLocaleString();
    }

    return {
      count2Plus: schoolsWithTwoPlusQuarters,
      totalSchools: rowIndices.length,
    };
  }

  // Paints every row-total badge and both table headers according to
  // the currently active totalDisplayMode. Reads from the data-*
  // attributes set in recalcRow — no checkbox scanning here.
  function applyTotalDisplayMode() {
    const isMonths = totalDisplayMode === "months";

    SECTIONS.forEach((section) => {
      const table = getTable(section);
      if (!table) return;

      table.querySelectorAll(".irc2b-row-total").forEach((el) => {
        const value = isMonths
          ? el.dataset.monthsTotal
          : el.dataset.quartersTotal;
        el.textContent = Number(value || 0).toLocaleString();
      });

      const modeTextEl = table.querySelector(".irc2b-total-mode-text");
      if (modeTextEl) {
        modeTextEl.textContent = isMonths ? "Months" : "Quarters";
      }

      const headerEl = table.querySelector(".irc2b-total-col-clickable");
      if (headerEl) {
        headerEl.setAttribute(
          "title",
          isMonths
            ? "Showing total checked months (click to switch to quarters reached)"
            : "Showing distinct quarters reached (click to switch to total months)",
        );
      }
    });
  }

  function toggleTotalDisplayMode() {
    totalDisplayMode = totalDisplayMode === "quarters" ? "months" : "quarters";
    applyTotalDisplayMode();
  }

  // --- Dashboard: stat cards + side-by-side bar chart ---
  function updatePercentStat(section, count, total) {
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;

    const countEl = document.getElementById(`irc2b-${section}-count`);
    const percentEl = document.getElementById(`irc2b-${section}-percent`);
    const barEl = document.getElementById(`irc2b-${section}-bar`);
    const barValEl = document.getElementById(`irc2b-${section}-bar-val`);

    if (countEl) countEl.textContent = count.toLocaleString();
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (barEl) barEl.style.height = `${percent}%`;
    if (barValEl) barValEl.textContent = `${percent}%`;

    return percent;
  }

  // --- Per-table line chart: monthly or quarterly counts ---

  // Schools with TA checked in each of the 12 months.
  function getMonthlyCounts(section) {
    const table = getTable(section);
    return MONTH_KEYS.map(
      (key) =>
        table.querySelectorAll(`input.irc2b-check[data-month="${key}"]:checked`)
          .length,
    );
  }

  // Schools reached in each of the 4 quarters (any month within the
  // quarter checked counts once) — same "reached" definition used by
  // the footer's per-quarter totals, just recomputed here for the chart.
  function getQuarterlyCounts(section) {
    const table = getTable(section);
    return QUARTER_KEYS.map((q) => {
      const checked = table.querySelectorAll(
        `input.irc2b-check[data-quarter="${q}"]:checked`,
      );
      const rowsReached = new Set(
        Array.from(checked).map((cb) => cb.dataset.row),
      );
      return rowsReached.size;
    });
  }

  // Builds the path/area/points/value-label markup for the chart's
  // data <g> group. Works for any number of points (12 for monthly,
  // 4 for quarterly) since spacing is derived from values.length.
  function buildLineDataMarkup(section, values, maxValue) {
    const plotWidth = CHART_PLOT_RIGHT - CHART_PLOT_LEFT;
    const plotHeight = CHART_PLOT_BOTTOM - CHART_PLOT_TOP;
    const n = values.length;
    const step = n > 1 ? plotWidth / (n - 1) : 0;

    const points = values.map((val, i) => {
      const x = CHART_PLOT_LEFT + i * step;
      const ratio = maxValue > 0 ? val / maxValue : 0;
      const y = CHART_PLOT_BOTTOM - ratio * plotHeight;
      return { x, y, val };
    });

    const linePath = points
      .map(
        (p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`,
      )
      .join(" ");

    const areaPath =
      `M ${points[0].x.toFixed(1)},${CHART_PLOT_BOTTOM} ` +
      points.map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
      ` L ${points[n - 1].x.toFixed(1)},${CHART_PLOT_BOTTOM} Z`;

    const circles = points
      .map(
        (p) =>
          `<circle class="irc2b-linechart-point irc2b-linechart-point-${section}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4"></circle>`,
      )
      .join("");

    const labels = points
      .map(
        (p) =>
          `<text class="irc2b-linechart-point-val irc2b-linechart-point-val-${section}" x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}">${p.val}</text>`,
      )
      .join("");

    return (
      `<path class="irc2b-linechart-area-${section}" d="${areaPath}"></path>` +
      `<path class="irc2b-linechart-path irc2b-linechart-path-${section}" d="${linePath}"></path>` +
      circles +
      labels
    );
  }

  // Builds the x-axis label group to match whichever label set (months
  // or quarters) is active — same x spacing formula as the data points.
  function buildXAxisLabelMarkup(labels) {
    const plotWidth = CHART_PLOT_RIGHT - CHART_PLOT_LEFT;
    const n = labels.length;
    const step = n > 1 ? plotWidth / (n - 1) : 0;

    return labels
      .map((label, i) => {
        const x = CHART_PLOT_LEFT + i * step;
        return `<text class="irc2b-linechart-x-label" x="${x.toFixed(1)}" y="${CHART_X_LABEL_Y}">${label}</text>`;
      })
      .join("");
  }

  function updateLineChart(section) {
    const lineGroup = document.getElementById(`irc2b-${section}-line-group`);
    const xAxisGroup = document.getElementById(`irc2b-${section}-xaxis-group`);
    const captionEl = document.querySelector(
      `.irc2b-linechart-wrapper-${section} .irc2b-linechart-caption`,
    );
    if (!lineGroup || !xAxisGroup) return;

    const totalSchools = getAllRowIndices(section).length;
    const isQuarterly = chartDisplayMode === "quarterly";

    const values = isQuarterly
      ? getQuarterlyCounts(section)
      : getMonthlyCounts(section);
    const labels = isQuarterly ? QUARTER_KEYS : MONTH_LABELS;

    lineGroup.innerHTML = buildLineDataMarkup(section, values, totalSchools);
    xAxisGroup.innerHTML = buildXAxisLabelMarkup(labels);

    if (captionEl) {
      captionEl.textContent = isQuarterly
        ? "Schools reached with TA, per quarter"
        : "Schools provided with TA, per month";
    }
  }

  // Repaints the active/inactive state on every toggle button (both
  // charts share chartDisplayMode, so both sets of buttons stay in sync).
  function applyChartToggleButtons() {
    document.querySelectorAll(".irc2b-chart-toggle-btn").forEach((btn) => {
      const isActive = btn.dataset.chartMode === chartDisplayMode;
      btn.classList.toggle("irc2b-chart-toggle-btn-active", isActive);
    });
  }

  function setChartDisplayMode(mode) {
    if (mode !== "monthly" && mode !== "quarterly") return;
    chartDisplayMode = mode;
    applyChartToggleButtons();
    SECTIONS.forEach((section) => updateLineChart(section));
  }

  function updateDashboard() {
    const elementaryStats = recalcFooter("elementary");
    const secondaryStats = recalcFooter("secondary");

    updatePercentStat(
      "elementary",
      elementaryStats.count2Plus,
      elementaryStats.totalSchools,
    );
    updatePercentStat(
      "secondary",
      secondaryStats.count2Plus,
      secondaryStats.totalSchools,
    );

    applyTotalDisplayMode();

    SECTIONS.forEach((section) => updateLineChart(section));
  }

  // --- Event delegation: checkbox changes ---
  SECTIONS.forEach((section) => {
    const table = getTable(section);
    if (!table) return;

    table.addEventListener("change", (e) => {
      const target = e.target;
      if (!target.matches("input.irc2b-check")) return;

      updateDashboard();
    });
  });

  // --- Total column header click: toggle Quarters <-> Months ---
  SECTIONS.forEach((section) => {
    const table = getTable(section);
    if (!table) return;

    const header = table.querySelector(".irc2b-total-col-clickable");
    if (!header) return;

    header.addEventListener("click", toggleTotalDisplayMode);
  });

  // --- Chart toggle buttons: Monthly <-> Quarterly ---
  document.querySelectorAll(".irc2b-chart-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setChartDisplayMode(btn.dataset.chartMode);
    });
  });

  // --- Initial render ---
  applyChartToggleButtons();
  updateDashboard();
})();
