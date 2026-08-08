(function () {
  const MONTHS = [
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
  const SECTIONS = ["elementary", "secondary"];

  const tab = document.getElementById("irc2b-tab");
  if (!tab) return;

  const elementaryGrandTotalEl = document.getElementById(
    "irc2b-elementary-grand-total",
  );
  const secondaryGrandTotalEl = document.getElementById(
    "irc2b-secondary-grand-total",
  );
  const overallGrandTotalEl = document.getElementById(
    "irc2b-overall-grand-total",
  );

  function getTable(section) {
    return document.getElementById(`irc2b-table-${section}`);
  }

  function getRowCheckboxes(section, row) {
    const table = getTable(section);
    return Array.from(
      table.querySelectorAll(`input.irc2b-check[data-row="${row}"]`),
    );
  }

  function getColumnCheckboxes(section, month) {
    const table = getTable(section);
    return Array.from(
      table.querySelectorAll(`input.irc2b-check[data-month="${month}"]`),
    );
  }

  function getAllRowIndices(section) {
    const table = getTable(section);
    const rows = table.querySelectorAll("tbody tr[data-row-index]");
    return Array.from(rows).map((r) => r.dataset.rowIndex);
  }

  // Recalculate a single row's Total cell based on checked months.
  function recalcRow(section, row) {
    const checkboxes = getRowCheckboxes(section, row);
    const total = checkboxes.filter((cb) => cb.checked).length;
    const totalEl = getTable(section).querySelector(
      `.irc2b-row-total[data-row="${row}"]`,
    );
    if (totalEl) totalEl.textContent = total.toLocaleString();
    return total;
  }

  // Recalculate the "Select All" checkbox state for one month column,
  // reflecting a checked / unchecked / indeterminate (partial) state.
  function recalcSelectAllState(section, month) {
    const checkboxes = getColumnCheckboxes(section, month);
    const checkedCount = checkboxes.filter((cb) => cb.checked).length;
    const selectAll = getTable(section).querySelector(
      `.irc2b-select-all-check[data-month="${month}"]`,
    );
    if (!selectAll) return;

    if (checkedCount === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    } else if (checkedCount === checkboxes.length) {
      selectAll.checked = true;
      selectAll.indeterminate = false;
    } else {
      selectAll.checked = false;
      selectAll.indeterminate = true;
    }
  }

  // Sum every row's total within a section's table.
  function recalcSectionGrandTotal(section) {
    const rows = getAllRowIndices(section);
    const sum = rows.reduce((acc, row) => acc + recalcRow(section, row), 0);
    return sum;
  }

  function recalcAllGrandTotals() {
    const elementaryTotal = recalcSectionGrandTotal("elementary");
    const secondaryTotal = recalcSectionGrandTotal("secondary");

    elementaryGrandTotalEl.textContent = elementaryTotal.toLocaleString();
    secondaryGrandTotalEl.textContent = secondaryTotal.toLocaleString();
    overallGrandTotalEl.textContent = (
      elementaryTotal + secondaryTotal
    ).toLocaleString();
  }

  function refreshAllSelectAllStates(section) {
    MONTHS.forEach((month) => recalcSelectAllState(section, month));
  }

  // --- Event delegation: individual school/month checkboxes ---
  SECTIONS.forEach((section) => {
    const table = getTable(section);
    if (!table) return;

    table.addEventListener("change", (e) => {
      const target = e.target;

      if (target.matches("input.irc2b-check")) {
        const row = target.dataset.row;
        const month = target.dataset.month;
        recalcRow(section, row);
        recalcSelectAllState(section, month);
        recalcAllGrandTotals();
        return;
      }

      if (target.matches("input.irc2b-select-all-check")) {
        const month = target.dataset.month;
        const checkboxes = getColumnCheckboxes(section, month);
        checkboxes.forEach((cb) => {
          cb.checked = target.checked;
        });
        target.indeterminate = false;

        getAllRowIndices(section).forEach((row) => recalcRow(section, row));
        recalcAllGrandTotals();
      }
    });
  });

  // --- Clear All button ---
  const resetBtn = document.getElementById("irc2b-reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const confirmed = window.confirm(
        "Clear all checked months for every school? This cannot be undone.",
      );
      if (!confirmed) return;

      SECTIONS.forEach((section) => {
        const table = getTable(section);
        table
          .querySelectorAll("input.irc2b-check")
          .forEach((cb) => (cb.checked = false));
        table.querySelectorAll("input.irc2b-select-all-check").forEach((cb) => {
          cb.checked = false;
          cb.indeterminate = false;
        });
      });

      SECTIONS.forEach((section) => {
        getAllRowIndices(section).forEach((row) => recalcRow(section, row));
      });
      recalcAllGrandTotals();
    });
  }

  // --- Initial render ---
  SECTIONS.forEach((section) => {
    getAllRowIndices(section).forEach((row) => recalcRow(section, row));
    refreshAllSelectAllStates(section);
  });
  recalcAllGrandTotals();
})();
