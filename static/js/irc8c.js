(function () {
  const tab = document.getElementById("irc8c-tab");
  if (!tab) return;

  // ------------------------------------------------------------------
  // Rating criteria reference data
  // ------------------------------------------------------------------
  const RATING_CRITERIA = [
    { num: 1, label: "Poor", range: "1.000 – 1.499", min: 1.0 },
    { num: 2, label: "Unsatisfactory", range: "1.500 – 2.499", min: 1.5 },
    { num: 3, label: "Satisfactory", range: "2.500 – 3.499", min: 2.5 },
    { num: 4, label: "Very Satisfactory", range: "3.500 – 4.499", min: 3.5 },
    { num: 5, label: "Outstanding", range: "4.500 – 5.000", min: 4.5 },
  ];

  // Matches optional leading digits, an optional single decimal point,
  // and more digits - i.e. free-form typing of a decimal number.
  // Used to keep the final-rating field "pure typing" (no native
  // number spinner, no auto-formatting while the user is mid-type).
  const PARTIAL_DECIMAL_RE = /^\d*\.?\d*$/;

  function getRatingBand(value) {
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    if (value < 1 || value > 5) return null;
    for (let i = RATING_CRITERIA.length - 1; i >= 0; i--) {
      if (value >= RATING_CRITERIA[i].min) return RATING_CRITERIA[i];
    }
    return null;
  }

  // ------------------------------------------------------------------
  // In-memory store of Development Plan entries. Swap this out for a
  // fetch()/POST to Flask once a persistence layer exists for IRC8c.
  //
  // Each entry: { id, strengths, devNeeds, actionPlan, timeline, resources }
  // ------------------------------------------------------------------
  let entries = [];
  let editingId = null; // id of entry currently being edited, or null for "add"
  let nextId = 1;
  let pendingDeleteId = null;

  // ------------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------------
  const finalRatingInput = document.getElementById("irc8c-final-rating");
  const adjectivalCard = document.getElementById("irc8c-adjectival-card");
  const ratingBadge = document.getElementById("irc8c-rating-badge");
  const criteriaStrip = document.getElementById("irc8c-criteria-strip");

  const devTableBody = document.getElementById("irc8c-dev-table-body");

  const addBtn = document.getElementById("irc8c-add-btn");
  const modalOverlay = document.getElementById("irc8c-modal-overlay");
  const modalTitle = document.getElementById("irc8c-modal-title");
  const modalClose = document.getElementById("irc8c-modal-close");
  const cancelBtn = document.getElementById("irc8c-cancel-btn");
  const form = document.getElementById("irc8c-form");

  const fStrengths = document.getElementById("irc8c-f-strengths");
  const fDevNeeds = document.getElementById("irc8c-f-devneeds");
  const fActionPlan = document.getElementById("irc8c-f-actionplan");
  const fTimeline = document.getElementById("irc8c-f-timeline");
  const fResources = document.getElementById("irc8c-f-resources");

  const confirmOverlay = document.getElementById("irc8c-confirm-overlay");
  const confirmCancelBtn = document.getElementById("irc8c-confirm-cancel");
  const confirmDeleteBtn = document.getElementById("irc8c-confirm-delete");

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  // ------------------------------------------------------------------
  // Final Rating input: plain text field, digits + one decimal point
  // only. No native number spinner, no keystroke reformatting.
  // ------------------------------------------------------------------
  finalRatingInput.addEventListener("beforeinput", (e) => {
    if (e.data == null) return; // deletions, paste-clear, etc. are fine
    const prospective =
      finalRatingInput.value.slice(0, finalRatingInput.selectionStart) +
      e.data +
      finalRatingInput.value.slice(finalRatingInput.selectionEnd);
    if (!PARTIAL_DECIMAL_RE.test(prospective)) {
      e.preventDefault();
    }
  });

  finalRatingInput.addEventListener("input", updateRatingDisplay);

  // ------------------------------------------------------------------
  // Criteria strip + Adjectival badge
  // ------------------------------------------------------------------
  function renderCriteriaStrip(activeNum) {
    criteriaStrip.innerHTML = RATING_CRITERIA.map((band) => {
      const isActive = activeNum === band.num;
      return `
        <div class="irc8c-criteria-chip${isActive ? ` irc8c-chip-${band.num}` : ""}">
          <span class="irc8c-criteria-num">${band.num}</span>
          <span class="irc8c-criteria-label">${band.label}</span>
          <span class="irc8c-criteria-range">${band.range}</span>
        </div>
      `;
    }).join("");
  }

  function updateRatingDisplay() {
    const raw = finalRatingInput.value.trim();
    const value = raw === "" ? NaN : parseFloat(raw);
    const band = getRatingBand(value);

    adjectivalCard.classList.remove(
      "irc8c-badge-1",
      "irc8c-badge-2",
      "irc8c-badge-3",
      "irc8c-badge-4",
      "irc8c-badge-5",
      "irc8c-badge-invalid",
    );

    if (raw === "") {
      ratingBadge.textContent = "\u2014";
      renderCriteriaStrip(null);
      return;
    }

    if (!band) {
      ratingBadge.textContent = "Invalid rating";
      adjectivalCard.classList.add("irc8c-badge-invalid");
      renderCriteriaStrip(null);
      return;
    }

    ratingBadge.textContent = `${band.num} \u2013 ${band.label}`;
    adjectivalCard.classList.add(`irc8c-badge-${band.num}`);
    renderCriteriaStrip(band.num);
  }

  // ------------------------------------------------------------------
  // Modal open / close (Development Plan entries)
  // ------------------------------------------------------------------
  function resetForm() {
    form.reset();
  }

  function openModalForAdd() {
    editingId = null;
    modalTitle.textContent = "Add Development Plan Entry";
    resetForm();
    modalOverlay.classList.add("visible");
    fStrengths.focus();
  }

  function openModalForEdit(entry) {
    editingId = entry.id;
    modalTitle.textContent = "Edit Development Plan Entry";
    resetForm();

    fStrengths.value = entry.strengths;
    fDevNeeds.value = entry.devNeeds;
    fActionPlan.value = entry.actionPlan;
    fTimeline.value = entry.timeline;
    fResources.value = entry.resources;

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
      renderDevTable();
    }
    closeDeleteConfirm();
  });

  // ------------------------------------------------------------------
  // Development Plan table rendering (no "No." column - rows are
  // identified only by their action buttons' data-id)
  // ------------------------------------------------------------------
  function cell(value) {
    const text = value ? escapeHtml(value) : "";
    return `<td class="irc8c-cell-text">${
      text || '<span class="irc8c-cell-empty">N/A</span>'
    }</td>`;
  }

  function renderDevTable() {
    if (entries.length === 0) {
      devTableBody.innerHTML = `
        <tr class="irc8c-empty-row">
          <td colspan="6">No development plan entries yet. Click &ldquo;Add Entry&rdquo; to get started.</td>
        </tr>
      `;
      return;
    }

    devTableBody.innerHTML = entries
      .map(
        (entry) => `
      <tr>
        ${cell(entry.strengths)}
        ${cell(entry.devNeeds)}
        ${cell(entry.actionPlan)}
        ${cell(entry.timeline)}
        ${cell(entry.resources)}
        <td>
          <div class="irc8c-actions-cell">
            <button type="button" class="irc8c-icon-btn irc8c-edit-btn" data-id="${entry.id}" title="Edit">&#9998;</button>
            <button type="button" class="irc8c-icon-btn irc8c-delete-btn" data-id="${entry.id}" title="Delete">&#128465;</button>
          </div>
        </td>
      </tr>
    `,
      )
      .join("");
  }

  devTableBody.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".irc8c-edit-btn");
    const deleteBtn = e.target.closest(".irc8c-delete-btn");

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
      strengths: fStrengths.value.trim(),
      devNeeds: fDevNeeds.value.trim(),
      actionPlan: fActionPlan.value.trim(),
      timeline: fTimeline.value.trim(),
      resources: fResources.value.trim(),
    };

    if (editingId !== null) {
      const idx = entries.findIndex((en) => en.id === editingId);
      if (idx !== -1) entries[idx] = { ...entries[idx], ...entryData };
    } else {
      entries.push({ id: nextId++, ...entryData });
    }

    renderDevTable();
    closeModal();
  });

  // ------------------------------------------------------------------
  // Initial render
  // ------------------------------------------------------------------
  renderCriteriaStrip(null);
  renderDevTable();
})();
