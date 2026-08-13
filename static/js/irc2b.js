(function () {
  const SECTIONS = ["elementary", "secondary"];

  const tab = document.getElementById("irc2b-tab");
  if (!tab) return;

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

  // Row total now counts EVERY checked month (max 12), not distinct
  // quarters. We still track which quarters were touched (any month
  // checked within it) and return that Set, because the footer's
  // "Schools Provided with TA" / 2+-quarter grand total still needs
  // it — that logic is unchanged.
  function recalcRow(section, row) {
    const checkboxes = getRowCheckboxes(section, row);

    const quartersWithTA = new Set();
    let totalChecked = 0;

    checkboxes.forEach((cb) => {
      if (cb.checked) {
        quartersWithTA.add(cb.dataset.quarter);
        totalChecked += 1;
      }
    });

    const totalEl = getTable(section).querySelector(
      `.irc2b-row-total[data-row="${row}"]`,
    );
    if (totalEl) totalEl.textContent = totalChecked.toLocaleString();

    return quartersWithTA;
  }

  // Footer row: "how many schools" per quarter, and "how many schools"
  // reached in 2+ quarters overall. Returns { count2Plus, totalSchools }
  // so the caller can roll this up into the page-level dashboard.
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

  // --- Initial render ---
  updateDashboard();
})();
