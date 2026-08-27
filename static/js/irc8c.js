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
  };

  // ------------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------------
  const finalRatingInput = document.getElementById("irc8c-final-rating");
  const adjectivalCard = document.getElementById("irc8c-adjectival-card");
  const ratingBadge = document.getElementById("irc8c-rating-badge");
  const criteriaStrip = document.getElementById("irc8c-criteria-strip");
  const devTableBody = document.getElementById("irc8c-dev-table-body");

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

  function renderRefDropdown(row, field, source) {
    const items = itemsForSource(source);
    const currentRef = row[field];
    const direction = field === "strengthRef" ? "highest" : "lowest";
    const candidates = topN(items, TOP_N, direction);

    // Always keep the currently-saved pick in the list, even if it's
    // fallen out of the top 5 since it was chosen, or -- if the
    // objective/subsection is gone entirely -- show it as
    // no-longer-available rather than silently dropping the selection.
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
    const rankedCandidates = candidates.map((c, i) => ({ ...c, rank: i + 1 }));
    const allOptions = extra
      ? [{ ...extra, rank: null }, ...rankedCandidates]
      : rankedCandidates;

    const triggerInner = current
      ? `
        <span class="irc8c-ref-trigger-content">
          <span class="irc8c-ref-main">${escapeHtml(current.main)}</span>
          ${
            current.unavailable
              ? ""
              : `<span class="irc8c-ref-meta">${escapeHtml(current.source)}${current.source ? " &middot; " : ""}${current.average.toFixed(2)}</span>`
          }
        </span>
      `
      : `<span class="irc8c-ref-trigger-text irc8c-ref-placeholder">— Select —</span>`;

    const rankClass =
      field === "strengthRef"
        ? "irc8c-ref-rank-positive"
        : "irc8c-ref-rank-negative";

    const optionsHtml = allOptions
      .map((c) => {
        const isSelected = c.id === currentRef;
        const metaHtml = c.unavailable
          ? ""
          : `<p class="irc8c-ref-meta">${escapeHtml(c.source)}${c.source ? " &middot; " : ""}${c.average.toFixed(2)}</p>`;
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
      <div class="irc8c-ref-dropdown" data-field="${field}" data-slot="${row.slot}">
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

  // Locked view for Strengths / Development Needs: plain read text, no
  // dropdown present at all, so nothing is clickable and nothing is
  // ellipsis-truncated the way a native <select> would be. The
  // dropdown only exists while the row is unlocked (see
  // renderRefDropdown).
  function renderLockedRefCell(row, field, source, placeholderLabel) {
    const currentRef = row[field];
    if (!currentRef) {
      return `<td class="irc8c-cell-text"><span class="irc8c-cell-empty">${escapeHtml(placeholderLabel)}</span></td>`;
    }
    const items = itemsForSource(source);
    const match = items.find((c) => c.id === currentRef);
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

  function renderTextCell(row, field, placeholderLabel) {
    const value = row[field] || "";
    if (row.isLocked) {
      return `<td class="irc8c-cell-text">${
        value
          ? escapeHtml(value)
          : `<span class="irc8c-cell-empty">${escapeHtml(placeholderLabel)}</span>`
      }</td>`;
    }
    return `<td><textarea class="irc8c-cell-edit" data-field="${field}" data-slot="${row.slot}" rows="2" placeholder="${escapeHtml(placeholderLabel)}">${escapeHtml(value)}</textarea></td>`;
  }

  function renderDevTable() {
    devTableBody.innerHTML = SLOTS.map(({ slot, source }) => {
      const row = state.rows[slot] || { slot, isLocked: true };
      const strengthCell = row.isLocked
        ? renderLockedRefCell(row, "strengthRef", source, "N/A")
        : `<td>${renderRefDropdown(row, "strengthRef", source)}</td>`;
      const devNeedsCell = row.isLocked
        ? renderLockedRefCell(row, "devNeedsRef", source, "N/A")
        : `<td>${renderRefDropdown(row, "devNeedsRef", source)}</td>`;
      return `
        <tr data-slot="${slot}">
          <td class="irc8c-col-edit">
            <button type="button" class="irc8c-icon-btn irc8c-toggle-lock-btn" data-slot="${slot}" title="${row.isLocked ? "Edit this row" : "Save & lock"}">
              ${row.isLocked ? "&#9998;" : "&#10003;"}
            </button>
          </td>
          ${strengthCell}
          ${devNeedsCell}
          ${renderTextCell(row, "actionPlan", "N/A")}
          ${renderTextCell(row, "timeline", "N/A")}
          ${renderTextCell(row, "resourcesNeeded", "N/A")}
        </tr>
      `;
    }).join("");
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  function closeAllDropdowns(exceptListbox) {
    devTableBody.querySelectorAll(".irc8c-ref-listbox").forEach((listbox) => {
      if (listbox === exceptListbox) return;
      listbox.hidden = true;
      const trigger = listbox.previousElementSibling;
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  }

  devTableBody.addEventListener("click", async (e) => {
    const trigger = e.target.closest(".irc8c-ref-trigger");
    if (trigger) {
      const listbox = trigger.nextElementSibling;
      const wasOpen = !listbox.hidden;
      closeAllDropdowns();
      listbox.hidden = wasOpen;
      trigger.setAttribute("aria-expanded", String(!wasOpen));
      return;
    }

    const option = e.target.closest(".irc8c-ref-option");
    if (option) {
      const dropdown = option.closest(".irc8c-ref-dropdown");
      const slot = dropdown.dataset.slot;
      const field = dropdown.dataset.field;
      const value = option.dataset.value;
      closeAllDropdowns();
      try {
        await saveRow(slot, { [field]: value });
        renderDevTable();
      } catch (err) {
        alert(err.message);
        renderDevTable(); // revert to last-saved value
      }
      return;
    }

    if (!e.target.closest(".irc8c-ref-listbox")) {
      closeAllDropdowns();
    }
  });

  document.addEventListener("click", (e) => {
    if (!devTableBody.contains(e.target)) closeAllDropdowns();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns();
  });

  devTableBody.addEventListener("click", async (e) => {
    const btn = e.target.closest(".irc8c-toggle-lock-btn");
    if (!btn) return;

    const slot = btn.dataset.slot;
    const row = state.rows[slot];
    if (!row) return;

    btn.disabled = true;
    try {
      if (row.isLocked) {
        // Unlock: just open the cells for editing, no data changes yet.
        await saveRow(slot, { isLocked: false });
      } else {
        // Lock: commit whatever's currently typed, then lock.
        const tr = btn.closest("tr");
        const patch = { isLocked: true };
        ["actionPlan", "timeline", "resourcesNeeded"].forEach((field) => {
          const textarea = tr.querySelector(`textarea[data-field="${field}"]`);
          if (textarea) patch[field] = textarea.value;
        });
        await saveRow(slot, patch);
      }
      renderDevTable();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ------------------------------------------------------------------
  // Initial load
  // ------------------------------------------------------------------
  renderCriteriaStrip(null);
  loadAll();
})();
