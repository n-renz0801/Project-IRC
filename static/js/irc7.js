(function () {
  const table = document.getElementById("irc7-table");
  if (!table) return;

  const groupRow = document.getElementById("irc7-group-row");
  const colRow = document.getElementById("irc7-col-row");
  const tbody = document.getElementById("irc7-tbody");

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

  // ---------- Data model for added groups/columns ----------
  const groups = new Map(); // groupId -> { id, name }
  let columns = []; // ordered array of { id, name, type, groupId|null }
  let colCounter = 0;
  let groupCounter = 0;

  // ---------- Mode state: null | 'edit' | 'delete' ----------
  let activeMode = null;

  function deactivateModes() {
    activeMode = null;
    editModeBtn.classList.remove("irc7-mode-btn--active");
    deleteModeBtn.classList.remove("irc7-mode-btn--active");
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
      editModeBtn.classList.add("irc7-mode-btn--active");
      editModeBanner.style.display = "flex";
      table.classList.add("irc7-mode-edit");
    } else if (mode === "delete") {
      deleteModeBtn.classList.add("irc7-mode-btn--active");
      deleteModeBanner.style.display = "flex";
      table.classList.add("irc7-mode-delete");
    }
  }

  editModeBtn.addEventListener("click", () => setMode("edit"));
  deleteModeBtn.addEventListener("click", () => setMode("delete"));

  // ================= ADD COLUMN MODAL =================

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
        <i class="ti ti-x"></i>
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
          <i class="ti ti-trash"></i>
        </button>
      </div>
      <div class="irc7-columns-list"></div>
      <button type="button" class="irc7-add-column-btn">
        <i class="ti ti-plus"></i> Add Column
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

  modalSubmit.addEventListener("click", () => {
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

    addColumnsToTable(newColumns);
    hideAddModal();
  });

  // ================= BUILDING NEW COLUMNS INTO THE TABLE =================

  function addColumnsToTable(newColumns) {
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

        const groupId = "g" + ++groupCounter;
        groups.set(groupId, { id: groupId, name: col.groupName });

        const groupTh = buildGroupHeaderCell(
          groupId,
          col.groupName,
          batch.length,
        );
        groupRow.appendChild(groupTh);

        batch.forEach((c) => {
          const colId = "c" + ++colCounter;
          columns.push({ id: colId, name: c.name, type: c.type, groupId });

          const th = buildColumnHeaderCell(colId, c.name);
          colRow.appendChild(th);
          appendCellToRows(colId, c.type);
        });

        i = j;
      } else {
        const colId = "c" + ++colCounter;
        columns.push({
          id: colId,
          name: col.name,
          type: col.type,
          groupId: null,
        });

        const th = buildColumnHeaderCell(colId, col.name);
        th.rowSpan = 2;
        groupRow.appendChild(th);
        appendCellToRows(colId, col.type);
        i++;
      }
    }
  }

  // Plain text headers — no icons, so centered text never shifts off-center.
  function buildGroupHeaderCell(groupId, name, span) {
    const th = document.createElement("th");
    th.className = "irc7-group-header irc7-added-header";
    th.colSpan = span;
    th.dataset.groupId = groupId;
    th.textContent = name;
    return th;
  }

  function buildColumnHeaderCell(colId, name) {
    const th = document.createElement("th");
    th.className = "irc7-sub-header irc7-added-header irc7-fixed-col";
    th.dataset.colId = colId;
    th.textContent = name;
    return th;
  }

  function appendCellToRows(colId, type) {
    tbody.querySelectorAll("tr").forEach((tr) => {
      const td = document.createElement("td");
      td.className = "irc7-editable-cell";
      td.dataset.colId = colId;

      const input = buildCellInput(type);
      td.appendChild(input);
      tr.appendChild(td);
    });
  }

  function buildCellInput(type) {
    const input = document.createElement("input");
    input.type = type === "number" ? "number" : "text";
    input.className = "irc7-cell-input irc7-cell-input--" + type;
    if (type === "number") input.step = "any";
    if (type === "paragraph") input.placeholder = "Enter text...";
    return input;
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
      const group = groups.get(id);
      if (!group) return;
      editModalTitle.textContent = "Edit Group";
      editNameInput.value = group.name;
      editTypeWrapper.style.display = "none";
    } else {
      const col = columns.find((c) => c.id === id);
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

  editModalSave.addEventListener("click", () => {
    if (!editingTarget) return;
    const newName = editNameInput.value.trim();
    if (!newName) {
      alert("Name cannot be empty.");
      return;
    }

    if (editingTarget.kind === "group") {
      const group = groups.get(editingTarget.id);
      group.name = newName;
      const th = groupRow.querySelector(
        `th[data-group-id="${editingTarget.id}"]`,
      );
      if (th) th.textContent = newName;
    } else {
      const col = columns.find((c) => c.id === editingTarget.id);
      const newType = editTypeSelect.value;
      const typeChanged = col.type !== newType;
      col.name = newName;
      col.type = newType;

      const th = colRow.querySelector(`th[data-col-id="${editingTarget.id}"]`);
      if (th) th.textContent = newName;

      if (typeChanged) {
        tbody
          .querySelectorAll(`td[data-col-id="${editingTarget.id}"]`)
          .forEach((td) => {
            const oldVal = td.querySelector("input")?.value || "";
            td.innerHTML = "";
            const input = buildCellInput(newType);
            if (
              newType !== "number" ||
              oldVal === "" ||
              !Number.isNaN(parseFloat(oldVal))
            ) {
              input.value = oldVal;
            }
            td.appendChild(input);
          });
      }
    }

    hideEditModal();
    // Stay in edit mode so the user can edit another header right away.
  });

  // ---------- Delete ----------

  function handleRemove(kind, id) {
    if (kind === "group") {
      const group = groups.get(id);
      if (!group) return;
      if (
        !confirm(
          `Remove the group "${group.name}" and all its columns? This cannot be undone.`,
        )
      ) {
        return;
      }
      removeGroup(id);
    } else {
      const col = columns.find((c) => c.id === id);
      if (!col) return;
      if (!confirm(`Remove the column "${col.name}"? This cannot be undone.`)) {
        return;
      }
      removeColumn(id);
    }
    // Stay in delete mode so the user can remove more without retoggling.
  }

  function removeColumn(colId) {
    const col = columns.find((c) => c.id === colId);
    if (!col) return;

    const th =
      colRow.querySelector(`th[data-col-id="${colId}"]`) ||
      groupRow.querySelector(`th[data-col-id="${colId}"]`);
    if (th) th.remove();

    tbody
      .querySelectorAll(`td[data-col-id="${colId}"]`)
      .forEach((td) => td.remove());

    if (col.groupId) {
      const remaining = columns.filter(
        (c) => c.groupId === col.groupId && c.id !== colId,
      );
      const groupTh = groupRow.querySelector(
        `th[data-group-id="${col.groupId}"]`,
      );
      if (remaining.length === 0) {
        if (groupTh) groupTh.remove();
        groups.delete(col.groupId);
      } else if (groupTh) {
        groupTh.colSpan = remaining.length;
      }
    }

    columns = columns.filter((c) => c.id !== colId);
  }

  function removeGroup(groupId) {
    const colsInGroup = columns
      .filter((c) => c.groupId === groupId)
      .map((c) => c.id);

    const groupTh = groupRow.querySelector(`th[data-group-id="${groupId}"]`);
    if (groupTh) groupTh.remove();

    colsInGroup.forEach((colId) => {
      const th = colRow.querySelector(`th[data-col-id="${colId}"]`);
      if (th) th.remove();
      tbody
        .querySelectorAll(`td[data-col-id="${colId}"]`)
        .forEach((td) => td.remove());
    });

    columns = columns.filter((c) => c.groupId !== groupId);
    groups.delete(groupId);
  }
})();
