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

  // ================= Reset button + confirmation modal =================
  const resetBtn = document.getElementById("irc8a-reset-btn");
  const resetConfirmOverlay = document.getElementById(
    "irc8a-reset-confirm-overlay",
  );
  const resetConfirmCancelBtn = document.getElementById(
    "irc8a-reset-confirm-cancel",
  );
  const resetConfirmConfirmBtn = document.getElementById(
    "irc8a-reset-confirm-confirm",
  );
  const resetScopeRadios = document.querySelectorAll(
    'input[name="irc8a-reset-scope"]',
  );
  const resetConfirmWarning = document.getElementById(
    "irc8a-reset-confirm-warning",
  );

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
  // `state.kras` mirrors exactly what GET /irc/irc8a/data returns (each KRA
  // nesting its objectives, each objective nesting its quality/efficiency/
  // timeliness indicator arrays and its `ratings` object) -- there's no
  // more locally-generated data here, everything comes from the server.
  //
  // Expand/collapse is the one piece of UI state the server doesn't know
  // about (and shouldn't -- it's not data, it's how you're currently
  // looking at the data), so it's tracked separately in these two sets
  // rather than mixed into the fetched objects. That way a full re-fetch
  // after any save never resets what's open on screen.
  const state = { kras: [], year: null };
  const openKras = new Set();
  const openObjectives = new Set();

  function id(v) {
    return String(v);
  }

  // ================= API helper =================
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
      // no/invalid JSON body — fall through with data = null
    }
    if (!res.ok) {
      throw new Error(
        (data && data.error) || "Something went wrong. Please try again.",
      );
    }
    return data;
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

  // ================= Lookups =================
  function findKra(kraId) {
    return state.kras.find((k) => id(k.id) === id(kraId));
  }

  function findObjective(kraId, objId) {
    const kra = findKra(kraId);
    if (!kra) return null;
    return kra.objectives.find((o) => id(o.id) === id(objId)) || null;
  }

  // Replaces (or appends) an objective returned by the server into its
  // owning KRA's `objectives` array. Used after every save that returns a
  // full objective — add/edit objective, MOV, actual results, timeline,
  // and rating changes all funnel through here so the local tree always
  // matches what was just persisted.
  function upsertObjective(updatedObj) {
    const kra = findKra(updatedObj.kraId);
    if (!kra) return;
    const idx = kra.objectives.findIndex((o) => id(o.id) === id(updatedObj.id));
    if (idx === -1) kra.objectives.push(updatedObj);
    else kra.objectives[idx] = updatedObj;
  }

  function upsertIndicator(kraId, objId, category, item) {
    const obj = findObjective(kraId, objId);
    if (!obj) return;
    const idx = obj[category].findIndex((i) => id(i.id) === id(item.id));
    if (idx === -1) obj[category].push(item);
    else obj[category][idx] = item;
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
    const isOpen = openKras.has(id(kra.id));
    card.className =
      "irc8a-kra-card " +
      kraPaletteClass(kraIndex) +
      (isOpen ? " is-open" : "");
    card.dataset.kraId = kra.id;

    const totalObjWeight = sumWeights(kra.objectives);
    const kraWeightNum = parseFloat(kra.weight);
    const objWarningNeeded =
      kra.objectives.length > 0 &&
      !isNaN(kraWeightNum) &&
      Math.abs(totalObjWeight - kraWeightNum) >= 0.005;

    card.innerHTML = `
      <div class="irc8a-kra-header" data-action="toggle-kra" title="Click to ${isOpen ? "collapse" : "expand"}">
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
    const isOpen = openObjectives.has(id(obj.id));
    card.className = "irc8a-objective-card" + (isOpen ? " is-open" : "");
    card.dataset.kraId = kra.id;
    card.dataset.objId = obj.id;

    const score = computeScore(obj);
    const letter = letterLabel(objIndex);

    card.innerHTML = `
      <div class="irc8a-objective-header" data-action="toggle-objective" title="Click to ${isOpen ? "collapse" : "expand"}">
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
    const rawValue = obj.ratings[field];
    // ratings coming from the server are numbers (1-5) or null -- normalize
    // to the same "" / "1".."5" string vocabulary the <select> options use.
    const value =
      rawValue === null || rawValue === undefined ? "" : String(rawValue);
    const options = ["", "1", "2", "3", "4", "5"]
      .map((v) => {
        const text = v === "" ? "Not rated" : v;
        const selected = value === v ? " selected" : "";
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

  // Indicator items are clickable: clicking one sets that category's rating
  // to the item's rate (single-select — setting a new one replaces the old
  // value). The rating dropdown and the indicator list stay in sync in both
  // directions, since both read from obj.ratings[category] and both save
  // through the same /objective/<id>/rating endpoint.
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
        ? existingItems.find((i) => id(i.id) === id(ctx.itemId))
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

  function parseWeightInput() {
    const weightRaw = weightInput.value.trim();
    if (weightRaw === "") return { ok: true, weight: null };
    const weight = parseFloat(weightRaw);
    if (isNaN(weight) || weight < 0 || weight > 100) {
      alert("Weight must be a number between 0 and 100.");
      return { ok: false };
    }
    return { ok: true, weight };
  }

  modalSubmit.addEventListener("click", async () => {
    if (!modalCtx) return;
    const mode = modalCtx.mode;

    // Disable while the request is in flight so a double-click can't fire
    // two saves for the same entry.
    modalSubmit.disabled = true;
    try {
      if (mode === "add-kra" || mode === "edit-kra") {
        const text = primaryInput.value.trim();
        if (!text) return alert("Please describe the KRA.");
        const w = parseWeightInput();
        if (!w.ok) return;

        const body = { text, weight: w.weight };
        if (mode === "edit-kra") body.id = modalCtx.kraId;
        else body.year = state.year;

        const kra = await apiCall("POST", "/irc/irc8a/kra", body);
        if (mode === "add-kra") {
          state.kras.push(kra);
          openKras.add(id(kra.id));
        } else {
          const idx = state.kras.findIndex((k) => id(k.id) === id(kra.id));
          if (idx !== -1) state.kras[idx] = kra;
        }
      } else if (mode === "add-objective" || mode === "edit-objective") {
        const text = primaryInput.value.trim();
        if (!text) return alert("Please describe the objective.");
        const w = parseWeightInput();
        if (!w.ok) return;

        const body = { text, weight: w.weight };
        if (mode === "edit-objective") body.id = modalCtx.objId;
        else body.kraId = modalCtx.kraId;

        const obj = await apiCall("POST", "/irc/irc8a/objective", body);
        upsertObjective(obj);
        if (mode === "add-objective") openObjectives.add(id(obj.id));
      } else if (mode === "add-rubric" || mode === "edit-rubric") {
        const label = primaryInput.value.trim();
        const rate = parseInt(rateSelect.value, 10);
        if (!label) return alert("Please describe this rating level.");
        if (!rate) return alert("Please select a rating level.");

        const body = {
          objectiveId: modalCtx.objId,
          category: modalCtx.category,
          rate,
          label,
        };
        if (mode === "edit-rubric") body.id = modalCtx.itemId;

        const item = await apiCall("POST", "/irc/irc8a/indicator", body);
        upsertIndicator(
          modalCtx.kraId,
          modalCtx.objId,
          modalCtx.category,
          item,
        );
      } else if (mode === "edit-mov") {
        const url = urlInput.value.trim();
        if (!url) return alert("Please paste a link.");
        const obj = await apiCall(
          "POST",
          `/irc/irc8a/objective/${modalCtx.objId}/mov`,
          { url },
        );
        upsertObjective(obj);
      } else if (mode === "edit-actual") {
        const text = primaryInput.value.trim();
        const obj = await apiCall(
          "POST",
          `/irc/irc8a/objective/${modalCtx.objId}/actual-results`,
          { text },
        );
        upsertObjective(obj);
      } else if (mode === "edit-timeline") {
        const text = primaryInput.value.trim();
        const obj = await apiCall(
          "POST",
          `/irc/irc8a/objective/${modalCtx.objId}/timeline`,
          { text },
        );
        upsertObjective(obj);
      }

      closeModal();
      render();
    } catch (err) {
      alert(err.message);
    } finally {
      modalSubmit.disabled = false;
    }
  });

  // ================= Add KRA button =================
  addKraBtn.addEventListener("click", () => openModal({ mode: "add-kra" }));

  // ================= RESET: RATINGS & MOV ONLY, OR ENTIRE FORM =================
  //
  // Two scopes, chosen via the modal's radio buttons and sent as
  // ?scope=ratings_mov|all to /irc/irc8a/reset:
  //
  //  - "ratings_mov" (default): only each objective's three ratings
  //    (quality/efficiency/timeliness) and its MOV link are cleared
  //    server-side. KRAs, objectives, weights, rubric indicators,
  //    timeline, and actual results are never touched.
  //  - "all": every KRA for this year is deleted outright, which cascades
  //    to its objectives and their rubric indicators too (see
  //    reset_irc8a_data() in app.py) -- the form goes back to empty.
  const RESET_WARNINGS = {
    ratings_mov:
      "This will clear every rating and MOV link, but keeps your KRAs, objectives, and their weights. This cannot be undone.",
    all: "This will remove every KRA, objective, and rubric indicator, along with everything typed into them. This cannot be undone.",
  };

  function getSelectedResetScope() {
    const checked = document.querySelector(
      'input[name="irc8a-reset-scope"]:checked',
    );
    return checked ? checked.value : "ratings_mov";
  }

  function updateResetWarning() {
    const scope = getSelectedResetScope();
    resetConfirmWarning.textContent =
      RESET_WARNINGS[scope] || RESET_WARNINGS.ratings_mov;
    resetConfirmWarning.classList.toggle(
      "irc8a-reset-warning--danger",
      scope === "all",
    );
  }

  resetScopeRadios.forEach((radio) => {
    radio.addEventListener("change", updateResetWarning);
  });

  function openResetConfirm() {
    // Always reopen on the safer "ratings & MOV only" option rather than
    // remembering whatever was picked last time.
    const ratingsRadio = document.getElementById("irc8a-reset-scope-ratings");
    if (ratingsRadio) ratingsRadio.checked = true;
    updateResetWarning();
    resetConfirmOverlay.classList.add("visible");
  }

  function closeResetConfirm() {
    resetConfirmOverlay.classList.remove("visible");
  }

  function clearAllRatingsAndMovInPlace() {
    state.kras.forEach((kra) => {
      kra.objectives.forEach((obj) => {
        obj.ratings = { quality: null, efficiency: null, timeliness: null };
        obj.mov = null;
      });
    });
    render();
  }

  function removeAllKrasInPlace() {
    state.kras = [];
    openKras.clear();
    openObjectives.clear();
    render();
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
      const data = await apiCall(
        "DELETE",
        `/irc/irc8a/reset?scope=${scope}&year=${state.year}`,
      );
      if (data && data.scope === "all") {
        removeAllKrasInPlace();
      } else {
        clearAllRatingsAndMovInPlace();
      }
    } catch (err) {
      alert(err.message || "Could not reset the data. Please try again.");
    } finally {
      resetConfirmConfirmBtn.disabled = false;
      closeResetConfirm();
    }
  });

  // ================= Delegated clicks =================
  listEl.addEventListener("click", async (e) => {
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
        if (openKras.has(id(kraId))) openKras.delete(id(kraId));
        else openKras.add(id(kraId));
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
        try {
          await apiCall("DELETE", `/irc/irc8a/kra/${kraId}`);
          state.kras = state.kras.filter((k) => id(k.id) !== id(kraId));
          openKras.delete(id(kraId));
          render();
        } catch (err) {
          alert(err.message);
        }
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
        if (openObjectives.has(id(objId))) openObjectives.delete(id(objId));
        else openObjectives.add(id(objId));
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
        try {
          await apiCall("DELETE", `/irc/irc8a/objective/${objId}`);
          kra.objectives = kra.objectives.filter((o) => id(o.id) !== id(objId));
          openObjectives.delete(id(objId));
          render();
        } catch (err) {
          alert(err.message);
        }
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
        try {
          await apiCall("DELETE", `/irc/irc8a/indicator/${itemId}`);
          // The selected rating (obj.ratings[category]) is intentionally
          // left as-is even if it was this indicator's rate -- it may
          // have been set manually too, and the server never derives it
          // from the indicator list (see models.py's IRC8AObjective docs).
          obj[category] = obj[category].filter((i) => id(i.id) !== id(itemId));
          render();
        } catch (err) {
          alert(err.message);
        }
        break;
      }
      case "edit-mov":
        openModal({ mode: "edit-mov", kraId, objId });
        break;
      case "delete-mov": {
        try {
          const obj = await apiCall(
            "POST",
            `/irc/irc8a/objective/${objId}/mov`,
            { url: "" },
          );
          upsertObjective(obj);
          render();
        } catch (err) {
          alert(err.message);
        }
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
        const item = obj[category].find((i) => id(i.id) === id(itemId));
        if (!item) return;
        try {
          const updated = await apiCall(
            "POST",
            `/irc/irc8a/objective/${objId}/rating`,
            { category, rating: item.rate },
          );
          upsertObjective(updated);
          render();
        } catch (err) {
          alert(err.message);
        }
        break;
      }
    }
  });

  // ================= Ratings: dropdown changes stay in sync with indicators =================
  // A full render() keeps the indicator highlight and the dropdown value
  // consistent with each other in both directions, without duplicating the
  // sync logic. Both directions save through the same rating endpoint, so
  // the server is always the single source of truth for obj.ratings.
  listEl.addEventListener("change", async (e) => {
    const select = e.target.closest('[data-role="rating-select"]');
    if (!select) return;

    const objCard = select.closest(".irc8a-objective-card");
    const objId = objCard.dataset.objId;
    const category = select.dataset.field;
    const rating = select.value === "" ? null : parseInt(select.value, 10);

    try {
      const updated = await apiCall(
        "POST",
        `/irc/irc8a/objective/${objId}/rating`,
        { category, rating },
      );
      upsertObjective(updated);
      render();
    } catch (err) {
      alert(err.message);
      render(); // revert the dropdown to the last-saved value
    }
  });

  // ================= Initial load =================
  async function init() {
    try {
      const data = await apiCall("GET", "/irc/irc8a/data");
      state.year = data.year;
      state.kras = data.kras;
      // Everything starts expanded on a fresh load, matching the old
      // in-memory default (newKra()/newObjective() both set isOpen: true).
      state.kras.forEach((kra) => {
        openKras.add(id(kra.id));
        kra.objectives.forEach((obj) => openObjectives.add(id(obj.id)));
      });
      render();
    } catch (err) {
      listEl.innerHTML = "";
      emptyStateEl.style.display = "none";
      const errBox = document.createElement("p");
      errBox.className = "irc8a-indicator-empty";
      errBox.textContent = "Couldn't load this report: " + err.message;
      listEl.appendChild(errBox);
    }
  }

  init();
})();
