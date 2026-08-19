(function () {
  const listEl = document.getElementById("irc8a-kra-list");
  if (!listEl) return;

  const emptyStateEl = document.getElementById("irc8a-empty-state");
  const summaryEl = document.getElementById("irc8a-summary");
  const summaryWeightEl = document.getElementById("irc8a-summary-weight");
  const summaryWeightHintEl = document.getElementById(
    "irc8a-summary-weight-hint",
  );
  const summaryRatingEl = document.getElementById("irc8a-summary-rating");
  const addKraBtn = document.getElementById("addKraBtn");

  // ================= Modal elements =================
  const modal = document.getElementById("irc8a-entry-modal");
  const modalTitle = document.getElementById("irc8a-entry-modal-title");
  const modalHint = document.getElementById("irc8a-entry-modal-hint");
  const modalClose = document.getElementById("irc8aEntryModalClose");
  const modalCancel = document.getElementById("irc8aEntryModalCancel");
  const modalOverlay = document.getElementById("irc8aEntryModalOverlay");
  const modalSubmit = document.getElementById("irc8aEntryModalSubmit");

  const fieldPrimaryWrap = document.getElementById("irc8a-field-primary");
  const fieldPrimaryLabel = document.getElementById(
    "irc8a-field-primary-label",
  );
  const primaryInput = document.getElementById("irc8a-entry-text");

  const fieldUrlWrap = document.getElementById("irc8a-field-url");
  const urlInput = document.getElementById("irc8a-entry-url");

  const fieldRateWrap = document.getElementById("irc8a-field-rate");
  const rateSelect = document.getElementById("irc8a-entry-rate");

  const fieldWeightWrap = document.getElementById("irc8a-field-weight");
  const fieldWeightLabel = document.getElementById("irc8a-field-weight-label");
  const weightInput = document.getElementById("irc8a-entry-weight");

  // ================= Icons =================
  const ICON_EDIT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
  const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;
  const ICON_PLUS = `<svg class="irc8a-inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>`;
  const ICON_LINK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
  // Banner icons — used in the solid Planning / Evaluation section headers.
  const ICON_CLIPBOARD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><path d="M9 12h6M9 16h6"></path></svg>`;
  const ICON_CHECKLIST = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"></path><path d="M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"></path></svg>`;
  const ICON_CLOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg>`;

  const INDICATOR_CATEGORIES = [
    { key: "quality", label: "Quality" },
    { key: "efficiency", label: "Efficiency" },
    { key: "timeliness", label: "Timeliness" },
  ];

  // Fixed color palette for KRA cards — cycles by list position, not by id,
  // so deleting a KRA re-flows the colors of the ones that remain.
  // Coral has been removed; only 4 hues remain (Violet, Teal, Pink, Amber).
  const KRA_PALETTE_SIZE = 4;

  function kraPaletteClass(kraIndex) {
    return "irc8a-kra-palette-" + ((kraIndex % KRA_PALETTE_SIZE) + 1);
  }

  // ================= State =================
  const state = { kras: [] };
  let kraCounter = 0;
  let objCounter = 0;
  let itemCounter = 0;

  function uid(prefix) {
    return (
      prefix +
      "_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7)
    );
  }

  function newObjective() {
    return {
      id: uid("obj"),
      text: "",
      weight: null,
      isOpen: true,
      quality: [],
      efficiency: [],
      timeliness: [],
      timeline: "",
      mov: null,
      actualResults: "",
      ratings: { quality: "", efficiency: "", timeliness: "" },
    };
  }

  function newKra() {
    return {
      id: uid("kra"),
      text: "",
      weight: null,
      isOpen: true,
      objectives: [],
    };
  }

  // ================= Helpers =================
  function letterLabel(index) {
    let n = index;
    let label = "";
    do {
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return label;
  }

  function fmtWeight(w) {
    if (w === null || w === undefined || w === "" || isNaN(w)) return "—";
    const n = Number(w);
    return (Math.round(n * 100) / 100).toString() + "%";
  }

  function fmtNum(n) {
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  function sumWeights(list) {
    return list.reduce((sum, item) => {
      const w = parseFloat(item.weight);
      return sum + (isNaN(w) ? 0 : w);
    }, 0);
  }

  function computeAverage(obj) {
    const fields = ["quality", "efficiency", "timeliness"];
    let sum = 0;
    let count = 0;
    fields.forEach((f) => {
      const v = obj.ratings[f];
      if (v !== "" && v !== null && v !== undefined && !isNaN(v)) {
        sum += Number(v);
        count++;
      }
    });
    if (count === 0) return null;
    return sum / count;
  }

  function computeScore(obj) {
    const avg = computeAverage(obj);
    const w = parseFloat(obj.weight);
    if (avg === null || isNaN(w)) return null;
    return avg * (w / 100);
  }

  // ================= Render =================
  function render() {
    listEl.innerHTML = "";

    emptyStateEl.style.display = state.kras.length === 0 ? "block" : "none";

    state.kras.forEach((kra, kraIndex) => {
      listEl.appendChild(renderKraCard(kra, kraIndex));
    });

    // Bottom summary: total KRA weight (always visible once a KRA exists, updates live)
    // and overall rating (once at least one objective has a score).
    const totalKraWeight = sumWeights(state.kras);
    let allObjectives = [];
    state.kras.forEach(
      (k) => (allObjectives = allObjectives.concat(k.objectives)),
    );

    if (state.kras.length === 0) {
      summaryEl.style.display = "none";
    } else {
      summaryEl.style.display = "flex";
      updateWeightSummary(totalKraWeight);

      let scoreSum = 0;
      let hasAnyScore = false;
      allObjectives.forEach((o) => {
        const s = computeScore(o);
        if (s !== null) {
          scoreSum += s;
          hasAnyScore = true;
        }
      });
      summaryRatingEl.textContent = hasAnyScore ? fmtNum(scoreSum) : "—";
    }
  }

  function updateWeightSummary(totalKraWeight) {
    const ok = Math.abs(totalKraWeight - 100) < 0.005;
    summaryWeightEl.textContent = fmtWeight(totalKraWeight);
    summaryWeightEl.classList.toggle("irc8a-summary-value--ok", ok);
    summaryWeightEl.classList.toggle("irc8a-summary-value--warn", !ok);
    summaryWeightHintEl.textContent = ok ? "" : "Should total 100%";
  }

  function renderKraCard(kra, kraIndex) {
    const card = document.createElement("div");
    card.className =
      "irc8a-kra-card " +
      kraPaletteClass(kraIndex) +
      (kra.isOpen ? " is-open" : "");
    card.dataset.kraId = kra.id;

    const totalObjWeight = sumWeights(kra.objectives);
    const kraWeightNum = parseFloat(kra.weight);
    const objWarningNeeded =
      kra.objectives.length > 0 &&
      !isNaN(kraWeightNum) &&
      Math.abs(totalObjWeight - kraWeightNum) >= 0.005;

    card.innerHTML = `
      <div class="irc8a-kra-header" data-action="toggle-kra" title="Click to ${kra.isOpen ? "collapse" : "expand"}">
        <div class="irc8a-kra-header-top">
          <span class="irc8a-kra-eyebrow">Key Result Area ${kraIndex + 1}</span>
        </div>
        <div class="irc8a-kra-header-main">
          <span class="irc8a-kra-index">KRA ${kraIndex + 1}</span>
          <span class="irc8a-kra-text">${kra.text ? escapeHtml(kra.text) : '<em style="color:#e4e7ec;">Untitled KRA — click the pencil to describe it</em>'}</span>
          <span class="irc8a-weight-badge irc8a-weight-badge--kra">${fmtWeight(kra.weight)}</span>
          <div class="irc8a-kra-actions">
            <button type="button" class="irc8a-add-btn irc8a-add-btn--sm" data-action="add-objective">${ICON_PLUS}Add Objective</button>
            <button type="button" class="irc8a-icon-btn" data-action="edit-kra" title="Edit KRA">${ICON_EDIT}</button>
            <button type="button" class="irc8a-icon-btn irc8a-icon-btn--danger" data-action="delete-kra" title="Delete KRA">${ICON_TRASH}</button>
          </div>
        </div>
      </div>
      <div class="irc8a-kra-body">
        <div class="irc8a-objectives-list"></div>
        ${
          kra.objectives.length === 0
            ? '<p class="irc8a-indicator-empty">No objectives yet for this KRA.</p>'
            : ""
        }
        ${
          objWarningNeeded
            ? `<div class="irc8a-weight-banner-inline">Objective weights total ${fmtWeight(totalObjWeight)}, but this KRA is weighted ${fmtWeight(kra.weight)}. They should match.</div>`
            : ""
        }
      </div>
    `;

    const objectivesListEl = card.querySelector(".irc8a-objectives-list");
    kra.objectives.forEach((obj, objIndex) => {
      objectivesListEl.appendChild(renderObjectiveCard(kra, obj, objIndex));
    });

    return card;
  }

  function renderObjectiveCard(kra, obj, objIndex) {
    const card = document.createElement("div");
    card.className = "irc8a-objective-card" + (obj.isOpen ? " is-open" : "");
    card.dataset.kraId = kra.id;
    card.dataset.objId = obj.id;

    const score = computeScore(obj);
    const letter = letterLabel(objIndex);

    card.innerHTML = `
      <div class="irc8a-objective-header" data-action="toggle-objective" title="Click to ${obj.isOpen ? "collapse" : "expand"}">
        <div class="irc8a-objective-header-top">
          <span class="irc8a-objective-eyebrow">Objective ${letter}</span>
        </div>
        <div class="irc8a-objective-header-main">
          <span class="irc8a-objective-index">OBJ ${letter}</span>
          <span class="irc8a-objective-text">${obj.text ? escapeHtml(obj.text) : '<em style="color:#aab1bb;">Untitled objective — click the pencil to describe it</em>'}</span>
          <div class="irc8a-objective-meta">
            <span class="irc8a-weight-badge">${fmtWeight(obj.weight)}</span>
          </div>
          <div class="irc8a-objective-actions">
            <button type="button" class="irc8a-icon-btn" data-action="edit-objective" title="Edit objective">${ICON_EDIT}</button>
            <button type="button" class="irc8a-icon-btn irc8a-icon-btn--danger" data-action="delete-objective" title="Delete objective">${ICON_TRASH}</button>
          </div>
        </div>
      </div>
      <div class="irc8a-objective-body">
        <div class="irc8a-obj-section irc8a-obj-section--planning">
          <div class="irc8a-obj-banner irc8a-obj-banner--planning">${ICON_CLIPBOARD}A. Planning &mdash; Performance Indicators</div>
          <div class="irc8a-indicator-groups"></div>
          <div class="irc8a-field-block irc8a-field-block--timeline">
            <div class="irc8a-field-block-header">
              <span class="irc8a-field-block-title">Timeline</span>
              <button type="button" class="irc8a-icon-btn" data-action="edit-timeline" title="Edit timeline">${ICON_EDIT}</button>
            </div>
            <div class="irc8a-actual-box${obj.timeline ? "" : " is-empty"}">${
              obj.timeline
                ? escapeHtml(obj.timeline)
                : "No timeline specified yet."
            }</div>
          </div>
        </div>

        <div class="irc8a-obj-section irc8a-obj-section--evaluation">
          <div class="irc8a-obj-banner irc8a-obj-banner--evaluation">${ICON_CHECKLIST}B. Evaluation &mdash; Results and Rating</div>

          <div class="irc8a-field-row">
            <div class="irc8a-field-block">
              <div class="irc8a-field-block-header">
                <span class="irc8a-field-block-title">Means of Verification (MOV)</span>
                ${
                  obj.mov
                    ? '<button type="button" class="irc8a-icon-btn" data-action="edit-mov" title="Edit link">' +
                      ICON_EDIT +
                      "</button>"
                    : '<button type="button" class="irc8a-add-btn irc8a-add-btn--ghost irc8a-add-btn--sm" data-action="edit-mov">' +
                      ICON_PLUS +
                      "Add Link</button>"
                }
              </div>
              ${renderMovRow(obj)}
            </div>

            <div class="irc8a-field-block">
              <div class="irc8a-field-block-header">
                <span class="irc8a-field-block-title">Actual Results</span>
                <button type="button" class="irc8a-icon-btn" data-action="edit-actual" title="Edit actual results">${ICON_EDIT}</button>
              </div>
              <div class="irc8a-actual-box${obj.actualResults ? "" : " is-empty"}">${
                obj.actualResults
                  ? escapeHtml(obj.actualResults)
                  : "No actual results recorded yet."
              }</div>
            </div>
          </div>

          <div class="irc8a-field-block">
            <div class="irc8a-field-block-header">
              <span class="irc8a-field-block-title">Rating</span>
            </div>
            <div class="irc8a-ratings-grid">
              ${renderRatingField(obj, "quality", "Quality")}
              ${renderRatingField(obj, "efficiency", "Efficiency")}
              ${renderRatingField(obj, "timeliness", "Timeliness")}
              <div class="irc8a-rating-field">
                <label>Average</label>
                <div class="irc8a-rating-readonly" data-role="avg-readout">${(() => {
                  const avg = computeAverage(obj);
                  return avg === null ? "—" : fmtNum(avg);
                })()}</div>
              </div>
            </div>
            <div class="irc8a-score-strip">
              <div>
                <div class="irc8a-score-strip-label">Score</div>
                <div class="irc8a-score-strip-formula">Average &times; Objective Weight</div>
              </div>
              <div class="irc8a-score-strip-value" data-role="score-readout">${score === null ? "—" : fmtNum(score)}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const groupsEl = card.querySelector(".irc8a-indicator-groups");
    INDICATOR_CATEGORIES.forEach((cat) => {
      groupsEl.appendChild(renderIndicatorGroup(obj, cat.key, cat.label));
    });

    return card;
  }

  function renderMovRow(obj) {
    if (!obj.mov) {
      return '<p class="irc8a-mov-empty">No MOV link added yet.</p>';
    }
    return `
      <div class="irc8a-mov-row">
        <a class="irc8a-mov-link" href="${escapeHtml(obj.mov)}" target="_blank" rel="noopener noreferrer">${ICON_LINK}<span>${escapeHtml(obj.mov)}</span></a>
        <button type="button" class="irc8a-icon-btn irc8a-icon-btn--danger" data-action="delete-mov" title="Remove link">${ICON_TRASH}</button>
      </div>
    `;
  }

  function renderRatingField(obj, field, label) {
    const value = obj.ratings[field];
    const options = ["", "1", "2", "3", "4", "5"]
      .map((v) => {
        const text = v === "" ? "Not rated" : v;
        const selected = String(value) === v ? " selected" : "";
        return `<option value="${v}"${selected}>${text}</option>`;
      })
      .join("");
    return `
      <div class="irc8a-rating-field">
        <label>${label}</label>
        <select class="irc8a-rating-select" data-role="rating-select" data-field="${field}">${options}</select>
      </div>
    `;
  }

  // Indicator items are now clickable: clicking one sets that category's
  // rating to the item's rate (single-select — setting a new one replaces
  // the old value). The rating dropdown and the indicator list stay in
  // sync in both directions, since both read from obj.ratings[category].
  function renderIndicatorGroup(obj, category, label) {
    const wrap = document.createElement("div");
    wrap.className = "irc8a-indicator-group";
    wrap.dataset.category = category;

    const items = obj[category].slice().sort((a, b) => b.rate - a.rate);
    const canAddMore = obj[category].length < 5;
    const selectedRate =
      obj.ratings[category] !== "" && obj.ratings[category] != null
        ? Number(obj.ratings[category])
        : null;

    wrap.innerHTML = `
      <div class="irc8a-indicator-group-header">
        <span class="irc8a-indicator-group-title">${label}</span>
        ${
          canAddMore
            ? `<button type="button" class="irc8a-icon-btn" data-action="add-rubric" data-category="${category}" title="Add ${label.toLowerCase()} indicator">${ICON_PLUS.replace('class="irc8a-inline-icon"', 'class=""')}</button>`
            : ""
        }
      </div>
      <div class="irc8a-indicator-list">
        ${
          items.length === 0
            ? `<div class="irc8a-indicator-empty">Not specified.</div>`
            : items
                .map(
                  (item) => `
              <div class="irc8a-indicator-item${item.rate === selectedRate ? " irc8a-indicator-item--selected" : ""}" data-item-id="${item.id}" data-category="${category}" data-action="select-indicator" title="Click to set ${label} rating to ${item.rate}">
                <span class="irc8a-indicator-rate">${item.rate}</span>
                <span class="irc8a-indicator-text">${escapeHtml(item.label)}</span>
                <div class="irc8a-indicator-item-actions">
                  <button type="button" class="irc8a-icon-btn" data-action="edit-rubric" data-category="${category}" data-item-id="${item.id}" title="Edit">${ICON_EDIT}</button>
                  <button type="button" class="irc8a-icon-btn irc8a-icon-btn--danger" data-action="delete-rubric" data-category="${category}" data-item-id="${item.id}" title="Delete">${ICON_TRASH}</button>
                </div>
              </div>`,
                )
                .join("")
        }
      </div>
    `;

    return wrap;
  }

  // ================= Lookups =================
  function findKra(kraId) {
    return state.kras.find((k) => k.id === kraId);
  }

  function findObjective(kraId, objId) {
    const kra = findKra(kraId);
    if (!kra) return null;
    return kra.objectives.find((o) => o.id === objId) || null;
  }

  // ================= Modal control =================
  let modalCtx = null; // { mode, kraId, objId, category, itemId }

  function resetModalFields() {
    fieldPrimaryWrap.style.display = "none";
    fieldUrlWrap.style.display = "none";
    fieldRateWrap.style.display = "none";
    fieldWeightWrap.style.display = "none";
    primaryInput.value = "";
    urlInput.value = "";
    weightInput.value = "";
    rateSelect.innerHTML = "";
  }

  function populateRateOptions(existingRates, currentRate) {
    rateSelect.innerHTML = "";
    for (let r = 5; r >= 1; r--) {
      if (existingRates.includes(r) && r !== currentRate) continue;
      const opt = document.createElement("option");
      opt.value = String(r);
      opt.textContent = String(r);
      rateSelect.appendChild(opt);
    }
    rateSelect.value = currentRate
      ? String(currentRate)
      : rateSelect.options[0]?.value || "";
  }

  function openModal(ctx) {
    modalCtx = ctx;
    resetModalFields();
    modalHint.textContent =
      "Pick the rating level (1–5) this description corresponds to, then describe what earns that level.";

    if (ctx.mode === "add-kra" || ctx.mode === "edit-kra") {
      const isEdit = ctx.mode === "edit-kra";
      const kra = isEdit ? findKra(ctx.kraId) : null;
      modalTitle.textContent = isEdit ? "Edit KRA" : "Add KRA";
      fieldPrimaryWrap.style.display = "block";
      fieldPrimaryLabel.textContent = "KRA Description";
      primaryInput.placeholder = "";
      fieldWeightWrap.style.display = "block";
      fieldWeightLabel.textContent = "Weight (%) — all KRAs should total 100%";
      if (isEdit && kra) {
        primaryInput.value = kra.text || "";
        weightInput.value = kra.weight ?? "";
      }
    } else if (ctx.mode === "add-objective" || ctx.mode === "edit-objective") {
      const isEdit = ctx.mode === "edit-objective";
      const kra = findKra(ctx.kraId);
      const obj = isEdit ? findObjective(ctx.kraId, ctx.objId) : null;
      modalTitle.textContent = isEdit ? "Edit Objective" : "Add Objective";
      fieldPrimaryWrap.style.display = "block";
      fieldPrimaryLabel.textContent = "Objective Description";
      primaryInput.placeholder = "Describe the objective...";
      fieldWeightWrap.style.display = "block";
      fieldWeightLabel.textContent = "Weight (%)";
      if (isEdit && obj) {
        primaryInput.value = obj.text || "";
        weightInput.value = obj.weight ?? "";
      }
    } else if (ctx.mode === "add-rubric" || ctx.mode === "edit-rubric") {
      const isEdit = ctx.mode === "edit-rubric";
      const obj = findObjective(ctx.kraId, ctx.objId);
      const catLabel = INDICATOR_CATEGORIES.find(
        (c) => c.key === ctx.category,
      ).label;
      const existingItems = obj[ctx.category];
      const item = isEdit
        ? existingItems.find((i) => i.id === ctx.itemId)
        : null;
      modalTitle.textContent =
        (isEdit ? "Edit " : "Add ") + catLabel + " Indicator";
      fieldRateWrap.style.display = "block";
      populateRateOptions(
        existingItems.map((i) => i.rate),
        item ? item.rate : null,
      );
      fieldPrimaryWrap.style.display = "block";
      fieldPrimaryLabel.textContent = "Description";
      primaryInput.placeholder =
        "Describe what must be accomplished for this rating level...";
      if (isEdit && item) primaryInput.value = item.label || "";
    } else if (ctx.mode === "edit-mov") {
      const obj = findObjective(ctx.kraId, ctx.objId);
      modalTitle.textContent = obj.mov ? "Edit MOV Link" : "Add MOV Link";
      fieldUrlWrap.style.display = "block";
      urlInput.value = obj.mov || "";
    } else if (ctx.mode === "edit-actual") {
      const obj = findObjective(ctx.kraId, ctx.objId);
      modalTitle.textContent = "Edit Actual Results";
      fieldPrimaryWrap.style.display = "block";
      fieldPrimaryLabel.textContent = "Actual Results";
      primaryInput.placeholder = "Describe what was actually accomplished...";
      primaryInput.value = obj.actualResults || "";
    } else if (ctx.mode === "edit-timeline") {
      const obj = findObjective(ctx.kraId, ctx.objId);
      modalTitle.textContent = "Edit Timeline";
      fieldPrimaryWrap.style.display = "block";
      fieldPrimaryLabel.textContent = "Timeline";
      primaryInput.placeholder =
        "Describe the timeline for accomplishing this objective...";
      primaryInput.value = obj.timeline || "";
    }

    modal.style.display = "flex";
    (fieldPrimaryWrap.style.display !== "none"
      ? primaryInput
      : urlInput
    ).focus();
  }

  function closeModal() {
    modal.style.display = "none";
    modalCtx = null;
  }

  modalClose.addEventListener("click", closeModal);
  modalCancel.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", closeModal);
  document
    .querySelector("#irc8a-entry-modal .irc8a-modal-content")
    .addEventListener("click", (e) => e.stopPropagation());

  modalSubmit.addEventListener("click", () => {
    if (!modalCtx) return;
    const mode = modalCtx.mode;

    if (mode === "add-kra" || mode === "edit-kra") {
      const text = primaryInput.value.trim();
      const weightRaw = weightInput.value.trim();
      if (!text) return alert("Please describe the KRA.");
      const weight = weightRaw === "" ? null : parseFloat(weightRaw);
      if (weightRaw !== "" && (isNaN(weight) || weight < 0 || weight > 100)) {
        return alert("Weight must be a number between 0 and 100.");
      }
      if (mode === "add-kra") {
        const kra = newKra();
        kra.text = text;
        kra.weight = weight;
        state.kras.push(kra);
      } else {
        const kra = findKra(modalCtx.kraId);
        kra.text = text;
        kra.weight = weight;
      }
    } else if (mode === "add-objective" || mode === "edit-objective") {
      const text = primaryInput.value.trim();
      const weightRaw = weightInput.value.trim();
      if (!text) return alert("Please describe the objective.");
      const weight = weightRaw === "" ? null : parseFloat(weightRaw);
      if (weightRaw !== "" && (isNaN(weight) || weight < 0 || weight > 100)) {
        return alert("Weight must be a number between 0 and 100.");
      }
      const kra = findKra(modalCtx.kraId);
      if (mode === "add-objective") {
        const obj = newObjective();
        obj.text = text;
        obj.weight = weight;
        kra.objectives.push(obj);
      } else {
        const obj = findObjective(modalCtx.kraId, modalCtx.objId);
        obj.text = text;
        obj.weight = weight;
      }
    } else if (mode === "add-rubric" || mode === "edit-rubric") {
      const label = primaryInput.value.trim();
      const rate = parseInt(rateSelect.value, 10);
      if (!label) return alert("Please describe this rating level.");
      if (!rate) return alert("Please select a rating level.");
      const obj = findObjective(modalCtx.kraId, modalCtx.objId);
      if (mode === "add-rubric") {
        obj[modalCtx.category].push({ id: uid("item"), rate, label });
      } else {
        const item = obj[modalCtx.category].find(
          (i) => i.id === modalCtx.itemId,
        );
        item.rate = rate;
        item.label = label;
      }
    } else if (mode === "edit-mov") {
      const url = urlInput.value.trim();
      if (!url) return alert("Please paste a link.");
      const obj = findObjective(modalCtx.kraId, modalCtx.objId);
      obj.mov = url;
    } else if (mode === "edit-actual") {
      const text = primaryInput.value.trim();
      const obj = findObjective(modalCtx.kraId, modalCtx.objId);
      obj.actualResults = text;
    } else if (mode === "edit-timeline") {
      const text = primaryInput.value.trim();
      const obj = findObjective(modalCtx.kraId, modalCtx.objId);
      obj.timeline = text;
    }

    closeModal();
    render();
  });

  // ================= Add KRA button =================
  addKraBtn.addEventListener("click", () => openModal({ mode: "add-kra" }));

  // ================= Delegated clicks =================
  listEl.addEventListener("click", (e) => {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    const kraCard = actionEl.closest(".irc8a-kra-card");
    const objCard = actionEl.closest(".irc8a-objective-card");
    const kraId = kraCard ? kraCard.dataset.kraId : null;
    const objId = objCard ? objCard.dataset.objId : null;

    switch (action) {
      case "toggle-kra": {
        // Avoid toggling when clicking an action button inside the header
        if (
          e.target.closest(
            '[data-action="edit-kra"], [data-action="delete-kra"], [data-action="add-objective"]',
          )
        )
          return;
        const kra = findKra(kraId);
        kra.isOpen = !kra.isOpen;
        render();
        break;
      }
      case "edit-kra":
        openModal({ mode: "edit-kra", kraId });
        break;
      case "delete-kra": {
        const kra = findKra(kraId);
        if (
          !confirm(
            `Delete "${kra.text || "this KRA"}" and all of its objectives? This cannot be undone.`,
          )
        )
          return;
        state.kras = state.kras.filter((k) => k.id !== kraId);
        render();
        break;
      }
      case "add-objective":
        openModal({ mode: "add-objective", kraId });
        break;
      case "toggle-objective": {
        if (
          e.target.closest(
            '[data-action="edit-objective"], [data-action="delete-objective"]',
          )
        )
          return;
        const obj = findObjective(kraId, objId);
        obj.isOpen = !obj.isOpen;
        render();
        break;
      }
      case "edit-objective":
        openModal({ mode: "edit-objective", kraId, objId });
        break;
      case "delete-objective": {
        const kra = findKra(kraId);
        const obj = findObjective(kraId, objId);
        if (
          !confirm(
            `Delete objective "${obj.text || "this objective"}"? This cannot be undone.`,
          )
        )
          return;
        kra.objectives = kra.objectives.filter((o) => o.id !== objId);
        render();
        break;
      }
      case "add-rubric":
        openModal({
          mode: "add-rubric",
          kraId,
          objId,
          category: actionEl.dataset.category,
        });
        break;
      case "edit-rubric":
        openModal({
          mode: "edit-rubric",
          kraId,
          objId,
          category: actionEl.dataset.category,
          itemId: actionEl.dataset.itemId,
        });
        break;
      case "delete-rubric": {
        const obj = findObjective(kraId, objId);
        const category = actionEl.dataset.category;
        const itemId = actionEl.dataset.itemId;
        if (!confirm("Remove this indicator? This cannot be undone.")) return;
        obj[category] = obj[category].filter((i) => i.id !== itemId);
        // If the removed indicator was the one driving the rating, clear it.
        if (
          obj.ratings[category] !== "" &&
          !obj[category].some(
            (i) => String(i.rate) === String(obj.ratings[category]),
          )
        ) {
          // Keep the rating as-is; it may have been set manually too.
        }
        render();
        break;
      }
      case "edit-mov":
        openModal({ mode: "edit-mov", kraId, objId });
        break;
      case "delete-mov": {
        const obj = findObjective(kraId, objId);
        if (!confirm("Remove this MOV link?")) return;
        obj.mov = null;
        render();
        break;
      }
      case "edit-actual":
        openModal({ mode: "edit-actual", kraId, objId });
        break;
      case "edit-timeline":
        openModal({ mode: "edit-timeline", kraId, objId });
        break;
      case "select-indicator": {
        // Clicking an indicator sets that category's rating to its rate.
        // Only one indicator per category can "win" — since each item's
        // rate is unique within its category, setting obj.ratings[category]
        // to this item's rate automatically makes this the sole selected
        // item (any previously-selected item for the same category loses
        // its highlight on re-render).
        const obj = findObjective(kraId, objId);
        const category = actionEl.dataset.category;
        const itemId = actionEl.dataset.itemId;
        const item = obj[category].find((i) => i.id === itemId);
        if (!item) return;
        obj.ratings[category] = String(item.rate);
        render();
        break;
      }
    }
  });

  // ================= Ratings: dropdown changes stay in sync with indicators =================
  // A full render() keeps the indicator highlight and the dropdown value
  // consistent with each other in both directions, without duplicating the
  // sync logic. State lives in JS objects, so open/closed states are
  // preserved across the re-render.
  listEl.addEventListener("change", (e) => {
    const select = e.target.closest('[data-role="rating-select"]');
    if (!select) return;

    const objCard = select.closest(".irc8a-objective-card");
    const kraId = objCard.dataset.kraId;
    const objId = objCard.dataset.objId;
    const obj = findObjective(kraId, objId);
    obj.ratings[select.dataset.field] = select.value;

    render();
  });

  // ================= Initial render =================
  render();
})();
