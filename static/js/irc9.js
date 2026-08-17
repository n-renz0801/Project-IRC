(function () {
  const tab = document.getElementById("irc9-tab");
  if (!tab) return;

  // In-memory store of entries. Swap this out for a fetch()/POST to
  // Flask once a persistence layer exists for IRC9.
  //
  // Each entry: { id, date, incident, output, impact }
  let entries = [];
  let editingId = null; // id of entry currently being edited, or null for "add"
  let nextId = 1;
  let pendingDeleteId = null;

  // ------------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------------
  const tableBody = document.getElementById("irc9-table-body");
  const emptyState = document.getElementById("irc9-empty-state");
  const tableWrapper = document.querySelector(".irc9-table-wrapper");

  const addBtn = document.getElementById("irc9-add-btn");
  const modalOverlay = document.getElementById("irc9-modal-overlay");
  const modalTitle = document.getElementById("irc9-modal-title");
  const modalClose = document.getElementById("irc9-modal-close");
  const cancelBtn = document.getElementById("irc9-cancel-btn");
  const form = document.getElementById("irc9-form");

  const fDate = document.getElementById("irc9-f-date");
  const fIncident = document.getElementById("irc9-f-incident");
  const fOutput = document.getElementById("irc9-f-output");
  const fImpact = document.getElementById("irc9-f-impact");

  const confirmOverlay = document.getElementById("irc9-confirm-overlay");
  const confirmCancelBtn = document.getElementById("irc9-confirm-cancel");
  const confirmDeleteBtn = document.getElementById("irc9-confirm-delete");

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  // Formats a yyyy-mm-dd date input value into a readable display
  // string (e.g. "Aug 17, 2026") without timezone drift.
  function formatDate(isoDate) {
    if (!isoDate) return "N/A";
    const [y, m, d] = isoDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // ------------------------------------------------------------------
  // Modal open / close
  // ------------------------------------------------------------------
  function resetForm() {
    form.reset();
  }

  function openModalForAdd() {
    editingId = null;
    modalTitle.textContent = "Add Entry";
    resetForm();
    modalOverlay.classList.add("visible");
    fDate.focus();
  }

  function openModalForEdit(entry) {
    editingId = entry.id;
    modalTitle.textContent = "Edit Entry";
    resetForm();

    fDate.value = entry.date;
    fIncident.value = entry.incident;
    fOutput.value = entry.output;
    fImpact.value = entry.impact;

    modalOverlay.classList.add("visible");
  }

  function closeModal() {
    modalOverlay.classList.remove("visible");
    editingId = null;
  }

  addBtn.addEventListener("click", openModalForAdd);
  modalClose.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // ------------------------------------------------------------------
  // Delete confirmation modal
  // ------------------------------------------------------------------
  function openDeleteConfirm(id) {
    pendingDeleteId = id;
    confirmOverlay.classList.add("visible");
  }

  function closeDeleteConfirm() {
    pendingDeleteId = null;
    confirmOverlay.classList.remove("visible");
  }

  confirmCancelBtn.addEventListener("click", closeDeleteConfirm);
  confirmOverlay.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) closeDeleteConfirm();
  });

  confirmDeleteBtn.addEventListener("click", () => {
    if (pendingDeleteId !== null) {
      entries = entries.filter((en) => en.id !== pendingDeleteId);
      renderTable();
    }
    closeDeleteConfirm();
  });

  // ------------------------------------------------------------------
  // Table rendering
  // ------------------------------------------------------------------
  function cell(value, extraClass) {
    return `<td class="irc9-cell-text${
      extraClass ? " " + extraClass : ""
    }">${escapeHtml(value) || "N/A"}</td>`;
  }

  function renderTable() {
    tableBody.innerHTML = "";

    if (entries.length === 0) {
      tableWrapper.classList.add("irc9-is-empty");
      emptyState.style.display = "block";
      return;
    }
    tableWrapper.classList.remove("irc9-is-empty");
    emptyState.style.display = "none";

    entries.forEach((entry, index) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td class="irc9-cell-date">${formatDate(entry.date)}</td>
        ${cell(entry.incident)}
        ${cell(entry.output)}
        ${cell(entry.impact)}
        <td>
          <div class="irc9-actions-cell">
            <button type="button" class="irc9-icon-btn irc9-edit-btn" data-id="${
              entry.id
            }" title="Edit">&#9998;</button>
            <button type="button" class="irc9-icon-btn irc9-delete-btn" data-id="${
              entry.id
            }" title="Delete">&#128465;</button>
          </div>
        </td>
      `;

      tableBody.appendChild(tr);
    });
  }

  tableBody.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".irc9-edit-btn");
    const deleteBtn = e.target.closest(".irc9-delete-btn");

    if (editBtn) {
      const entry = entries.find((en) => en.id === Number(editBtn.dataset.id));
      if (entry) openModalForEdit(entry);
    }

    if (deleteBtn) {
      openDeleteConfirm(Number(deleteBtn.dataset.id));
    }
  });

  // ------------------------------------------------------------------
  // Form submit
  // ------------------------------------------------------------------
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const entryData = {
      date: fDate.value,
      incident: fIncident.value.trim(),
      output: fOutput.value.trim(),
      impact: fImpact.value.trim(),
    };

    if (editingId !== null) {
      const idx = entries.findIndex((en) => en.id === editingId);
      if (idx !== -1) entries[idx] = { ...entries[idx], ...entryData };
    } else {
      entries.push({ id: nextId++, ...entryData });
    }

    renderTable();
    closeModal();
  });

  // ------------------------------------------------------------------
  // Initial render
  // ------------------------------------------------------------------
  renderTable();
})();
