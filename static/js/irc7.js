(function () {
  const table = document.getElementById("irc7-table");
  if (!table) return;

  const wrapper = table.closest(".irc7-table-wrapper") || table.parentElement;
  const colgroup = document.getElementById("irc7-colgroup");
  const groupRow = document.getElementById("irc7-group-row");
  const colRow = document.getElementById("irc7-col-row");
  const tbody = document.getElementById("irc7-tbody");
  const totalsRow = document.getElementById("irc7-totals-row");

  const addColumnBtn = document.getElementById("addColumnBtn");
  const modal = document.getElementById("addColumnModal");
  const modalClose = document.getElementById("irc7ModalClose");
  const modalCancel = document.getElementById("irc7ModalCancel");
  const modalOverlay = document.getElementById("irc7ModalOverlay");
  const modalSubmit = document.getElementById("irc7ModalSubmit");
  const groupsContainer = document.getElementById("irc7-groups-container");
  const addGroupBtn = document.getElementById("irc7AddGroupBtn");

  const editModal = document.getElementById("editItemModal");
  const editModalTitle = document.getElementById("editItemModalTitle");
  const editModalClose = document.getElementById("editItemModalClose");
  const editModalOverlay = document.getElementById("editItemModalOverlay");
  const editModalCancel = document.getElementById("editItemCancel");
  const editModalSave = document.getElementById("editItemSave");
  const editNameInput = document.getElementById("editItemNameInput");
  const editTypeWrapper = document.getElementById("editItemTypeWrapper");
  const editTypeSelect = document.getElementById("editItemTypeSelect");

  const editModeBtn = document.getElementById("editModeBtn");
  const deleteModeBtn = document.getElementById("deleteModeBtn");
  const editModeBanner = document.getElementById("editModeBanner");
  const deleteModeBanner = document.getElementById("deleteModeBanner");

  const resetBtn = document.getElementById("irc7-reset-btn");
  const resetConfirmOverlay = document.getElementById(
    "irc7-reset-confirm-overlay",
  );
  const resetConfirmCancelBtn = document.getElementById(
    "irc7-reset-confirm-cancel",
  );
  const resetConfirmConfirmBtn = document.getElementById(
    "irc7-reset-confirm-confirm",
  );
  const resetScopeRadios = document.querySelectorAll(
    'input[name="irc7-reset-scope"]',
  );
  const resetConfirmWarning = document.getElementById(
    "irc7-reset-confirm-warning",
  );

  // Minimum pixel width for each column type. Every added column (grouped
  // or standalone) gets a <col data-min-width="..."> using one of these.
  const ADDED_COLUMN_MIN_WIDTH = {
    text: 140,
    number: 100,
    paragraph: 220,
  };

  // ---------- Data model for added groups/columns ----------
  //
  // Columns/values are persisted server-side (see /irc/irc7/data,
  // /irc/irc7/columns, /irc/irc7/column/<id>, /irc/irc7/group/<name>, and
  // /irc/irc7/cell). `columns` here is a client-side cache using the
  // server's real integer ids.
  //
  // A "group" has no separate identity in the schema -- it's just the
  // group_name shared by however many IRC7Column rows have it (see
  // models.py). But the UI still needs to know exactly which *rendered
  // header block* a click came from (two separate "Add Columns" batches
  // could reuse the same group name and would then render as two
  // side-by-side header blocks) -- `columnBlocks` gives each rendered
  // block its own client-only token for that purpose, while `groupName`
  // is what's actually sent to the backend. Renaming/deleting "a group"
  // therefore affects every block sharing that name, matching what
  // actually happens server-side -- see editModalSave/removeGroup below.
  const columnBlocks = new Map(); // blockToken -> { groupName, columnIds: Set<number> }
  const colIdToBlock = new Map(); // colId -> blockToken
  let blockCounter = 0;
  let columns = []; // ordered array of { id, name, type, groupName|null }
  let rowsData = []; // fixed reference rows (schools/offerings) from the server
  let cellValues = {}; // "rowId:colId" -> value, for the current year

  const YEAR = new Date().getFullYear();

  // ================= FLUID-UNTIL-MINIMUM COLUMN LAYOUT =================
  // Every <col> in #irc7-colgroup carries a data-min-width (px). Whenever
  // columns change (or the wrapper is resized), recalcLayout() decides:
  //  - if the sum of all minimums fits inside the wrapper: stretch the
  //    table to 100% and give each column a percentage share of that
  //    width proportional to its minimum (fluid — fills the table).
  //  - otherwise: pin the table width to the sum of minimums (px) and
  //    give each column exactly its minimum (px) — columns stop
  //    shrinking, and the wrapper's overflow-x: auto makes it scroll.
  function recalcLayout() {
    const cols = Array.from(colgroup.children);
    if (cols.length === 0) return;

    const minWidths = cols.map((c) => parseFloat(c.dataset.minWidth) || 100);
    const totalMin = minWidths.reduce((sum, w) => sum + w, 0);
    const available = wrapper.clientWidth;

    if (totalMin <= available) {
      table.style.width = "100%";
      cols.forEach((c, i) => {
        c.style.width = (minWidths[i] / totalMin) * 100 + "%";
      });
    } else {
      table.style.width = totalMin + "px";
      cols.forEach((c, i) => {
        c.style.width = minWidths[i] + "px";
      });
    }
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(recalcLayout, 100);
  });

  // ================= LOADING FIXED ROWS + SAVED COLUMNS/VALUES =================

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  // The six leading columns (School ID, Name, Curricular Offering, DLC,
  // Status, Classification) used to be hardcoded directly into
  // irc7.html's <tbody>. They now come from IRC7Row (seeded once via
  // storage.seed_irc7_rows()), so the tbody starts empty and this
  // builds those rows from the fetched data instead.
  function renderFixedRows(rows) {
    tbody.innerHTML = "";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.dataset.rowId = row.id;
      tr.innerHTML = `
        <td>${escapeHtml(row.schoolIdCode)}</td>
        <td>${escapeHtml(row.schoolName)}</td>
        <td>${escapeHtml(row.curricularOffering)}</td>
        <td>${escapeHtml(row.dlc)}</td>
        <td>${escapeHtml(row.dedpStatus)}</td>
        <td>${escapeHtml(row.classification)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function loadData() {
    try {
      const res = await fetch(`/irc/irc7/data?year=${YEAR}`);
      if (!res.ok) throw new Error("Failed to load data");
      const data = await res.json();

      rowsData = data.rows || [];
      cellValues = data.values || {};
      renderFixedRows(rowsData);

      const sortedColumns = (data.columns || [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder);
      renderColumnsBatch(sortedColumns);
    } catch (err) {
      console.error("Failed to load IRC7 data:", err);
      recalcLayout();
    }
  }

  // ---------- Mode state: null | 'edit' | 'delete' ----------
  let activeMode = null;

  function deactivateModes() {
    activeMode = null;
    editModeBtn.classList.remove("irc7-icon-btn--active");
    deleteModeBtn.classList.remove("irc7-icon-btn--active");
    editModeBanner.style.display = "none";
    deleteModeBanner.style.display = "none";
    table.classList.remove("irc7-mode-edit", "irc7-mode-delete");
  }

  function setMode(mode) {
    if (activeMode === mode) {
      deactivateModes();
      return;
    }
    deactivateModes();
    activeMode = mode;
    if (mode === "edit") {
      editModeBtn.classList.add("irc7-icon-btn--active");
      editModeBanner.style.display = "flex";
      table.classList.add("irc7-mode-edit");
    } else if (mode === "delete") {
      deleteModeBtn.classList.add("irc7-icon-btn--active");
      deleteModeBanner.style.display = "flex";
      table.classList.add("irc7-mode-delete");
    }
  }

  editModeBtn.addEventListener("click", () => setMode("edit"));
  deleteModeBtn.addEventListener("click", () => setMode("delete"));

  // ================= ADD COLUMN MODAL =================

  const TRASH_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;
  const PLUS_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>`;

  function createColumnRow() {
    const row = document.createElement("div");
    row.className = "irc7-column-row";
    row.innerHTML = `
      <input type="text" class="irc7-column-name-input" placeholder="Column name" />
      <select class="irc7-column-type-select">
        <option value="text">Text</option>
        <option value="number">Number</option>
        <option value="paragraph">Paragraph</option>
      </select>
      <button type="button" class="irc7-remove-column-btn" title="Remove column">
        ${TRASH_SVG}
      </button>
    `;
    row
      .querySelector(".irc7-remove-column-btn")
      .addEventListener("click", () => row.remove());
    return row;
  }

  function createGroupBlock() {
    const block = document.createElement("div");
    block.className = "irc7-group-block";
    block.innerHTML = `
      <div class="irc7-group-block-header">
        <input type="text" class="irc7-group-name-input" placeholder="Group name (optional — leave blank for standalone columns)" />
        <button type="button" class="irc7-remove-group-btn" title="Remove group">
          ${TRASH_SVG}
        </button>
      </div>
      <div class="irc7-columns-list"></div>
      <button type="button" class="irc7-add-column-btn">
        ${PLUS_SVG} Add Column
      </button>
    `;

    const columnsList = block.querySelector(".irc7-columns-list");
    columnsList.appendChild(createColumnRow());

    block
      .querySelector(".irc7-add-column-btn")
      .addEventListener("click", () => {
        columnsList.appendChild(createColumnRow());
      });

    block
      .querySelector(".irc7-remove-group-btn")
      .addEventListener("click", () => block.remove());

    return block;
  }

  function resetAddModal() {
    groupsContainer.innerHTML = "";
    groupsContainer.appendChild(createGroupBlock());
  }

  function showAddModal() {
    deactivateModes(); // avoid confusing overlap between "add" and edit/delete modes
    resetAddModal();
    modal.style.display = "flex";
  }

  function hideAddModal() {
    modal.style.display = "none";
  }

  addColumnBtn.addEventListener("click", showAddModal);
  modalClose.addEventListener("click", hideAddModal);
  modalCancel.addEventListener("click", hideAddModal);
  modalOverlay.addEventListener("click", hideAddModal);
  document
    .querySelector("#addColumnModal .irc7-modal-content")
    .addEventListener("click", (e) => e.stopPropagation());

  addGroupBtn.addEventListener("click", () => {
    groupsContainer.appendChild(createGroupBlock());
  });

  modalSubmit.addEventListener("click", async () => {
    const newColumns = [];

    groupsContainer.querySelectorAll(".irc7-group-block").forEach((block) => {
      const groupName = block
        .querySelector(".irc7-group-name-input")
        .value.trim();

      block.querySelectorAll(".irc7-column-row").forEach((row) => {
        const name = row.querySelector(".irc7-column-name-input").value.trim();
        const type = row.querySelector(".irc7-column-type-select").value;
        if (name) {
          newColumns.push({ name, type, groupName: groupName || null });
        }
      });
    });

    if (newColumns.length === 0) {
      alert("Please add at least one column with a name.");
      return;
    }

    try {
      const res = await fetch("/irc/irc7/columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns: newColumns }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      renderColumnsBatch(data.columns);
      hideAddModal();
    } catch (err) {
      console.error("Failed to add IRC7 columns:", err);
      alert("Could not add these columns. Please try again.");
    }
  });

  // ================= BUILDING COLUMNS INTO THE TABLE =================
  //
  // Used both for the initial load (the full saved column list, in
  // sort_order) and for a freshly-added batch (just the columns the
  // server handed back from POST /irc/irc7/columns) -- either way, the
  // list is already in the order it should render in.
  function renderColumnsBatch(newColumns) {
    let i = 0;
    while (i < newColumns.length) {
      const col = newColumns[i];

      if (col.groupName) {
        let j = i;
        const batch = [];
        while (
          j < newColumns.length &&
          newColumns[j].groupName === col.groupName
        ) {
          batch.push(newColumns[j]);
          j++;
        }

        const blockToken = "blk" + ++blockCounter;
        columnBlocks.set(blockToken, {
          groupName: col.groupName,
          columnIds: new Set(batch.map((c) => c.id)),
        });
        batch.forEach((c) => colIdToBlock.set(c.id, blockToken));

        const groupTh = buildGroupHeaderCell(
          blockToken,
          col.groupName,
          batch.length,
        );
        groupRow.appendChild(groupTh);

        batch.forEach((c) => {
          columns.push({
            id: c.id,
            name: c.name,
            type: c.type,
            groupName: c.groupName,
          });

          const th = buildColumnHeaderCell(c.id, c.name);
          colRow.appendChild(th);
          colgroup.appendChild(buildColElement(c.id, c.type));
          appendCellToRows(c.id, c.type);
        });

        i = j;
      } else {
        columns.push({
          id: col.id,
          name: col.name,
          type: col.type,
          groupName: null,
        });

        const th = buildColumnHeaderCell(col.id, col.name);
        th.rowSpan = 2;
        groupRow.appendChild(th);
        colgroup.appendChild(buildColElement(col.id, col.type));
        appendCellToRows(col.id, col.type);
        i++;
      }
    }

    recalcLayout();
  }

  // <col> element carrying this column's minimum width.
  function buildColElement(colId, type) {
    const colEl = document.createElement("col");
    colEl.dataset.colId = colId;
    colEl.dataset.minWidth =
      ADDED_COLUMN_MIN_WIDTH[type] || ADDED_COLUMN_MIN_WIDTH.text;
    return colEl;
  }

  // Header cell for a top-row group (spans the columns beneath it).
  function buildGroupHeaderCell(groupId, name, colSpan) {
    const th = document.createElement("th");
    th.className = "irc7-group-header irc7-added-header";
    th.colSpan = colSpan;
    th.dataset.groupId = groupId;
    th.textContent = name;
    return th;
  }

  // Header cell for an individual column (grouped or standalone).
  function buildColumnHeaderCell(colId, name) {
    const th = document.createElement("th");
    th.className = "irc7-sub-header irc7-added-header irc7-fixed-col";
    th.dataset.colId = colId;
    th.textContent = name;
    return th;
  }

  function appendCellToRows(colId, type) {
    tbody.querySelectorAll("tr").forEach((tr) => {
      const rowId = Number(tr.dataset.rowId);
      const td = document.createElement("td");
      td.className = "irc7-editable-cell";
      td.dataset.colId = colId;

      const existingValue = cellValues[`${rowId}:${colId}`];
      const input = buildCellInput(type, rowId, colId, existingValue);
      td.appendChild(input);
      tr.appendChild(td);
    });

    // One totals cell per added column, built after this column's data
    // cells above so its initial sum (for "number" columns) reflects any
    // values already loaded from the server.
    totalsRow.appendChild(buildTotalsCell(colId, type));
  }

  function buildCellInput(type, rowId, colId, initialValue) {
    const input = document.createElement("input");
    input.type = type === "number" ? "number" : "text";
    input.className = "irc7-cell-input irc7-cell-input--" + type;
    if (type === "number") input.step = "any";
    if (type === "paragraph") input.placeholder = "Enter text...";
    if (initialValue !== undefined && initialValue !== null) {
      input.value = initialValue;
    }

    input.addEventListener("change", () => {
      saveCellValue(rowId, colId, input.value);
      updateColumnTotal(colId);
    });

    return input;
  }

  async function saveCellValue(rowId, colId, value) {
    try {
      const res = await fetch("/irc/irc7/cell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, columnId: colId, year: YEAR, value }),
      });
      if (!res.ok) throw new Error("Save failed");
      cellValues[`${rowId}:${colId}`] = value === "" ? null : value;
    } catch (err) {
      console.error("Failed to save IRC7 cell:", err);
    }
  }

  // ================= TOTALS ROW (number columns only) =================
  //
  // Sums are computed straight from each column's <input> values already
  // in the DOM, not from `cellValues` -- that keeps the running total in
  // sync with whatever's currently typed the instant a "change" event
  // fires, without waiting on saveCellValue's fetch to resolve.

  function formatSum(n) {
    // Round to 2 decimals to shake off floating-point noise (e.g.
    // 0.1 + 0.2), then drop a trailing ".00"/".50"-style zero tail.
    const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
    return String(rounded);
  }

  function computeColumnSum(colId) {
    let sum = 0;
    tbody
      .querySelectorAll(`td[data-col-id="${colId}"] input`)
      .forEach((input) => {
        const v = parseFloat(input.value);
        if (!isNaN(v)) sum += v;
      });
    return sum;
  }

  function buildTotalsCell(colId, type) {
    const td = document.createElement("td");
    td.className = "irc7-totals-cell";
    td.dataset.colId = colId;
    if (type === "number") {
      td.textContent = formatSum(computeColumnSum(colId));
    }
    return td;
  }

  function updateColumnTotal(colId) {
    const col = columns.find((c) => c.id === colId);
    if (!col || col.type !== "number") return;
    const cell = totalsRow.querySelector(`td[data-col-id="${colId}"]`);
    if (!cell) return;
    cell.textContent = formatSum(computeColumnSum(colId));
  }

  // ================= EDIT / DELETE MODE: header clicks =================

  function onHeaderClick(e) {
    if (!activeMode) return; // clicking headers does nothing outside a mode

    const th = e.target.closest("th[data-group-id], th[data-col-id]");
    if (!th) return; // fixed (original) columns have no data-* id, so they're never affected

    const kind = th.dataset.groupId ? "group" : "column";
    const id = th.dataset.groupId || th.dataset.colId;

    if (activeMode === "edit") {
      openEditModal(kind, id);
    } else if (activeMode === "delete") {
      handleRemove(kind, id);
    }
  }

  groupRow.addEventListener("click", onHeaderClick);
  colRow.addEventListener("click", onHeaderClick);

  // ---------- Edit modal ----------

  let editingTarget = null; // { kind: 'column'|'group', id }

  function openEditModal(kind, id) {
    editingTarget = { kind, id };

    if (kind === "group") {
      const block = columnBlocks.get(id);
      if (!block) return;
      editModalTitle.textContent = "Edit Group";
      editNameInput.value = block.groupName;
      editTypeWrapper.style.display = "none";
    } else {
      const col = columns.find((c) => c.id === Number(id));
      if (!col) return;
      editModalTitle.textContent = "Edit Column";
      editNameInput.value = col.name;
      editTypeSelect.value = col.type;
      editTypeWrapper.style.display = "";
    }

    editModal.style.display = "flex";
    editNameInput.focus();
  }

  function hideEditModal() {
    editModal.style.display = "none";
    editingTarget = null;
  }

  editModalClose.addEventListener("click", hideEditModal);
  editModalCancel.addEventListener("click", hideEditModal);
  editModalOverlay.addEventListener("click", hideEditModal);
  document
    .querySelector("#editItemModal .irc7-modal-content")
    .addEventListener("click", (e) => e.stopPropagation());

  editModalSave.addEventListener("click", async () => {
    if (!editingTarget) return;
    const newName = editNameInput.value.trim();
    if (!newName) {
      alert("Name cannot be empty.");
      return;
    }

    try {
      if (editingTarget.kind === "group") {
        const block = columnBlocks.get(editingTarget.id);
        if (!block) return;
        const oldName = block.groupName;

        const res = await fetch(
          `/irc/irc7/group/${encodeURIComponent(oldName)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: newName }),
          },
        );
        if (!res.ok) throw new Error("Rename failed");

        // The backend renames every column sharing oldName, across every
        // rendered block -- mirror that here, not just the block clicked.
        columnBlocks.forEach((b, token) => {
          if (b.groupName === oldName) {
            b.groupName = newName;
            const th = groupRow.querySelector(`th[data-group-id="${token}"]`);
            if (th) th.textContent = newName;
          }
        });
        columns.forEach((c) => {
          if (c.groupName === oldName) c.groupName = newName;
        });
      } else {
        const col = columns.find((c) => c.id === Number(editingTarget.id));
        if (!col) return;
        const newType = editTypeSelect.value;
        const typeChanged = col.type !== newType;

        const res = await fetch(`/irc/irc7/column/${col.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName, type: newType }),
        });
        if (!res.ok) throw new Error("Save failed");

        col.name = newName;
        col.type = newType;

        const th = colRow.querySelector(`th[data-col-id="${col.id}"]`);
        if (th) th.textContent = newName;

        if (typeChanged) {
          // Update the column's minimum width to match the new type, then
          // let recalcLayout() redistribute space.
          const colEl = colgroup.querySelector(`col[data-col-id="${col.id}"]`);
          if (colEl) {
            colEl.dataset.minWidth =
              ADDED_COLUMN_MIN_WIDTH[newType] || ADDED_COLUMN_MIN_WIDTH.text;
          }

          tbody
            .querySelectorAll(`td[data-col-id="${col.id}"]`)
            .forEach((td) => {
              const tr = td.closest("tr");
              const rowId = Number(tr.dataset.rowId);
              const oldVal = td.querySelector("input")?.value || "";
              const keepValue =
                newType !== "number" ||
                oldVal === "" ||
                !Number.isNaN(parseFloat(oldVal));
              td.innerHTML = "";
              const input = buildCellInput(
                newType,
                rowId,
                col.id,
                keepValue ? oldVal : "",
              );
              td.appendChild(input);
            });

          // Type changed -- refresh the totals cell in place (never
          // remove/re-append it, since that would shift its position out
          // of alignment with this column's <col>/header).
          const totalsCell = totalsRow.querySelector(
            `td[data-col-id="${col.id}"]`,
          );
          if (totalsCell) {
            totalsCell.textContent =
              newType === "number" ? formatSum(computeColumnSum(col.id)) : "";
          }

          recalcLayout();
        }
      }

      hideEditModal();
      // Stay in edit mode so the user can edit another header right away.
    } catch (err) {
      console.error("Failed to save IRC7 edit:", err);
      alert("Could not save this change. Please try again.");
    }
  });

  // ---------- Delete ----------

  function handleRemove(kind, id) {
    if (kind === "group") {
      const block = columnBlocks.get(id);
      if (!block) return;
      if (
        !confirm(
          `Remove the group "${block.groupName}" and all its columns? This cannot be undone.`,
        )
      ) {
        return;
      }
      removeGroup(id);
    } else {
      const col = columns.find((c) => c.id === Number(id));
      if (!col) return;
      if (!confirm(`Remove the column "${col.name}"? This cannot be undone.`)) {
        return;
      }
      removeColumn(col.id);
    }
    // Stay in delete mode so the user can remove more without retoggling.
  }

  async function removeColumn(colId) {
    const col = columns.find((c) => c.id === colId);
    if (!col) return;

    try {
      const res = await fetch(`/irc/irc7/column/${colId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
    } catch (err) {
      console.error("Failed to delete IRC7 column:", err);
      alert("Could not delete this column. Please try again.");
      return;
    }

    const th =
      colRow.querySelector(`th[data-col-id="${colId}"]`) ||
      groupRow.querySelector(`th[data-col-id="${colId}"]`);
    if (th) th.remove();

    const colEl = colgroup.querySelector(`col[data-col-id="${colId}"]`);
    if (colEl) colEl.remove();

    tbody
      .querySelectorAll(`td[data-col-id="${colId}"]`)
      .forEach((td) => td.remove());

    const totalsCell = totalsRow.querySelector(`td[data-col-id="${colId}"]`);
    if (totalsCell) totalsCell.remove();

    const blockToken = colIdToBlock.get(colId);
    if (blockToken) {
      const block = columnBlocks.get(blockToken);
      block.columnIds.delete(colId);
      colIdToBlock.delete(colId);

      const groupTh = groupRow.querySelector(
        `th[data-group-id="${blockToken}"]`,
      );
      if (block.columnIds.size === 0) {
        if (groupTh) groupTh.remove();
        columnBlocks.delete(blockToken);
      } else if (groupTh) {
        groupTh.colSpan = block.columnIds.size;
      }
    }

    columns = columns.filter((c) => c.id !== colId);
    recalcLayout();
  }

  async function removeGroup(blockToken) {
    const block = columnBlocks.get(blockToken);
    if (!block) return;
    const groupName = block.groupName;

    try {
      const res = await fetch(
        `/irc/irc7/group/${encodeURIComponent(groupName)}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) throw new Error("Delete failed");
    } catch (err) {
      console.error("Failed to delete IRC7 group:", err);
      alert("Could not delete this group. Please try again.");
      return;
    }

    // The backend deletes every column sharing this group name, across
    // every rendered block -- remove all of them here too, not just the
    // block that was clicked.
    const blocksToRemove = [];
    columnBlocks.forEach((b, token) => {
      if (b.groupName === groupName) blocksToRemove.push(token);
    });

    blocksToRemove.forEach((token) => {
      const b = columnBlocks.get(token);
      const groupTh = groupRow.querySelector(`th[data-group-id="${token}"]`);
      if (groupTh) groupTh.remove();

      b.columnIds.forEach((colId) => {
        const th = colRow.querySelector(`th[data-col-id="${colId}"]`);
        if (th) th.remove();
        const colEl = colgroup.querySelector(`col[data-col-id="${colId}"]`);
        if (colEl) colEl.remove();
        tbody
          .querySelectorAll(`td[data-col-id="${colId}"]`)
          .forEach((td) => td.remove());
        const totalsCell = totalsRow.querySelector(
          `td[data-col-id="${colId}"]`,
        );
        if (totalsCell) totalsCell.remove();
        colIdToBlock.delete(colId);
      });

      columnBlocks.delete(token);
    });

    columns = columns.filter((c) => c.groupName !== groupName);
    recalcLayout();
  }

  // ================= RESET: VALUES ONLY, OR ENTIRE TABLE =================
  //
  // Two scopes, chosen via the modal's radio buttons and sent as
  // ?scope=values|all to the shared /irc/irc7/reset endpoint:
  //
  //  - "values" (default): only IRC7CellValue rows are wiped server-side.
  //    IRC7's added-column *values* live in their own table separate
  //    from the columns/groups themselves (IRC7Column), so columns,
  //    groups, and their titles are never touched -- only what's typed
  //    into each cell disappears.
  //  - "all": every IRC7Column is deleted outright, which cascades to
  //    its cell values too (see reset_irc7_data() in app.py) -- the
  //    table goes back to just its 6 fixed reference columns.
  const RESET_WARNINGS = {
    values:
      "This will clear all entered values in every column, but keeps the columns and their titles. This cannot be undone.",
    all: "This will remove every added column and group, along with everything typed into them. This cannot be undone.",
  };

  function getSelectedResetScope() {
    const checked = document.querySelector(
      'input[name="irc7-reset-scope"]:checked',
    );
    return checked ? checked.value : "values";
  }

  function updateResetWarning() {
    const scope = getSelectedResetScope();
    resetConfirmWarning.textContent =
      RESET_WARNINGS[scope] || RESET_WARNINGS.values;
    resetConfirmWarning.classList.toggle(
      "irc7-reset-warning--danger",
      scope === "all",
    );
  }

  resetScopeRadios.forEach((radio) => {
    radio.addEventListener("change", updateResetWarning);
  });

  function openResetConfirm() {
    // Always reopen on the safer "values only" option rather than
    // remembering whatever was picked last time.
    const valuesRadio = document.getElementById("irc7-reset-scope-values");
    if (valuesRadio) valuesRadio.checked = true;
    updateResetWarning();
    resetConfirmOverlay.classList.add("visible");
  }

  function closeResetConfirm() {
    resetConfirmOverlay.classList.remove("visible");
  }

  function clearAllCellValuesInPlace() {
    // Clear every cell input in place -- columns/headers already in the
    // DOM are left completely alone.
    cellValues = {};
    tbody.querySelectorAll(".irc7-cell-input").forEach((input) => {
      input.value = "";
    });

    // Every number column's sum drops to 0 now that its inputs are
    // empty -- recompute in place rather than assuming "0" everywhere,
    // in case a future change makes the sum ignore truly-empty cells.
    columns.forEach((col) => {
      if (col.type === "number") updateColumnTotal(col.id);
    });
  }

  function removeAllAddedColumnsInPlace() {
    // Group-spanning headers and standalone column headers both carry
    // "irc7-added-header" and both live in groupRow; grouped sub-headers
    // (colRow) are always 100% added, so it's cleared outright.
    groupRow
      .querySelectorAll(".irc7-added-header")
      .forEach((th) => th.remove());
    colRow.innerHTML = "";

    // Remove every added <col>, leaving the 6 fixed ones (they carry no
    // data-col-id) untouched.
    colgroup
      .querySelectorAll("col[data-col-id]")
      .forEach((col) => col.remove());

    // Remove every added data cell from each row, leaving the 6 fixed tds.
    tbody.querySelectorAll("td[data-col-id]").forEach((td) => td.remove());

    // Remove every totals cell, leaving only the "Total" label cell.
    totalsRow.querySelectorAll("td[data-col-id]").forEach((td) => td.remove());

    columns = [];
    columnBlocks.clear();
    colIdToBlock.clear();
    cellValues = {};
    deactivateModes();
  }

  resetBtn.addEventListener("click", openResetConfirm);
  resetConfirmCancelBtn.addEventListener("click", closeResetConfirm);
  resetConfirmOverlay.addEventListener("click", (e) => {
    if (e.target === resetConfirmOverlay) closeResetConfirm();
  });

  resetConfirmConfirmBtn.addEventListener("click", async () => {
    const scope = getSelectedResetScope();
    resetConfirmConfirmBtn.disabled = true;
    try {
      const res = await fetch(`/irc/irc7/reset?scope=${scope}&year=${YEAR}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Reset failed");

      if (scope === "all") {
        removeAllAddedColumnsInPlace();
        recalcLayout();
      } else {
        clearAllCellValuesInPlace();
      }
    } catch (err) {
      console.error("Failed to reset IRC7 data:", err);
      alert("Could not reset the data. Please try again.");
    } finally {
      resetConfirmConfirmBtn.disabled = false;
      closeResetConfirm();
    }
  });

  // ---------- Initial load ----------
  loadData();
})();
