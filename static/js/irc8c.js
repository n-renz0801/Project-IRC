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

  function getRatingBand(value) {
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    if (value < 1 || value > 5) return null;
    for (let i = RATING_CRITERIA.length - 1; i >= 0; i--) {
      if (value >= RATING_CRITERIA[i].min) return RATING_CRITERIA[i];
    }
    return null;
  }

  // ------------------------------------------------------------------
  // IRC8b's subsection titles, duplicated here in trimmed form (key +
  // title + parent section only -- no criteria text, irc8c doesn't need
  // it). Kept in sync by hand with the DATA constant in irc8b.js, same
  // as irc8b.js's own DATA is the one place its criteria text lives.
  // ------------------------------------------------------------------
  const IRC8B_SUBSECTIONS = [
    {
      key: "self_management",
      title: "Self Management",
      section: "Core Behavioral Competencies",
    },
    {
      key: "teamwork",
      title: "Teamwork",
      section: "Core Behavioral Competencies",
    },
    {
      key: "professionalism_ethics",
      title: "Professionalism and Ethics",
      section: "Core Behavioral Competencies",
    },
    {
      key: "service_orientation",
      title: "Service Orientation",
      section: "Core Behavioral Competencies",
    },
    {
      key: "result_focus",
      title: "Result Focus",
      section: "Core Behavioral Competencies",
    },
    {
      key: "innovation",
      title: "Innovation",
      section: "Core Behavioral Competencies",
    },
    { key: "achievement", title: "Achievement", section: "Core Skills" },
    {
      key: "managing_diversity",
      title: "Managing Diversity",
      section: "Core Skills",
    },
    { key: "accountability", title: "Accountability", section: "Core Skills" },
  ];

  // The four fixed Development Plan rows, in display order. "_1"/"_2" give
  // each source (irc8a/irc8b) two independent picks rather than forcing
  // everything into a single row -- see models.py's IRC8CRow docstring.
  const SLOTS = [
    { slot: "irc8a_1", source: "irc8a" },
    { slot: "irc8a_2", source: "irc8a" },
    { slot: "irc8b_1", source: "irc8b" },
    { slot: "irc8b_2", source: "irc8b" },
  ];
  const TOP_N = 5;

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  // rows: { [slot]: { slot, strengthRef, devNeedsRef, actionPlan,
  //                    timeline, resourcesNeeded, isLocked } }
  // irc8aItems / irc8bItems: flattened, ranked candidate lists, rebuilt
  // fresh from IRC8a/IRC8b on every load (see rankIrc8aObjectives /
  // rankIrc8bSubsections below) -- "top 5" is a live computation, not
  // something IRC8c stores or owns.
  const state = {
    year: null,
    finalRating: null,
    rows: {},
    irc8aItems: [], // [{ id, label, average }]
    irc8bItems: [], // [{ id, label, average }]  -- id === subsection key
    edit: null, // row open in the edit modal: { slot, source, refs }
  };

  // ------------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------------
  const finalRatingInput = document.getElementById("irc8c-final-rating");
  const adjectivalCard = document.getElementById("irc8c-adjectival-card");
  const ratingBadge = document.getElementById("irc8c-rating-badge");
  const criteriaStrip = document.getElementById("irc8c-criteria-strip");
  const devTableBody = document.getElementById("irc8c-dev-table-body");

  const editOverlay = document.getElementById("irc8c-edit-overlay");
  const editForm = document.getElementById("irc8c-edit-form");
  const editTitle = document.getElementById("irc8c-edit-title");
  const editSub = document.getElementById("irc8c-edit-sub");
  const editFields = document.getElementById("irc8c-edit-fields");
  const editError = document.getElementById("irc8c-edit-error");
  const editCancelBtn = document.getElementById("irc8c-edit-cancel");
  const editSubmitBtn = document.getElementById("irc8c-edit-submit");

  const resetBtn = document.getElementById("irc8c-reset-btn");
  const resetConfirmOverlay = document.getElementById(
    "irc8c-reset-confirm-overlay",
  );
  const resetConfirmCancelBtn = document.getElementById(
    "irc8c-reset-confirm-cancel",
  );
  const resetConfirmConfirmBtn = document.getElementById(
    "irc8c-reset-confirm-confirm",
  );

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

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

  function average(values) {
    const rated = values.filter(
      (v) => v !== null && v !== undefined && !isNaN(v),
    );
    if (rated.length === 0) return null;
    return rated.reduce((sum, v) => sum + Number(v), 0) / rated.length;
  }

  // ------------------------------------------------------------------
  // Final Rating + Adjectival badge (value comes from state.finalRating,
  // not user input -- the field is readonly)
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
    const value = state.finalRating;

    adjectivalCard.classList.remove(
      "irc8c-badge-1",
      "irc8c-badge-2",
      "irc8c-badge-3",
      "irc8c-badge-4",
      "irc8c-badge-5",
      "irc8c-badge-invalid",
    );

    if (value === null || value === undefined || isNaN(value)) {
      finalRatingInput.value = "";
      ratingBadge.textContent = "\u2014";
      renderCriteriaStrip(null);
      return;
    }

    finalRatingInput.value = (Math.round(value * 1000) / 1000).toString();

    const band = getRatingBand(value);
    if (!band) {
      ratingBadge.textContent = "Out of range";
      adjectivalCard.classList.add("irc8c-badge-invalid");
      renderCriteriaStrip(null);
      return;
    }

    ratingBadge.textContent = `${band.num} \u2013 ${band.label}`;
    adjectivalCard.classList.add(`irc8c-badge-${band.num}`);
    renderCriteriaStrip(band.num);
  }

  // ------------------------------------------------------------------
  // Ranking: rebuilt fresh from IRC8a/IRC8b data on every load. Both
  // produce the same shape ({ id, label, average }) so the dropdown
  // renderer below doesn't need to know which source it's looking at.
  // ------------------------------------------------------------------
  function rankIrc8aObjectives(irc8aData) {
    const items = [];
    (irc8aData.kras || []).forEach((kra) => {
      (kra.objectives || []).forEach((obj) => {
        if (obj.average === null || obj.average === undefined) return;
        const main = obj.text || "(untitled objective)";
        const source = kra.text || "";
        const label = source ? `${source} — ${main}` : main;
        items.push({
          id: String(obj.id),
          label,
          main,
          source,
          average: obj.average,
        });
      });
    });
    return items;
  }

  function rankIrc8bSubsections(irc8bData) {
    const ratings = irc8bData.ratings || {};
    const items = [];
    IRC8B_SUBSECTIONS.forEach((sub) => {
      const values = Object.values(ratings[sub.key] || {});
      const avg = average(values);
      if (avg === null) return;
      items.push({
        id: sub.key,
        label: `${sub.title} (${sub.section})`,
        main: sub.title,
        source: sub.section,
        average: avg,
      });
    });
    return items;
  }

  function topN(items, n, direction) {
    const sorted = items
      .slice()
      .sort((a, b) =>
        direction === "highest" ? b.average - a.average : a.average - b.average,
      );
    return sorted.slice(0, n);
  }

  // ------------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------------
  async function loadAll() {
    try {
      const irc8c = await apiCall("GET", "/irc/irc8c/data");
      state.year = irc8c.year;
      state.finalRating = irc8c.finalRating;
      state.rows = {};
      irc8c.rows.forEach((r) => (state.rows[r.slot] = r));

      const [irc8a, irc8b] = await Promise.all([
        apiCall("GET", `/irc/irc8a/data?year=${state.year}`),
        apiCall("GET", `/irc/irc8b/data?year=${state.year}`),
      ]);
      state.irc8aItems = rankIrc8aObjectives(irc8a);
      state.irc8bItems = rankIrc8bSubsections(irc8b);

      render();
    } catch (err) {
      devTableBody.innerHTML = `<tr class="irc8c-empty-row"><td colspan="6">Couldn't load this page: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // ------------------------------------------------------------------
  // Row persistence
  // ------------------------------------------------------------------
  async function saveRow(slot, patch) {
    const updated = await apiCall("POST", "/irc/irc8c/row", {
      year: state.year,
      slot,
      ...patch,
    });
    state.rows[slot] = updated;
    return updated;
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  function render() {
    updateRatingDisplay();
    renderDevTable();
  }

  function itemsForSource(source) {
    return source === "irc8a" ? state.irc8aItems : state.irc8bItems;
  }

  const FIELD_DEFS = {
    strengthRef: { label: "Strengths", direction: "highest" },
    devNeedsRef: { label: "Development Needs", direction: "lowest" },
  };
  const TEXT_FIELDS = [
    {
      field: "actionPlan",
      label: "Action Plan (Recommended Developmental Intervention)",
    },
    { field: "timeline", label: "Timeline" },
    { field: "resourcesNeeded", label: "Resources Needed" },
  ];
  const SOURCE_LABELS = {
    irc8a: "IRC8a objectives",
    irc8b: "IRC8b competencies",
  };

  // Used inside the edit modal only. `currentRef` is the in-progress pick.
  function renderRefDropdown(field, currentRef, source) {
    const items = itemsForSource(source);
    const direction = FIELD_DEFS[field].direction;
    const candidates = topN(items, TOP_N, direction);

    // Always keep the currently-saved pick in the list, even if it has
    // fallen out of the top N since it was chosen, or -- if the item is
    // gone entirely -- show it as no-longer-available.
    let extra = null;
    if (currentRef && !candidates.some((c) => c.id === currentRef)) {
      const match = items.find((c) => c.id === currentRef);
      extra = match || {
        id: currentRef,
        main: "(previously selected — no longer available)",
        source: "",
        average: null,
        unavailable: true,
      };
    }

    const current = extra || items.find((c) => c.id === currentRef);
    const ranked = candidates.map((c, i) => ({ ...c, rank: i + 1 }));
    const allOptions = extra ? [{ ...extra, rank: null }, ...ranked] : ranked;

    const metaLine = (c) =>
      `${escapeHtml(c.source)}${c.source ? " &middot; " : ""}${c.average.toFixed(2)}`;

    const triggerInner = current
      ? `
        <span class="irc8c-ref-trigger-content">
          <span class="irc8c-ref-main">${escapeHtml(current.main)}</span>
          ${current.unavailable ? "" : `<span class="irc8c-ref-meta">${metaLine(current)}</span>`}
        </span>
      `
      : `<span class="irc8c-ref-trigger-text irc8c-ref-placeholder">— Select —</span>`;

    const rankClass =
      direction === "highest"
        ? "irc8c-ref-rank-positive"
        : "irc8c-ref-rank-negative";

    const optionsHtml = allOptions
      .map((c) => {
        const isSelected = c.id === currentRef;
        const metaHtml = c.unavailable
          ? ""
          : `<p class="irc8c-ref-meta">${metaLine(c)}</p>`;
        const rankHtml = c.rank
          ? `<span class="irc8c-ref-rank ${rankClass}">${c.rank}</span>`
          : `<span class="irc8c-ref-rank irc8c-ref-rank-neutral">&ndash;</span>`;
        return `
          <li role="option" class="irc8c-ref-option${isSelected ? " irc8c-ref-option-selected" : ""}" data-value="${escapeHtml(c.id)}" aria-selected="${isSelected}">
            ${rankHtml}
            <span class="irc8c-ref-option-text">
              <p class="irc8c-ref-main">${escapeHtml(c.main)}</p>
              ${metaHtml}
            </span>
          </li>
        `;
      })
      .join("");

    return `
      <div class="irc8c-ref-dropdown" data-field="${field}">
        <button type="button" class="irc8c-ref-trigger" aria-haspopup="listbox" aria-expanded="false">
          ${triggerInner}
          <span class="irc8c-ref-trigger-caret">&#9662;</span>
        </button>
        <ul class="irc8c-ref-listbox" role="listbox" hidden>
          <li role="option" class="irc8c-ref-option irc8c-ref-option-placeholder" data-value="" aria-selected="${!currentRef}">
            <p class="irc8c-ref-main">— Select —</p>
          </li>
          ${optionsHtml}
        </ul>
      </div>
    `;
  }

  // Table cells are always read-only; edits happen in the modal.
  function renderRefCell(row, field, source) {
    const currentRef = row[field];
    if (!currentRef) {
      return `<td class="irc8c-cell-text"><span class="irc8c-cell-empty">N/A</span></td>`;
    }
    const match = itemsForSource(source).find((c) => c.id === currentRef);
    if (!match) {
      return `<td class="irc8c-cell-text"><span class="irc8c-cell-empty">(previously selected — no longer available)</span></td>`;
    }
    return `
      <td>
        <p class="irc8c-ref-main">${escapeHtml(match.main)}</p>
        <p class="irc8c-ref-meta">${escapeHtml(match.source)}${match.source ? " &middot; " : ""}${match.average.toFixed(2)}</p>
      </td>
    `;
  }

  function renderTextCell(row, field) {
    const value = row[field] || "";
    return `<td class="irc8c-cell-text">${
      value ? escapeHtml(value) : `<span class="irc8c-cell-empty">N/A</span>`
    }</td>`;
  }

  function renderDevTable() {
    devTableBody.innerHTML = SLOTS.map(({ slot, source }, i) => {
      const row = state.rows[slot] || { slot };
      return `
        <tr data-slot="${slot}">
          <td class="irc8c-col-edit">
            <button type="button" class="irc8c-icon-btn irc8c-edit-btn" data-slot="${slot}" title="Edit this row" aria-label="Edit Development Plan row ${i + 1}">
              &#9998;
            </button>
          </td>
          ${renderRefCell(row, "strengthRef", source)}
          ${renderRefCell(row, "devNeedsRef", source)}
          ${renderTextCell(row, "actionPlan")}
          ${renderTextCell(row, "timeline")}
          ${renderTextCell(row, "resourcesNeeded")}
        </tr>
      `;
    }).join("");
  }

  // ------------------------------------------------------------------
  // Edit modal
  //
  // Opens pre-filled with the row's current values. Nothing is saved
  // until Submit; Cancel / Escape / clicking outside discards changes.
  // ------------------------------------------------------------------
  devTableBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".irc8c-edit-btn");
    if (btn) openEditModal(btn.dataset.slot);
  });

  function closeAllDropdowns(exceptListbox) {
    editForm.querySelectorAll(".irc8c-ref-listbox").forEach((listbox) => {
      if (listbox === exceptListbox) return;
      listbox.hidden = true;
      const trigger = listbox.previousElementSibling;
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  }

  // The list floats over the modal (position: fixed) so opening it never
  // changes the modal's height. Under the trigger, or flipped above it
  // when there isn't room below.
  function positionListbox(trigger, listbox) {
    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    const margin = 12;
    const below = window.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const openUp = below < 160 && above > below;
    const room = Math.max(120, openUp ? above : below);

    listbox.style.left = `${rect.left}px`;
    listbox.style.width = `${rect.width}px`;
    listbox.style.maxHeight = `${Math.min(280, room)}px`;
    if (openUp) {
      listbox.style.top = "auto";
      listbox.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
      listbox.style.bottom = "auto";
      listbox.style.top = `${rect.bottom + gap}px`;
    }
  }

  function renderRefEditField(field, source) {
    const def = FIELD_DEFS[field];
    const dir = def.direction === "highest" ? "Top" : "Lowest";
    const hint = `${dir} ${TOP_N} · ${SOURCE_LABELS[source]}`;
    return `
      <div class="irc8c-edit-field">
        <span class="irc8c-edit-label">${escapeHtml(def.label)}<span class="irc8c-edit-hint">${escapeHtml(hint)}</span></span>
        ${renderRefDropdown(field, state.edit.refs[field], source)}
      </div>
    `;
  }

  function renderTextEditField(col, row) {
    const id = `irc8c-edit-${col.field}`;
    return `
      <div class="irc8c-edit-field">
        <label class="irc8c-edit-label" for="${id}">${escapeHtml(col.label)}</label>
        <textarea id="${id}" class="irc8c-edit-input" data-field="${col.field}" rows="3">${escapeHtml(row[col.field] || "")}</textarea>
      </div>
    `;
  }

  function openEditModal(slot) {
    const def = SLOTS.find((s) => s.slot === slot);
    if (!def) return;
    const row = state.rows[slot] || { slot };

    state.edit = {
      slot,
      source: def.source,
      refs: {
        strengthRef: row.strengthRef || "",
        devNeedsRef: row.devNeedsRef || "",
      },
    };

    const rowNum = SLOTS.indexOf(def) + 1;
    editTitle.textContent = "Edit Development Plan";
    editSub.textContent = `Row ${rowNum} · ${SOURCE_LABELS[def.source]}`;
    editFields.innerHTML =
      renderRefEditField("strengthRef", def.source) +
      renderRefEditField("devNeedsRef", def.source) +
      TEXT_FIELDS.map((col) => renderTextEditField(col, row)).join("");
    editError.hidden = true;
    editError.textContent = "";
    editSubmitBtn.disabled = false;
    editOverlay.classList.add("visible");

    const first = editFields.querySelector(".irc8c-ref-trigger");
    if (first) first.focus();
  }

  function closeEditModal() {
    editOverlay.classList.remove("visible");
    editFields.innerHTML = "";
    state.edit = null;
  }

  // Dropdown interactions inside the modal (picks update the draft only).
  editForm.addEventListener("click", (e) => {
    const trigger = e.target.closest(".irc8c-ref-trigger");
    if (trigger) {
      const listbox = trigger.nextElementSibling;
      const wasOpen = !listbox.hidden;
      closeAllDropdowns();
      listbox.hidden = wasOpen;
      if (!wasOpen) positionListbox(trigger, listbox);
      trigger.setAttribute("aria-expanded", String(!wasOpen));
      return;
    }

    const option = e.target.closest(".irc8c-ref-option");
    if (option && state.edit) {
      const dropdown = option.closest(".irc8c-ref-dropdown");
      const field = dropdown.dataset.field;
      state.edit.refs[field] = option.dataset.value;
      dropdown.outerHTML = renderRefDropdown(
        field,
        option.dataset.value,
        state.edit.source,
      );
      return;
    }

    if (!e.target.closest(".irc8c-ref-dropdown")) closeAllDropdowns();
  });

  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.edit) return;
    const { slot, refs } = state.edit;

    const patch = { isLocked: true, ...refs };
    editFields.querySelectorAll("textarea.irc8c-edit-input").forEach((ta) => {
      patch[ta.dataset.field] = ta.value;
    });

    editSubmitBtn.disabled = true;
    editCancelBtn.disabled = true;
    editError.hidden = true;
    try {
      await saveRow(slot, patch);
      renderDevTable();
      closeEditModal();
    } catch (err) {
      editError.textContent = err.message;
      editError.hidden = false;
      editSubmitBtn.disabled = false;
    } finally {
      editCancelBtn.disabled = false;
    }
  });

  editCancelBtn.addEventListener("click", closeEditModal);
  editOverlay.addEventListener("mousedown", (e) => {
    if (e.target === editOverlay) closeEditModal();
  });

  // A floating list would drift away from its trigger if the field area
  // scrolls or the window resizes, so just close it.
  editFields.addEventListener("scroll", () => closeAllDropdowns());
  window.addEventListener("resize", () => closeAllDropdowns());

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !editOverlay.classList.contains("visible"))
      return;
    const open = editForm.querySelector(".irc8c-ref-listbox:not([hidden])");
    if (open) closeAllDropdowns();
    else closeEditModal();
  });

  // ------------------------------------------------------------------
  // Reset-page confirmation modal
  //
  // Single scope, no options -- IRC8c has nothing but these four fixed
  // Development Plan rows to reset (see models.py's IRC8CRow docstring),
  // so unlike IRC7/IRC8a there's no "values only" vs "everything" split.
  // Mirrors IRC6's reset-confirmation modal.
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
      await apiCall("DELETE", `/irc/irc8c/reset?year=${state.year}`);
      await loadAll();
    } catch (err) {
      alert(err.message || "Could not reset the data. Please try again.");
    } finally {
      resetConfirmConfirmBtn.disabled = false;
      closeResetConfirm();
    }
  });

  // ------------------------------------------------------------------
  // Print / Save as PDF
  //
  // Builds a print-only copy of the page laid out like the official
  // "Part II: Summary of Ratings for Discussion" sheet (Final Rating +
  // adjectival abbreviation, Employee-Superior Agreement, Part IV:
  // Development Plans, signatories), then calls window.print(). The
  // styling is the "Print / Save to PDF" section at the end of
  // irc8c.css (letter, portrait). The root is moved to <body> so that
  // stylesheet can hide the rest of the page.
  // ------------------------------------------------------------------
  const printRoot = document.getElementById("irc8c-print-root");
  const printBtn = document.getElementById("irc8c-pdf-btn");
  if (printRoot) document.body.appendChild(printRoot);

  // "Checked by" is fixed on the page itself (see irc8c.html), so it's
  // fixed here too. Keep the name in sync with that markup; the position
  // is worded the way the printed sheet words it.
  const PRINT_CHECKED_BY = {
    name: "DR. JONATHAN P. DOMINGO",
    position: "CHIEF SGOD",
  };

  // Abbreviation the printed sheet shows for the adjectival rating.
  const PRINT_RATING_ABBR = { 1: "P", 2: "U", 3: "S", 4: "VS", 5: "O" };

  // Prepared-by name/position and both signatory dates are kept on the
  // server (the same records the on-page sign-off block reads), so they
  // are fetched fresh on every print.
  const printCache = {
    preparer: { name: "", position: "" },
    dates: { prepared_by: null, checked_by: null },
  };

  const pText = (v) => escapeHtml(v == null ? "" : String(v));
  const pUpper = (v) => pText(v == null ? "" : String(v).toUpperCase());

  function formatPrintDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return "";
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  // Strength / Development Need text: the picked objective's or
  // competency's own text, without the source/average line the on-page
  // table adds under it.
  function printRefText(row, field, source) {
    const ref = row[field];
    if (!ref) return "";
    const match = itemsForSource(source).find((c) => c.id === ref);
    return match ? match.main : "";
  }

  // Table cells are read-only now (edits happen in the modal and are
  // saved on Submit), so the saved row is always what prints.
  function printRowText(slot, field) {
    const row = state.rows[slot] || {};
    return row[field] || "";
  }

  function buildPrintHtml() {
    const value = state.finalRating;
    const hasValue =
      value !== null && value !== undefined && !Number.isNaN(Number(value));
    const band = hasValue ? getRatingBand(Number(value)) : null;
    const ratingText = hasValue ? Number(value).toFixed(2) : "";
    const abbrText = band ? PRINT_RATING_ABBR[band.num] : "";

    const rowsHtml = SLOTS.map(({ slot, source }) => {
      const row = state.rows[slot] || { slot };
      return `<tr>
        <td>${pText(printRefText(row, "strengthRef", source))}</td>
        <td>${pText(printRefText(row, "devNeedsRef", source))}</td>
        <td>${pText(printRowText(slot, "actionPlan"))}</td>
        <td>${pText(printRowText(slot, "timeline"))}</td>
        <td>${pText(printRowText(slot, "resourcesNeeded"))}</td>
      </tr>`;
    }).join("");

    const preparer = printCache.preparer || {};
    const dates = printCache.dates || {};
    const colgroup5 =
      '<colgroup><col style="width:23.02%"><col style="width:25.2%"><col style="width:27.58%"><col style="width:11.3%"><col style="width:12.9%"></colgroup>';

    return `
      <div class="r8c-title">Part II: Summary of Ratings for Discussion</div>

      <table class="r8c-table r8c-summary">
        <colgroup><col style="width:47.8%"><col style="width:52.2%"></colgroup>
        <tbody>
          <tr><td>Final Performance Results Rating</td><td class="r8c-val">${pText(ratingText)}</td></tr>
          <tr><td>Accomplishments of KRAs and Objectives</td><td class="r8c-val">${pText(abbrText)}</td></tr>
        </tbody>
      </table>

      <div class="r8c-heading">Employee-Superior Agreement</div>
      <p class="r8c-agree">The signature below confirm that the employee and his/her superior have agreed to the contents of the performance as captured in this form</p>

      <table class="r8c-table r8c-agreement">
        <colgroup><col style="width:23.02%"><col style="width:25.2%"><col style="width:27.58%"><col style="width:24.2%"></colgroup>
        <tbody>
          <tr class="r8c-agr-name">
            <td>Name of Employee</td><td class="r8c-name">${pUpper(preparer.name)}</td>
            <td>Name of Superior</td><td class="r8c-name">${pUpper(PRINT_CHECKED_BY.name)}</td>
          </tr>
          <tr class="r8c-agr-sign">
            <td>Signature</td><td></td><td>Signature</td><td></td>
          </tr>
          <tr class="r8c-agr-date">
            <td>Date</td><td class="r8c-date">${pText(formatPrintDate(dates.prepared_by))}</td>
            <td>Date</td><td class="r8c-date">${pText(formatPrintDate(dates.checked_by))}</td>
          </tr>
        </tbody>
      </table>

      <div class="r8c-heading-center">Part IV: Development Plans</div>

      <table class="r8c-table r8c-dev">
        ${colgroup5}
        <thead>
          <tr>
            <th>STRENGTHS</th>
            <th>DEVELOPMENT NEEDS</th>
            <th>ACTION PLAN<br>(Recommended Developmental Intervention)</th>
            <th>Timeline</th>
            <th>Resources Needed</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <table class="r8c-signs">
        ${colgroup5}
        <tbody>
          <tr>
            <td><div class="r8c-sign-name">${pUpper(preparer.name)}</div><div class="r8c-sign-role">${pUpper(preparer.position)}</div></td>
            <td></td>
            <td><div class="r8c-sign-name">${pUpper(PRINT_CHECKED_BY.name)}</div><div class="r8c-sign-role">${pUpper(PRINT_CHECKED_BY.position)}</div></td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>`;
  }

  function refreshPrintRoot() {
    if (printRoot) printRoot.innerHTML = buildPrintHtml();
  }

  async function loadPrintExtras() {
    const [p, prep, chk] = await Promise.allSettled([
      apiCall("GET", "/api/preparer"),
      apiCall("GET", "/api/signatory-date/irc8c/prepared_by"),
      apiCall("GET", "/api/signatory-date/irc8c/checked_by"),
    ]);
    if (p.status === "fulfilled") printCache.preparer = p.value;
    if (prep.status === "fulfilled")
      printCache.dates.prepared_by = prep.value.date;
    if (chk.status === "fulfilled")
      printCache.dates.checked_by = chk.value.date;
  }

  if (printBtn && printRoot) {
    printBtn.addEventListener("click", async () => {
      printBtn.disabled = true;
      try {
        await loadPrintExtras();
        refreshPrintRoot();
        window.print();
      } finally {
        printBtn.disabled = false;
      }
    });
    // Ctrl+P / browser menu print gets the same layout from cached data.
    window.addEventListener("beforeprint", refreshPrintRoot);
    loadPrintExtras();
  }

  // ------------------------------------------------------------------
  // Initial load
  // ------------------------------------------------------------------
  renderCriteriaStrip(null);
  loadAll();
})();
