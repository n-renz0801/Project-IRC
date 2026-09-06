(function () {
  const tab = document.getElementById("irc9-tab");
  if (!tab) return;

  // Entries are persisted server-side (see /irc/irc9/data,
  // /irc/irc9/entry, /irc/irc9/import) -- this array is just the local
  // cache of the last-loaded/saved state, kept in sync after each call.
  //
  // Each entry: { id, year, date, incident, output, impact }
  // Paragraph breaks within incident/output/impact are represented as
  // "\n\n" (matching what the backend sends back from PDF extraction,
  // and what a user typing blank lines in a <textarea> naturally
  // produces).
  let entries = [];
  let editingId = null; // id of entry currently being edited, or null for "add"
  let pendingDeleteId = null;

  const YEAR = new Date().getFullYear();

  // Entries staged from a PDF import, awaiting user review/confirmation.
  // Each item: { date, incident, output, impact } (no id yet — assigned
  // on actual import).
  let pendingImportEntries = [];

  // uploaded_files.id of the PDF currently staged for import (set by
  // /irc/irc9/extract, sent back to /irc/irc9/import on confirm), so
  // imported entries link back to the file they came from.
  let currentImportFileId = null;

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
  const saveBtn = document.querySelector('button[form="irc9-form"]');

  const fDate = document.getElementById("irc9-f-date");
  const fIncident = document.getElementById("irc9-f-incident");
  const fOutput = document.getElementById("irc9-f-output");
  const fImpact = document.getElementById("irc9-f-impact");

  const confirmOverlay = document.getElementById("irc9-confirm-overlay");
  const confirmCancelBtn = document.getElementById("irc9-confirm-cancel");
  const confirmDeleteBtn = document.getElementById("irc9-confirm-delete");

  const resetBtn = document.getElementById("irc9-reset-btn");
  const resetConfirmOverlay = document.getElementById(
    "irc9-reset-confirm-overlay",
  );
  const resetConfirmCancelBtn = document.getElementById(
    "irc9-reset-confirm-cancel",
  );
  const resetConfirmConfirmBtn = document.getElementById(
    "irc9-reset-confirm-confirm",
  );

  // PDF import
  const importBtn = document.getElementById("irc9-import-btn");
  const fileInput = document.getElementById("irc9-file-input");
  const importModalOverlay = document.getElementById(
    "irc9-import-modal-overlay",
  );
  const importModalClose = document.getElementById("irc9-import-modal-close");
  const importCancelBtn = document.getElementById("irc9-import-cancel-btn");
  const importConfirmBtn = document.getElementById("irc9-import-confirm-btn");
  const importList = document.getElementById("irc9-import-list");

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  async function apiCall(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      throw new Error(
        "Network error — please check your connection and try again.",
      );
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // no/invalid JSON body
    }
    if (!res.ok) {
      throw new Error(
        (data && data.error) || "Something went wrong. Please try again.",
      );
    }
    return data;
  }

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
  // Add/Edit modal open / close
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

  confirmDeleteBtn.addEventListener("click", async () => {
    if (pendingDeleteId !== null) {
      confirmDeleteBtn.disabled = true;
      try {
        await apiCall("DELETE", `/irc/irc9/entry/${pendingDeleteId}`);
        entries = entries.filter((en) => en.id !== pendingDeleteId);
        renderTable();
      } catch (err) {
        alert(err.message);
      } finally {
        confirmDeleteBtn.disabled = false;
      }
    }
    closeDeleteConfirm();
  });

  // ------------------------------------------------------------------
  // Reset-page confirmation modal
  //
  // No "minimum rows" invariant here (unlike IRC6's Goal/Outcome), so
  // this just deletes every entry. No bulk-delete endpoint exists, so
  // it fires one DELETE per existing entry, same pattern as the
  // single-row delete above.
  // ------------------------------------------------------------------
  function openResetConfirm() {
    resetConfirmOverlay.classList.add("visible");
  }

  function closeResetConfirm() {
    resetConfirmOverlay.classList.remove("visible");
  }

  resetBtn.addEventListener("click", openResetConfirm);
  resetConfirmCancelBtn.addEventListener("click", closeResetConfirm);
  resetConfirmOverlay.addEventListener("click", (e) => {
    if (e.target === resetConfirmOverlay) closeResetConfirm();
  });

  resetConfirmConfirmBtn.addEventListener("click", async () => {
    resetConfirmConfirmBtn.disabled = true;
    try {
      await Promise.all(
        entries.map((en) =>
          apiCall("DELETE", `/irc/irc9/entry/${en.id}`).catch(() => {
            /* Best-effort, same as everywhere else in this file -- a
               failed delete just risks that row reappearing on
               reload. */
          }),
        ),
      );
    } finally {
      entries = [];
      renderTable();
      resetConfirmConfirmBtn.disabled = false;
      closeResetConfirm();
    }
  });

  // ------------------------------------------------------------------
  // Table rendering
  // ------------------------------------------------------------------
  // Renders a text field as one or more <p> paragraphs, splitting on
  // blank lines ("\n\n", possibly with extra whitespace) so genuine
  // paragraph breaks — whether typed by hand or detected from a PDF
  // import — show up as separate justified paragraphs instead of one
  // run-on block. A single leftover "\n" within a paragraph (an
  // ordinary line break, not a paragraph break) is rendered as <br>.
  function cell(value) {
    if (!value) return `<td class="irc9-cell-text">N/A</td>`;

    const paragraphs = value
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (paragraphs.length === 0) {
      return `<td class="irc9-cell-text">N/A</td>`;
    }

    const html = paragraphs
      .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
      .join("");

    return `<td class="irc9-cell-text">${html}</td>`;
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

    entries.forEach((entry) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
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
  // Form submit (manual add/edit)
  // ------------------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const entryData = {
      year: YEAR,
      date: fDate.value,
      incident: fIncident.value.trim(),
      output: fOutput.value.trim(),
      impact: fImpact.value.trim(),
    };
    if (editingId !== null) entryData.id = editingId;

    if (saveBtn) saveBtn.disabled = true;
    try {
      const saved = await apiCall("POST", "/irc/irc9/entry", entryData);
      const idx = entries.findIndex((en) => en.id === saved.id);
      if (idx !== -1) entries[idx] = saved;
      else entries.push(saved);
      renderTable();
      closeModal();
    } catch (err) {
      alert(err.message);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  // ------------------------------------------------------------------
  // PDF import
  // ------------------------------------------------------------------
  importBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handlePdfUpload(e.target.files[0]);
      // reset so re-selecting the same file re-triggers change
      fileInput.value = "";
    }
  });

  function handlePdfUpload(file) {
    if (!file.type.includes("pdf")) {
      alert("Please upload a PDF file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    importBtn.disabled = true;
    importBtn.textContent = "Extracting...";

    fetch("/irc/irc9/extract", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        importBtn.disabled = false;
        importBtn.innerHTML =
          '<i class="ti ti-file-upload"></i> Import from PDF';

        if (data.error) {
          alert("Error: " + data.error);
          return;
        }

        // date_iso/date_raw/incident/output/impact come from the backend
        // with paragraph breaks preserved as "\n\n" — passed straight
        // through into the preview textareas, which render "\n" natively.
        currentImportFileId = data.file_id || null;
        pendingImportEntries = data.entries.map((e) => ({
          date: e.date_iso || "",
          dateRaw: e.date_raw || "",
          incident: e.incident || "",
          output: e.output || "",
          impact: e.impact || "",
        }));

        renderImportList();
        importModalOverlay.classList.add("visible");
      })
      .catch((err) => {
        importBtn.disabled = false;
        importBtn.innerHTML =
          '<i class="ti ti-file-upload"></i> Import from PDF';
        alert("Upload failed: " + err.message);
      });
  }

  function renderImportList() {
    importList.innerHTML = "";

    if (pendingImportEntries.length === 0) {
      importList.innerHTML =
        '<p class="irc9-import-empty">No entries left to import.</p>';
      return;
    }

    pendingImportEntries.forEach((entry, index) => {
      const card = document.createElement("div");
      card.className = "irc9-import-card";
      card.dataset.index = index;

      const dateWarning = !entry.date
        ? `<span class="irc9-import-warning">Could not auto-read this date${
            entry.dateRaw ? ` ("${escapeHtml(entry.dateRaw)}")` : ""
          } — please set it manually.</span>`
        : "";

      card.innerHTML = `
        <div class="irc9-import-card-header">
          <span class="irc9-import-card-title">Entry ${index + 1}</span>
          <button type="button" class="irc9-icon-btn irc9-import-remove-btn" title="Remove from import">&#128465;</button>
        </div>
        <div class="irc9-field">
          <label>Date</label>
          <input type="date" class="irc9-import-f-date" value="${escapeHtml(
            entry.date,
          )}" />
          ${dateWarning}
        </div>
        <div class="irc9-field">
          <label>Critical Incidence Description</label>
          <textarea class="irc9-import-f-incident" rows="4">${escapeHtml(
            entry.incident,
          )}</textarea>
        </div>
        <div class="irc9-field">
          <label>Output</label>
          <textarea class="irc9-import-f-output" rows="4">${escapeHtml(
            entry.output,
          )}</textarea>
        </div>
        <div class="irc9-field">
          <label>Impact on Job / Action Plan</label>
          <textarea class="irc9-import-f-impact" rows="4">${escapeHtml(
            entry.impact,
          )}</textarea>
        </div>
      `;

      importList.appendChild(card);
    });
  }

  // Keep pendingImportEntries in sync as the user edits preview fields
  importList.addEventListener("input", (e) => {
    const card = e.target.closest(".irc9-import-card");
    if (!card) return;
    const index = Number(card.dataset.index);
    const entry = pendingImportEntries[index];
    if (!entry) return;

    if (e.target.matches(".irc9-import-f-date")) entry.date = e.target.value;
    if (e.target.matches(".irc9-import-f-incident"))
      entry.incident = e.target.value;
    if (e.target.matches(".irc9-import-f-output"))
      entry.output = e.target.value;
    if (e.target.matches(".irc9-import-f-impact"))
      entry.impact = e.target.value;
  });

  importList.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".irc9-import-remove-btn");
    if (!removeBtn) return;
    const card = removeBtn.closest(".irc9-import-card");
    const index = Number(card.dataset.index);
    pendingImportEntries.splice(index, 1);
    renderImportList();
  });

  function closeImportModal() {
    importModalOverlay.classList.remove("visible");
    pendingImportEntries = [];
    currentImportFileId = null;
    importList.innerHTML = "";
  }

  importModalClose.addEventListener("click", closeImportModal);
  importCancelBtn.addEventListener("click", closeImportModal);
  importModalOverlay.addEventListener("click", (e) => {
    if (e.target === importModalOverlay) closeImportModal();
  });

  importConfirmBtn.addEventListener("click", async () => {
    if (pendingImportEntries.length === 0) {
      closeImportModal();
      return;
    }

    const payload = {
      year: YEAR,
      fileId: currentImportFileId,
      entries: pendingImportEntries.map((entry) => ({
        date: entry.date,
        incident: entry.incident.trim(),
        output: entry.output.trim(),
        impact: entry.impact.trim(),
      })),
    };

    importConfirmBtn.disabled = true;
    try {
      const data = await apiCall("POST", "/irc/irc9/import", payload);
      entries = entries.concat(data.entries || []);
      renderTable();
      closeImportModal();
    } catch (err) {
      alert(err.message);
    } finally {
      importConfirmBtn.disabled = false;
    }
  });

  // ------------------------------------------------------------------
  // Initial load
  // ------------------------------------------------------------------
  async function loadEntries() {
    try {
      const data = await apiCall("GET", `/irc/irc9/data?year=${YEAR}`);
      entries = data.entries || [];
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="5">Couldn't load entries: ${escapeHtml(err.message)}</td></tr>`;
      return;
    }
    renderTable();
  }

  loadEntries();
})();
