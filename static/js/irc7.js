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

  let colCounter = 0;

  // ---------- Modal: building group/column rows dynamically ----------

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

  function resetModal() {
    groupsContainer.innerHTML = "";
    groupsContainer.appendChild(createGroupBlock());
  }

  function showModal() {
    resetModal();
    modal.style.display = "flex";
  }

  function hideModal() {
    modal.style.display = "none";
  }

  addColumnBtn.addEventListener("click", showModal);
  modalClose.addEventListener("click", hideModal);
  modalCancel.addEventListener("click", hideModal);
  modalOverlay.addEventListener("click", hideModal);
  document
    .querySelector(".irc7-modal-content")
    .addEventListener("click", (e) => e.stopPropagation());

  addGroupBtn.addEventListener("click", () => {
    groupsContainer.appendChild(createGroupBlock());
  });

  // ---------- Submit: collect columns and add them to the table ----------

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
          newColumns.push({
            name,
            type,
            group: groupName || null,
          });
        }
      });
    });

    if (newColumns.length === 0) {
      alert("Please add at least one column with a name.");
      return;
    }

    addColumnsToTable(newColumns);
    hideModal();
  });

  // ---------- Table mutation: append new columns to header + body ----------

  function addColumnsToTable(newColumns) {
    let i = 0;
    while (i < newColumns.length) {
      const col = newColumns[i];

      if (col.group) {
        // Gather consecutive columns that share this same group name
        let j = i;
        const groupCols = [];
        while (j < newColumns.length && newColumns[j].group === col.group) {
          groupCols.push(newColumns[j]);
          j++;
        }

        const groupTh = document.createElement("th");
        groupTh.colSpan = groupCols.length;
        groupTh.className = "irc7-group-header";
        groupTh.textContent = col.group;
        groupRow.appendChild(groupTh);

        groupCols.forEach((c) => {
          const th = document.createElement("th");
          th.className = "irc7-sub-header";
          th.textContent = c.name;
          colRow.appendChild(th);
          appendCellToRows(c);
        });

        i = j;
      } else {
        const th = document.createElement("th");
        th.rowSpan = 2;
        th.className = "irc7-fixed-col irc7-added-col";
        th.textContent = col.name;
        groupRow.appendChild(th);
        appendCellToRows(col);
        i++;
      }
    }
  }

  function appendCellToRows(col) {
    colCounter++;
    const colId = "custom-" + colCounter;

    tbody.querySelectorAll("tr").forEach((tr) => {
      const td = document.createElement("td");
      td.className = "irc7-editable-cell";
      td.dataset.colId = colId;
      td.dataset.colType = col.type;

      const input = document.createElement("input");
      input.type = col.type === "number" ? "number" : "text";
      input.className = "irc7-cell-input irc7-cell-input--" + col.type;
      if (col.type === "number") {
        input.step = "any";
      }
      if (col.type === "paragraph") {
        input.placeholder = "Enter text...";
      }

      td.appendChild(input);
      tr.appendChild(td);
    });
  }
})();
