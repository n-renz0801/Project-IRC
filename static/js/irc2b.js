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

  // A quarter counts toward a row's total if ANY of its months are checked —
  // Jan + Feb both checked still only counts once, since they're both Q1.
  // Returns the Set of quarters reached, so callers can both show the row
  // total (set size) and roll quarters up into the footer counts.
  function recalcRow(section, row) {
    const checkboxes = getRowCheckboxes(section, row);

    const quartersWithTA = new Set();
    checkboxes.forEach((cb) => {
      if (cb.checked) quartersWithTA.add(cb.dataset.quarter);
    });

    const total = quartersWithTA.size; // max 4 (Q1–Q4)

    const totalEl = getTable(section).querySelector(
      `.irc2b-row-total[data-row="${row}"]`,
    );
    if (totalEl) totalEl.textContent = total.toLocaleString();

    return quartersWithTA;
  }

  // Footer row: "how many schools" per quarter, and "how many schools"
  // reached in 2+ quarters overall.
  function recalcFooter(section) {
    const quarterCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    let schoolsWithTwoPlusQuarters = 0;

    getAllRowIndices(section).forEach((row) => {
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
  }

  // --- Event delegation: checkbox changes ---
  SECTIONS.forEach((section) => {
    const table = getTable(section);
    if (!table) return;

    table.addEventListener("change", (e) => {
      const target = e.target;
      if (!target.matches("input.irc2b-check")) return;

      recalcFooter(section);
    });
  });

  // --- Initial render ---
  SECTIONS.forEach((section) => recalcFooter(section));
})();
