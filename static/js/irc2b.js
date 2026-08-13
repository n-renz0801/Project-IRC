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

  const tab = document.getElementById("irc2b-tab");
  if (!tab) return;

  // "quarters" = legacy logic (1 point per distinct quarter reached, max 4)
  // "months"   = current logic (1 point per checked month, max 12)
  // Global so both tables always show the same mode side by side.
  let totalDisplayMode = "quarters";

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

  // --- Per-table monthly line chart ---
  // Counts how many schools in this section had TA checked in each
  // of the 12 months (independent of the quarter/month total toggle
  // above — this always shows monthly granularity).
  function getMonthlyCounts(section) {
    const table = getTable(section);
    return MONTH_KEYS.map(
      (key) =>
        table.querySelectorAll(`input.irc2b-check[data-month="${key}"]:checked`)
          .length,
    );
  }

  // Builds the path/area/points/value-label markup for the chart's
  // dynamic <g> group. Plot coordinates match the static axis/gridline
  // coordinates baked into the template's SVG skeleton.
  function buildLineChartMarkup(section, counts, maxValue) {
    const plotLeft = 44;
    const plotRight = 740;
    const plotTop = 24;
    const plotBottom = 166;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;
    const n = counts.length;
    const step = plotWidth / (n - 1);

    const points = counts.map((val, i) => {
      const x = plotLeft + i * step;
      const ratio = maxValue > 0 ? val / maxValue : 0;
      const y = plotBottom - ratio * plotHeight;
      return { x, y, val };
    });

    const linePath = points
      .map(
        (p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`,
      )
      .join(" ");

    const areaPath =
      `M ${points[0].x.toFixed(1)},${plotBottom} ` +
      points.map((p) => `L ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
      ` L ${points[n - 1].x.toFixed(1)},${plotBottom} Z`;

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

  function updateLineChart(section) {
    const group = document.getElementById(`irc2b-${section}-line-group`);
    if (!group) return;

    const counts = getMonthlyCounts(section);
    const totalSchools = getAllRowIndices(section).length;

    group.innerHTML = buildLineChartMarkup(section, counts, totalSchools);
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

  // --- Initial render ---
  updateDashboard();
})();
