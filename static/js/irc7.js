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

  // ---------- Data model for added groups/columns ----------
  // groups: Map<groupId, { id, name }>
  // columns: array of { id, name, type, groupId|null } in display order
  const groups = new Map();
  let columns = [];
  let colCounter = 0;
  let groupCounter = 0;

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
        // Gather consecutive columns that share this same group name
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

  function buildGroupHeaderCell(groupId, name, span) {
    const th = document.createElement("th");
    th.className = "irc7-group-header irc7-added-header";
    th.colSpan = span;
    th.dataset.groupId = groupId;
    th.innerHTML = `
      <span class="irc7-header-text">${escapeHtml(name)}</span>
      <span class="irc7-header-actions">
        <button type="button" class="irc7-header-action-btn irc7-edit-btn" data-kind="group" data-id="${groupId}" title="Edit group">
          <i class="ti ti-pencil"></i>
        </button>
        <button type="button" class="irc7-header-action-btn irc7-remove-btn" data-kind="group" data-id="${groupId}" title="Remove group">
          <i class="ti ti-trash"></i>
        </button>
      </span>
    `;
    return th;
  }

  function buildColumnHeaderCell(colId, name) {
    const th = document.createElement("th");
    th.className = "irc7-sub-header irc7-added-header irc7-fixed-col";
    th.dataset.colId = colId;
    th.innerHTML = `
      <span class="irc7-header-text">${escapeHtml(name)}</span>
      <span class="irc7-header-actions">
        <button type="button" class="irc7-header-action-btn irc7-edit-btn" data-kind="column" data-id="${colId}" title="Edit column">
          <i class="ti ti-pencil"></i>
        </button>
        <button type="button" class="irc7-header-action-btn irc7-remove-btn" data-kind="column" data-id="${colId}" title="Remove column">
          <i class="ti ti-trash"></i>
        </button>
      </span>
    `;
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

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ================= EDIT / REMOVE (event delegation on headers) =================

  let editingTarget = null; // { kind: 'column'|'group', id }

  function onHeaderClick(e) {
    const editBtn = e.target.closest(".irc7-edit-btn");
    const removeBtn = e.target.closest(".irc7-remove-btn");

    if (editBtn) {
      openEditModal(editBtn.dataset.kind, editBtn.dataset.id);
    } else if (removeBtn) {
      handleRemove(removeBtn.dataset.kind, removeBtn.dataset.id);
    }
  }

  groupRow.addEventListener("click", onHeaderClick);
  colRow.addEventListener("click", onHeaderClick);

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
        `th[data-group-id="${editingTarget.id}"] .irc7-header-text`,
      );
      if (th) th.textContent = newName;
    } else {
      const col = columns.find((c) => c.id === editingTarget.id);
      const newType = editTypeSelect.value;
      const typeChanged = col.type !== newType;
      col.name = newName;
      col.type = newType;

      const th = colRow.querySelector(
        `th[data-col-id="${editingTarget.id}"] .irc7-header-text`,
      );
      if (th) th.textContent = newName;

      if (typeChanged) {
        tbody
          .querySelectorAll(`td[data-col-id="${editingTarget.id}"]`)
          .forEach((td) => {
            const oldVal = td.querySelector("input")?.value || "";
            td.innerHTML = "";
            const input = buildCellInput(newType);
            // Only carry the value over if it's still valid for the new type
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
  });

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
  }

  function removeColumn(colId) {
    const col = columns.find((c) => c.id === colId);
    if (!col) return;

    // Remove header cell
    const th =
      colRow.querySelector(`th[data-col-id="${colId}"]`) ||
      groupRow.querySelector(`th[data-col-id="${colId}"]`);
    if (th) th.remove();

    // Remove body cells
    tbody
      .querySelectorAll(`td[data-col-id="${colId}"]`)
      .forEach((td) => td.remove());

    // Update or remove parent group header's colspan
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
