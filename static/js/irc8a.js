(function () {
  const workspaceEl = document.getElementById("irc8a-workspace");
  if (!workspaceEl) return;

  const navEl = document.getElementById("irc8a-nav");
  const detailEl = document.getElementById("irc8a-detail");
  const emptyStateEl = document.getElementById("irc8a-empty-state");
  const emptyStateTextEl = document.getElementById("irc8a-empty-state-text");
  const summaryEl = document.getElementById("irc8a-part-tabs");
  const emptyAddKraBtn = document.getElementById("irc8a-empty-add-kra");

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
  const svg = (inner, cls) =>
    `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICON_EDIT = svg(
    '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>',
  );
  const ICON_TRASH = svg(
    '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>',
  );
  const ICON_PLUS = svg(
    '<path d="M12 5v14M5 12h14"></path>',
    "irc8a-inline-icon",
  );
  const ICON_LINK = svg(
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>',
  );

  // Progress ring shown on each objective in the sidebar. The arc length is
  // done/total, so the ring fills as the objective is completed:
  //   none    -> empty track
  //   partial -> arc proportional to what is filled in
  //   done    -> solid ring with a check mark
  const RING_R = 8;
  const RING_C = 2 * Math.PI * RING_R;
  function progressRing(prog) {
    const track = `<circle class="irc8a-ring-track" cx="12" cy="12" r="${RING_R}"></circle>`;
    if (prog.state === "done") {
      return `<svg class="irc8a-ring" viewBox="0 0 24 24" aria-hidden="true"><circle class="irc8a-ring-fill" cx="12" cy="12" r="10.5"></circle><path class="irc8a-ring-check" d="M7.8 12.4l3 3 5.4-6"></path></svg>`;
    }
    const frac = prog.total ? prog.done / prog.total : 0;
    const arc =
      prog.state === "partial"
        ? `<circle class="irc8a-ring-arc" cx="12" cy="12" r="${RING_R}" stroke-dasharray="${(RING_C * frac).toFixed(2)} ${RING_C.toFixed(2)}" transform="rotate(-90 12 12)"></circle>`
        : "";
    return `<svg class="irc8a-ring" viewBox="0 0 24 24" aria-hidden="true">${track}${arc}</svg>`;
  }
  const PROGRESS_LABELS = {
    none: "Not started",
    partial: "In progress",
    done: "Complete",
  };

  const INDICATOR_CATEGORIES = [
    { key: "quality", label: "Quality" },
    { key: "efficiency", label: "Efficiency" },
    { key: "timeliness", label: "Timeliness" },
  ];
  const LEVELS = [
    { n: 5, name: "Outstanding" },
    { n: 4, name: "Very satisfactory" },
    { n: 3, name: "Satisfactory" },
    { n: 2, name: "Unsatisfactory" },
    { n: 1, name: "Poor" },
  ];
  const levelName = (n) =>
    (LEVELS.find((l) => l.n === Number(n)) || {}).name || "";

  const MFO_NAME = "Basic Education Services";
  // All KRA weights on an IPCRF should add up to this.
  const EXPECTED_TOTAL = 100;

  // ================= State =================
  // `state.kras` mirrors GET /irc/irc8a/data. `sel` is the only piece of
  // view state: which KRA / objective is open in the detail panel.
  const state = { kras: [], year: null };
  const sel = { kraId: null, objId: null };
  const id = (v) => String(v);

  // ================= API helper =================
  // keepalive lets a save still finish if the page is closed or navigated
  // away while the request is in flight (used by the header fields).
  async function apiCall(method, url, body, keepalive) {
    const opts = { method, headers: {} };
    if (keepalive) opts.keepalive = true;
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      throw new Error("Network error. Check your connection and try again.");
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* no JSON body */
    }
    if (!res.ok) {
      throw new Error(
        (data && data.error) || "Something went wrong. Please try again.",
      );
    }
    return data;
  }

  // ================= Helpers =================
  // 1-based position of a KRA in the list
  function kraNumber(kra) {
    const idx = state.kras.findIndex((k) => id(k.id) === id(kra.id));
    return idx === -1 ? 1 : idx + 1;
  }

  const hasVal = (v) => v !== null && v !== undefined && v !== "" && !isNaN(v);
  const fmtWeight = (w) =>
    hasVal(w) ? Math.round(Number(w) * 100) / 100 + "%" : "—";
  const fmt3 = (n) => Number(n).toFixed(3);

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

  // Objective weights should add up to their KRA's weight.
  function objectiveWeightMismatch(kra) {
    const totalObj = sumWeights(kra.objectives);
    const kraW = parseFloat(kra.weight);
    const mismatch =
      kra.objectives.length > 0 &&
      !isNaN(kraW) &&
      Math.abs(totalObj - kraW) >= 0.005;
    return { mismatch, totalObj, kraW };
  }

  function computeAverage(obj) {
    let sum = 0;
    let count = 0;
    INDICATOR_CATEGORIES.forEach((c) => {
      const v = obj.ratings[c.key];
      if (hasVal(v)) {
        sum += Number(v);
        count++;
      }
    });
    return count === 0 ? null : sum / count;
  }

  function computeScore(obj) {
    const avg = computeAverage(obj);
    const w = parseFloat(obj.weight);
    if (avg === null || isNaN(w)) return null;
    return avg * (w / 100);
  }

  // "1.2. Develop and ..." -> { code: "1.2", title: "Develop and ..." }
  function splitObjectiveText(text, fallbackCode) {
    const m = /^\s*(\d+\.\d+)\.?\s+([\s\S]*)$/.exec(text || "");
    return m
      ? { code: m[1], title: m[2] }
      : { code: fallbackCode, title: text || "" };
  }

  // ================= Lookups =================
  const findKra = (kraId) => state.kras.find((k) => id(k.id) === id(kraId));
  function findObjective(kraId, objId) {
    const kra = findKra(kraId);
    return kra
      ? kra.objectives.find((o) => id(o.id) === id(objId)) || null
      : null;
  }

  function upsertObjective(updated) {
    const kra = findKra(updated.kraId);
    if (!kra) return;
    const idx = kra.objectives.findIndex((o) => id(o.id) === id(updated.id));
    if (idx === -1) kra.objectives.push(updated);
    else kra.objectives[idx] = updated;
  }

  function upsertIndicator(kraId, objId, category, item) {
    const obj = findObjective(kraId, objId);
    if (!obj) return;
    const idx = obj[category].findIndex((i) => id(i.id) === id(item.id));
    if (idx === -1) obj[category].push(item);
    else obj[category][idx] = item;
  }

  // ================= Totals =================
  function formTotals() {
    let scoreSum = 0;
    let hasAny = false;
    state.kras.forEach((k) =>
      k.objectives.forEach((o) => {
        const s = computeScore(o);
        if (s !== null) {
          scoreSum += s;
          hasAny = true;
        }
      }),
    );
    return { weight: sumWeights(state.kras), score: hasAny ? scoreSum : null };
  }

  // ================= Render: summary card =================
  function renderSummary() {
    const t = formTotals();
    const weightOk = Math.abs(t.weight - EXPECTED_TOTAL) < 0.005;
    const weightTip = weightOk
      ? `Total KRA weight (target ${EXPECTED_TOTAL}%)`
      : `Total KRA weight is ${fmtWeight(t.weight)}. It should total ${EXPECTED_TOTAL}%`;
    summaryEl.innerHTML = `
      <div class="irc8a-part-tab irc8a-part-tab--static is-active">
        <div class="irc8a-part-tab-head">
          <span class="irc8a-part-tab-label">MFO</span>
          <span class="irc8a-part-tab-name">${escapeHtml(MFO_NAME)}</span>
        </div>
        <span class="irc8a-part-tab-stats">
          <span class="irc8a-part-tab-stat" title="${escapeHtml(weightTip)}">
            <span class="irc8a-part-tab-k">Weight</span>
            <span class="irc8a-part-tab-v${weightOk ? "" : " is-warn"}">${fmtWeight(t.weight)}</span>
          </span>
          <span class="irc8a-part-tab-stat" title="Overall rating for accomplishments">
            <span class="irc8a-part-tab-k">Score</span>
            <span class="irc8a-part-tab-v${t.score === null ? " is-empty" : ""}">${t.score === null ? "—" : fmt3(t.score)}</span>
          </span>
        </span>
      </div>`;
  }

  // ================= Render: selection =================
  function ensureSelection() {
    const visibleKras = state.kras;
    const kra = visibleKras.find((k) => id(k.id) === id(sel.kraId));
    if (kra) {
      if (
        sel.objId === null ||
        kra.objectives.some((o) => id(o.id) === id(sel.objId))
      )
        return;
    }
    const withObjs = visibleKras.find((k) => k.objectives.length > 0);
    if (withObjs) {
      sel.kraId = withObjs.id;
      sel.objId = withObjs.objectives[0].id;
    } else if (visibleKras.length) {
      sel.kraId = visibleKras[0].id;
      sel.objId = null;
    } else {
      sel.kraId = null;
      sel.objId = null;
    }
  }

  // ================= Objective progress =================
  // Tracks what has to be filled in on every objective:
  //   1. Timeline
  //   2. Performance measures and rating scale: for each of Quality /
  //      Efficiency / Timeliness that has descriptors, a rating is chosen and
  //      all five level descriptors are written
  //   3. Actual accomplishments
  // Returns { state: "none" | "partial" | "done", done, total, missing[] }.
  function hasDescriptors(obj, key) {
    return (obj[key] || []).some(
      (i) => typeof i.label === "string" && i.label.trim() !== "",
    );
  }

  function objectiveProgress(obj) {
    const filled = (v) => typeof v === "string" && v.trim() !== "";
    const checks = [{ label: "Timeline", ok: filled(obj.timeline) }];
    INDICATOR_CATEGORIES.forEach((c) => {
      // A measure with no descriptors at all is not applicable to this
      // objective, so neither its rating nor its descriptors are required.
      if (!hasDescriptors(obj, c.key)) return;
      checks.push({
        label: `${c.label} rating`,
        ok: hasVal(obj.ratings && obj.ratings[c.key]),
      });
      const items = obj[c.key] || [];
      checks.push({
        label: `${c.label} descriptors`,
        ok: LEVELS.every((l) =>
          items.some((i) => i.rate === l.n && filled(i.label)),
        ),
      });
    });
    checks.push({
      label: "Actual accomplishments",
      ok: filled(obj.actualResults),
    });
    const done = checks.filter((c) => c.ok).length;
    const total = checks.length;
    return {
      state: done === 0 ? "none" : done === total ? "done" : "partial",
      done,
      total,
      missing: checks.filter((c) => !c.ok).map((c) => c.label),
    };
  }

  // ================= Render: sidebar =================
  // Sticky strip at the top of the nav: the Add KRA button plus a live meter
  // of the KRA weight total against the 100% target.
  function renderNavToolbar() {
    const expected = EXPECTED_TOTAL;
    const total = formTotals().weight;
    const diff = Math.round((expected - total) * 100) / 100;
    // Weight met: no indicator at all, just the Add KRA button.
    let stateCls = "";
    let msg = "";
    if (diff > 0.005) {
      stateCls = "is-warn";
      msg = `KRA weights total ${fmtWeight(total)}, not ${expected}%. Allocate ${fmtWeight(diff)} more.`;
    } else if (diff < -0.005) {
      stateCls = "is-over";
      msg = `KRA weights total ${fmtWeight(total)}, which is ${fmtWeight(-diff)} over the ${expected}% target. Reduce a KRA's weight.`;
    }
    const pct = Math.max(0, Math.min(100, (total / expected) * 100));
    const meter = stateCls
      ? `<div class="irc8a-nav-total ${stateCls}" role="status">
          <div class="irc8a-nav-total-head">
            <span>KRA weight</span>
            <strong>${fmtWeight(total)} / ${expected}%</strong>
          </div>
          <div class="irc8a-nav-total-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
          <p class="irc8a-nav-total-msg">${escapeHtml(msg)}</p>
        </div>`
      : "";
    return `
      <div class="irc8a-nav-toolbar">
        <button type="button" class="irc8a-add-btn irc8a-nav-add" data-action="add-kra">${ICON_PLUS}Add KRA</button>
        ${meter}
      </div>`;
  }

  function renderNav() {
    const groups = state.kras
      .map((kra) => {
        const isSelKra = id(kra.id) === id(sel.kraId);
        const actions = `<button type="button" class="irc8a-icon-btn" data-action="add-objective" data-kra-id="${kra.id}" title="Add objective">${ICON_PLUS}</button>
             <button type="button" class="irc8a-icon-btn" data-action="edit-kra" data-kra-id="${kra.id}" title="Edit KRA">${ICON_EDIT}</button>
             <button type="button" class="irc8a-icon-btn irc8a-icon-btn--danger" data-action="delete-kra" data-kra-id="${kra.id}" title="Delete KRA">${ICON_TRASH}</button>`;
        const mm = objectiveWeightMismatch(kra);
        const navWarn = mm.mismatch
          ? `<p class="irc8a-warn irc8a-nav-warn" role="alert">Objective weights total ${fmtWeight(mm.totalObj)}, but this KRA is ${fmtWeight(mm.kraW)}. They should match.</p>`
          : "";
        const items = kra.objectives
          .map((obj, i) => {
            const { code, title } = splitObjectiveText(
              obj.text,
              `${kraNumber(kra)}.${i + 1}`,
            );
            const isSel = isSelKra && id(obj.id) === id(sel.objId);
            const prog = objectiveProgress(obj);
            const progTip =
              prog.state === "done"
                ? "Complete"
                : `${PROGRESS_LABELS[prog.state]} (${prog.done}/${prog.total}). Still needed: ${prog.missing.join(", ")}`;
            return `
              <button type="button" class="irc8a-nav-item${isSel ? " is-selected" : ""}" data-action="select-obj" data-kra-id="${kra.id}" data-obj-id="${obj.id}" title="${escapeHtml(title || "Untitled objective")}"${isSel ? ' aria-current="true"' : ""}>
                <span class="irc8a-nav-main">
                  <span class="irc8a-nav-progress irc8a-nav-progress--${prog.state}" title="${escapeHtml(progTip)}" role="img" aria-label="${escapeHtml(PROGRESS_LABELS[prog.state] + " (" + prog.done + " of " + prog.total + ")")}">${progressRing(prog)}</span>
                  <span class="irc8a-nav-code">Objective ${escapeHtml(code)}</span>
                </span>
                <span class="irc8a-nav-weight" title="Objective weight">${fmtWeight(obj.weight)}</span>
              </button>`;
          })
          .join("");
        return `
          <div class="irc8a-nav-group">
            <div class="irc8a-nav-group-head${isSelKra && sel.objId === null ? " is-selected" : ""}">
              <span class="irc8a-nav-group-label">KRA ${kraNumber(kra)}</span>
              <div class="irc8a-nav-group-row">
                <button type="button" class="irc8a-nav-group-title" data-action="select-kra" data-kra-id="${kra.id}">${kra.text ? escapeHtml(kra.text) : "Untitled KRA"}</button>
                <span class="irc8a-nav-group-weight" title="KRA weight">${fmtWeight(kra.weight)}</span>
              </div>
              <div class="irc8a-nav-group-actions">${actions}</div>
            </div>
            ${navWarn}
            ${items}
          </div>`;
      })
      .join("");
    navEl.innerHTML = renderNavToolbar() + groups;
  }

  // ================= Render: detail panel =================
  // Red asterisk (Google Forms style) shown beside a label while its field is
  // still empty. render() rebuilds the panel after every save, so it
  // disappears on its own once the field has a value.
  const reqMark = (isEmpty) =>
    isEmpty
      ? '<span class="irc8a-req" title="Required" aria-label="Required">*</span>'
      : "";

  function field(label, valueHtml, extraCls) {
    return `<div class="irc8a-fact${extraCls ? " " + extraCls : ""}"><span class="irc8a-label">${label}</span><div class="irc8a-fact-value">${valueHtml}</div></div>`;
  }
  const textOrDash = (v) =>
    v ? escapeHtml(v) : '<span class="irc8a-muted">—</span>';

  function renderKraBlock(kra) {
    return `
      <section class="irc8a-kra-block">
        <div class="irc8a-kra-block-head">
          <div>
            <span class="irc8a-label">KRA ${kraNumber(kra)}</span>
            <h3>${kra.text ? escapeHtml(kra.text) : "Untitled KRA"}</h3>
          </div>
          <div class="irc8a-kra-block-side">
            <span class="irc8a-weight-chip">${fmtWeight(kra.weight)}</span>
            <button type="button" class="irc8a-icon-btn" data-action="edit-kra" data-kra-id="${kra.id}" title="Edit KRA">${ICON_EDIT}</button>
          </div>
        </div>
      </section>`;
  }

  function renderLevelRow(obj, cat, level, selectedRate) {
    const item = obj[cat.key].find((i) => i.rate === level.n);
    const isSel = selectedRate === level.n;
    // A level with no descriptor can't be rated. (If a stale rating is already
    // sitting on such a level it stays clickable so it can be cleared.)
    const hasText = !!(
      item &&
      typeof item.label === "string" &&
      item.label.trim()
    );
    const pickable = hasText || isSel;
    const actions = item
      ? `<span class="irc8a-level-actions">
             <button type="button" class="irc8a-icon-btn" data-action="edit-rubric" data-category="${cat.key}" data-item-id="${item.id}" title="Edit descriptor">${ICON_EDIT}</button>
             <button type="button" class="irc8a-icon-btn irc8a-icon-btn--danger" data-action="delete-rubric" data-category="${cat.key}" data-item-id="${item.id}" title="Remove descriptor">${ICON_TRASH}</button>
           </span>`
      : `<span class="irc8a-level-actions"><button type="button" class="irc8a-btn irc8a-btn--ghost irc8a-btn--sm" data-action="add-rubric" data-category="${cat.key}" data-level="${level.n}">${ICON_PLUS}Add descriptor</button></span>`;
    return `
      <div class="irc8a-level${isSel ? " is-selected" : ""}${pickable ? "" : " is-disabled"}" role="radio" aria-checked="${isSel}" ${pickable ? 'tabindex="0" data-action="pick-level"' : 'tabindex="-1" aria-disabled="true"'} data-category="${cat.key}" data-level="${level.n}" title="${isSel ? "Click to clear this rating" : pickable ? `Rate ${cat.label.toLowerCase()} ${level.n}` : "No descriptor for this level, so it can't be rated"}">
        <span class="irc8a-level-num">${level.n}</span>
        <span class="irc8a-level-name">${level.name}</span>
        <span class="irc8a-level-text">${item ? escapeHtml(item.label) : '<span class="irc8a-muted">No descriptor for this level</span>'}</span>
        ${actions}
      </div>`;
  }

  function renderCategory(obj, cat) {
    const raw = obj.ratings[cat.key];
    const selectedRate = hasVal(raw) ? Number(raw) : null;
    return `
      <section class="irc8a-cat">
        <div class="irc8a-cat-head">
          <h4>${cat.label}${reqMark(selectedRate === null && hasDescriptors(obj, cat.key))}</h4>
          <span class="irc8a-cat-rating${selectedRate === null ? " is-empty" : ""}">${selectedRate === null ? "Not rated" : `${selectedRate} · ${levelName(selectedRate)}`}</span>
        </div>
        <div class="irc8a-levels${selectedRate === null ? "" : " has-selection"}" role="radiogroup" aria-label="${cat.label} rating">
          ${LEVELS.map((l) => renderLevelRow(obj, cat, l, selectedRate)).join("")}
        </div>
      </section>`;
  }

  function renderMovBox(obj) {
    if (!obj.mov) {
      return `<div class="irc8a-box is-empty">No MOV link added yet.</div>`;
    }
    return `<div class="irc8a-box"><a class="irc8a-mov-link" href="${escapeHtml(obj.mov)}" target="_blank" rel="noopener noreferrer">${ICON_LINK}<span>${escapeHtml(obj.mov)}</span></a></div>`;
  }

  function renderMovActions(obj) {
    if (!obj.mov) {
      return `<button type="button" class="irc8a-btn irc8a-btn--ghost irc8a-btn--sm" data-action="edit-mov">${ICON_PLUS}Add link</button>`;
    }
    return `<span class="irc8a-label-actions">
        <button type="button" class="irc8a-icon-btn" data-action="edit-mov" title="Edit link">${ICON_EDIT}</button>
        <button type="button" class="irc8a-icon-btn irc8a-icon-btn--danger" data-action="delete-mov" title="Remove link">${ICON_TRASH}</button>
      </span>`;
  }

  function renderObjective(kra, obj) {
    const objIndex = kra.objectives.findIndex((o) => id(o.id) === id(obj.id));
    const { code, title } = splitObjectiveText(
      obj.text,
      `${kraNumber(kra)}.${objIndex + 1}`,
    );
    const avg = computeAverage(obj);
    const score = computeScore(obj);
    const chip = (label, key) => {
      const v = obj.ratings[key];
      return `<div class="irc8a-result"><span class="irc8a-label">${label}</span><span class="irc8a-result-value">${hasVal(v) ? v : "—"}</span></div>`;
    };

    return `
      <section class="irc8a-obj" data-kra-id="${kra.id}" data-obj-id="${obj.id}">
        <div class="irc8a-obj-head">
          <div>
            <span class="irc8a-label">Objective ${escapeHtml(code)}</span>
            <h3>${title ? escapeHtml(title) : "Untitled objective"}</h3>
          </div>
          <div class="irc8a-obj-actions">
            <button type="button" class="irc8a-icon-btn" data-action="edit-objective" title="Edit objective">${ICON_EDIT}</button>
            <button type="button" class="irc8a-icon-btn irc8a-icon-btn--danger" data-action="delete-objective" title="Delete objective">${ICON_TRASH}</button>
          </div>
        </div>

        <div class="irc8a-group irc8a-group--plan">
          <h4 class="irc8a-group-title"><i class="ti ti-calendar-event" aria-hidden="true"></i>Planning</h4>
          <div class="irc8a-group-body">
          <div class="irc8a-facts">
            ${field("Timeline" + reqMark(!obj.timeline || !String(obj.timeline).trim()), `<span>${textOrDash(obj.timeline)}</span><button type="button" class="irc8a-icon-btn" data-action="edit-timeline" title="Edit timeline">${ICON_EDIT}</button>`, "irc8a-fact--inline")}
            ${field("Weight allocation", escapeHtml(fmtWeight(obj.weight)))}
          </div>
          </div>
        </div>

        <div class="irc8a-group irc8a-group--perf">
          <h4 class="irc8a-group-title"><i class="ti ti-list-check" aria-hidden="true"></i>Performance measures and rating scale</h4>
          <div class="irc8a-group-body">
          ${INDICATOR_CATEGORIES.map((c) => renderCategory(obj, c)).join("")}
          </div>
        </div>

        <div class="irc8a-group irc8a-group--eval">
          <h4 class="irc8a-group-title"><i class="ti ti-clipboard-check" aria-hidden="true"></i>Evaluation</h4>
          <div class="irc8a-group-body">
          <div class="irc8a-eval">
            <div class="irc8a-fact">
              <span class="irc8a-label irc8a-label--row"><span>Means of verification (MOV)</span>${renderMovActions(obj)}</span>
              ${renderMovBox(obj)}
            </div>
            <div class="irc8a-fact">
              <span class="irc8a-label irc8a-label--row"><span>Actual accomplishments${reqMark(!obj.actualResults || !String(obj.actualResults).trim())}</span><button type="button" class="irc8a-icon-btn" data-action="edit-actual" title="Edit actual accomplishments">${ICON_EDIT}</button></span>
              <div class="irc8a-box${obj.actualResults ? "" : " is-empty"}">${obj.actualResults ? escapeHtml(obj.actualResults) : "No accomplishments recorded yet."}</div>
            </div>
          </div>
          <div class="irc8a-results">
            ${chip("Quality", "quality")}${chip("Efficiency", "efficiency")}${chip("Timeliness", "timeliness")}
            <div class="irc8a-result irc8a-result--total"><span class="irc8a-label">Average (QET)</span><span class="irc8a-result-value">${avg === null ? "—" : fmt3(avg)}</span></div>
            <div class="irc8a-result irc8a-result--total"><span class="irc8a-label">Weighted average</span><span class="irc8a-result-value">${score === null ? "—" : fmt3(score)}</span></div>
          </div>
          </div>
        </div>
      </section>`;
  }

  function detailHtml(kra, obj) {
    let body = renderKraBlock(kra);
    if (obj) {
      body += renderObjective(kra, obj);
    } else {
      body += `<div class="irc8a-empty-inline"><p>This KRA has no objectives yet.</p><button type="button" class="irc8a-btn irc8a-btn--primary" data-action="add-objective" data-kra-id="${kra.id}">${ICON_PLUS}Add objective</button></div>`;
    }
    return body;
  }

  function renderDetail() {
    const kra = state.kras.find((k) => id(k.id) === id(sel.kraId));
    if (!kra) {
      detailEl.innerHTML = "";
      return;
    }
    const obj = sel.objId !== null ? findObjective(kra.id, sel.objId) : null;
    detailEl.innerHTML = detailHtml(kra, obj);
  }

  // The workspace's height is the tallest the detail panel gets: every
  // KRA / objective view is rendered off-screen at the panel's current width
  // and the biggest one wins. So the height stays put when you switch
  // objectives, and the sidebar (capped to the workspace) keeps that room.
  // In the stacked (narrow) layout nothing is forced.
  function fitWorkspaceHeight() {
    if (state.kras.length === 0) return;
    if (window.matchMedia && window.matchMedia("(max-width: 900px)").matches) {
      workspaceEl.style.minHeight = "";
      return;
    }
    const width = detailEl.clientWidth;
    if (!width) return;
    const probe = document.createElement("div");
    probe.className = "irc8a-detail";
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;width:${width}px`;
    workspaceEl.appendChild(probe);
    let max = 0;
    state.kras.forEach((kra) => {
      const views = kra.objectives.length ? kra.objectives : [null];
      views.forEach((obj) => {
        probe.innerHTML = detailHtml(kra, obj);
        max = Math.max(max, probe.offsetHeight);
      });
    });
    workspaceEl.removeChild(probe);
    workspaceEl.style.minHeight = max ? `${Math.ceil(max)}px` : "";
  }
  let fitTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitWorkspaceHeight, 100);
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitWorkspaceHeight);
  }

  // ================= Render: all =================
  function render() {
    renderSummary();

    const isEmpty = state.kras.length === 0;
    emptyStateEl.style.display = isEmpty ? "block" : "none";
    emptyAddKraBtn.style.display = isEmpty ? "inline-flex" : "none";
    workspaceEl.style.display = isEmpty ? "none" : "";
    if (isEmpty) {
      emptyStateTextEl.innerHTML =
        "No KRAs yet. Click <strong>Add KRA</strong> to start planning.";
      navEl.innerHTML = "";
      detailEl.innerHTML = "";
      workspaceEl.style.minHeight = "";
      return;
    }

    ensureSelection();
    renderNav();
    renderDetail();
    fitWorkspaceHeight();
  }

  // ================= Modal control =================
  let modalCtx = null; // { mode, kraId, objId, category, itemId, level }

  function resetModalFields() {
    fieldPrimaryWrap.style.display = "none";
    fieldUrlWrap.style.display = "none";
    fieldRateWrap.style.display = "none";
    fieldWeightWrap.style.display = "none";
    primaryInput.value = "";
    primaryInput.placeholder = "Type here...";
    urlInput.value = "";
    weightInput.value = "";
    rateSelect.innerHTML = "";
  }

  function populateRateOptions(existingRates, currentRate, preferred) {
    rateSelect.innerHTML = "";
    for (let r = 5; r >= 1; r--) {
      if (existingRates.includes(r) && r !== currentRate) continue;
      const opt = document.createElement("option");
      opt.value = String(r);
      opt.textContent = `${r} · ${levelName(r)}`;
      rateSelect.appendChild(opt);
    }
    const want = currentRate || preferred;
    rateSelect.value = want ? String(want) : rateSelect.options[0]?.value || "";
  }

  function openModal(ctx) {
    modalCtx = ctx;
    resetModalFields();
    modalHint.textContent = "";

    if (ctx.mode === "add-kra" || ctx.mode === "edit-kra") {
      const isEdit = ctx.mode === "edit-kra";
      const kra = isEdit ? findKra(ctx.kraId) : null;
      modalTitle.textContent = isEdit ? "Edit KRA" : "Add KRA";
      fieldPrimaryWrap.style.display = "block";
      fieldPrimaryLabel.textContent = "KRA description";
      fieldWeightWrap.style.display = "block";
      fieldWeightLabel.textContent = "Weight (%). All KRAs should total 100%";
      if (isEdit && kra) {
        primaryInput.value = kra.text || "";
        weightInput.value = kra.weight ?? "";
      }
    } else if (ctx.mode === "add-objective" || ctx.mode === "edit-objective") {
      const isEdit = ctx.mode === "edit-objective";
      const obj = isEdit ? findObjective(ctx.kraId, ctx.objId) : null;
      modalTitle.textContent = isEdit ? "Edit objective" : "Add objective";
      fieldPrimaryWrap.style.display = "block";
      fieldPrimaryLabel.textContent = "Objective description";
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
      const existing = obj[ctx.category];
      const item = isEdit
        ? existing.find((i) => id(i.id) === id(ctx.itemId))
        : null;
      modalTitle.textContent =
        (isEdit ? "Edit " : "Add ") + catLabel.toLowerCase() + " descriptor";
      modalHint.textContent =
        "Choose the rating level, then describe what earns it.";
      fieldRateWrap.style.display = "block";
      populateRateOptions(
        existing.map((i) => i.rate),
        item ? item.rate : null,
        ctx.level,
      );
      fieldPrimaryWrap.style.display = "block";
      fieldPrimaryLabel.textContent = "Descriptor";
      primaryInput.placeholder =
        "What must be accomplished for this rating level...";
      if (isEdit && item) primaryInput.value = item.label || "";
    } else if (ctx.mode === "edit-mov") {
      const obj = findObjective(ctx.kraId, ctx.objId);
      modalTitle.textContent = obj.mov ? "Edit MOV link" : "Add MOV link";
      fieldUrlWrap.style.display = "block";
      urlInput.value = obj.mov || "";
    } else if (ctx.mode === "edit-actual") {
      const obj = findObjective(ctx.kraId, ctx.objId);
      modalTitle.textContent = "Edit actual accomplishments";
      fieldPrimaryWrap.style.display = "block";
      fieldPrimaryLabel.textContent = "Actual accomplishments";
      primaryInput.placeholder = "Describe what was actually accomplished...";
      primaryInput.value = obj.actualResults || "";
    } else if (ctx.mode === "edit-timeline") {
      const obj = findObjective(ctx.kraId, ctx.objId);
      modalTitle.textContent = "Edit timeline";
      fieldPrimaryWrap.style.display = "block";
      fieldPrimaryLabel.textContent = "Timeline";
      primaryInput.placeholder = "e.g. January - December 2026";
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
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modal.style.display !== "none") closeModal();
    else if (resetConfirmOverlay.classList.contains("visible"))
      closeResetConfirm();
  });
  modal
    .querySelector(".irc8a-modal-content")
    .addEventListener("click", (e) => e.stopPropagation());

  function parseWeightInput() {
    const raw = weightInput.value.trim();
    if (raw === "") return { ok: true, weight: null };
    const weight = parseFloat(raw);
    if (isNaN(weight) || weight < 0 || weight > 100) {
      alert("Weight must be a number between 0 and 100.");
      return { ok: false };
    }
    return { ok: true, weight };
  }

  modalSubmit.addEventListener("click", async () => {
    if (!modalCtx) return;
    const mode = modalCtx.mode;
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
          sel.kraId = kra.id;
          sel.objId = null;
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
        if (mode === "add-objective") {
          sel.kraId = obj.kraId;
          sel.objId = obj.id;
        }
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
        upsertObjective(
          await apiCall("POST", `/irc/irc8a/objective/${modalCtx.objId}/mov`, {
            url,
          }),
        );
      } else if (mode === "edit-actual") {
        upsertObjective(
          await apiCall(
            "POST",
            `/irc/irc8a/objective/${modalCtx.objId}/actual-results`,
            { text: primaryInput.value.trim() },
          ),
        );
      } else if (mode === "edit-timeline") {
        upsertObjective(
          await apiCall(
            "POST",
            `/irc/irc8a/objective/${modalCtx.objId}/timeline`,
            { text: primaryInput.value.trim() },
          ),
        );
      }
      closeModal();
      render();
    } catch (err) {
      alert(err.message);
    } finally {
      modalSubmit.disabled = false;
    }
  });

  emptyAddKraBtn.addEventListener("click", () =>
    openModal({ mode: "add-kra" }),
  );

  // ================= Reset =================
  // Two scopes, chosen via the modal's radio buttons and sent as
  // ?scope=ratings_mov|all to /irc/irc8a/reset:
  //  - "ratings_mov" (default): each objective's three ratings and its MOV
  //    link are cleared server-side. KRAs, objectives, weights, indicators,
  //    timeline and actual results are never touched.
  //  - "all": every KRA for this year is deleted (cascading to its objectives
  //    and indicators) -- the form goes back to empty.
  const RESET_WARNINGS = {
    ratings_mov:
      "This clears every rating and MOV link. KRAs, objectives, weights, timelines and actual results are kept. This cannot be undone.",
    all: "This removes every KRA, objective and indicator, along with everything typed into them. This cannot be undone.",
  };

  function getSelectedResetScope() {
    const checked = document.querySelector(
      'input[name="irc8a-reset-scope"]:checked',
    );
    return checked ? checked.value : "ratings_mov";
  }

  function updateResetUi() {
    const scope = getSelectedResetScope();
    resetConfirmWarning.textContent =
      RESET_WARNINGS[scope] || RESET_WARNINGS.ratings_mov;
    resetConfirmWarning.classList.toggle(
      "irc8a-reset-warning--danger",
      scope === "all",
    );
  }
  resetScopeRadios.forEach((r) => r.addEventListener("change", updateResetUi));

  function openResetConfirm() {
    // Always reopen on the safer "ratings & MOV only" option.
    const ratingsRadio = document.getElementById("irc8a-reset-scope-ratings");
    if (ratingsRadio) ratingsRadio.checked = true;
    updateResetUi();
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
    sel.kraId = null;
    sel.objId = null;
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
      if (data && data.scope === "all") removeAllKrasInPlace();
      else clearAllRatingsAndMovInPlace();
      closeResetConfirm();
    } catch (err) {
      alert(err.message || "Could not reset the data. Please try again.");
    } finally {
      resetConfirmConfirmBtn.disabled = false;
    }
  });

  // ================= Delegated clicks (sidebar + detail) =================
  async function setRating(objId, category, rating) {
    try {
      const updated = await apiCall(
        "POST",
        `/irc/irc8a/objective/${objId}/rating`,
        { category, rating },
      );
      upsertObjective(updated);
    } catch (err) {
      alert(err.message);
    }
    render();
  }

  workspaceEl.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    if (e.target.closest("a")) return; // let MOV links open

    const action = el.dataset.action;
    const kraId = el.dataset.kraId || (sel.kraId !== null ? sel.kraId : null);
    const objId = el.dataset.objId || (sel.objId !== null ? sel.objId : null);

    switch (action) {
      case "select-obj":
        sel.kraId = kraId;
        sel.objId = objId;
        render();
        // In the stacked (narrow) layout the detail sits below the list, so
        // bring it into view. On desktop it is already beside the list.
        if (
          window.matchMedia &&
          window.matchMedia("(max-width: 900px)").matches &&
          detailEl.scrollIntoView
        ) {
          detailEl.scrollIntoView({ block: "start" });
        }
        break;
      case "select-kra": {
        const kra = findKra(kraId);
        sel.kraId = kraId;
        sel.objId = kra && kra.objectives.length ? kra.objectives[0].id : null;
        render();
        break;
      }
      case "add-kra":
        openModal({ mode: "add-kra" });
        break;
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
          if (id(sel.kraId) === id(kraId)) {
            sel.kraId = null;
            sel.objId = null;
          }
          render();
        } catch (err) {
          alert(err.message);
        }
        break;
      }
      case "add-objective":
        openModal({ mode: "add-objective", kraId });
        break;
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
          sel.objId = null;
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
          category: el.dataset.category,
          level: parseInt(el.dataset.level, 10),
        });
        break;
      case "edit-rubric":
        openModal({
          mode: "edit-rubric",
          kraId,
          objId,
          category: el.dataset.category,
          itemId: el.dataset.itemId,
        });
        break;
      case "delete-rubric": {
        const obj = findObjective(kraId, objId);
        const category = el.dataset.category;
        if (!confirm("Remove this descriptor? This cannot be undone.")) return;
        try {
          await apiCall("DELETE", `/irc/irc8a/indicator/${el.dataset.itemId}`);
          // The selected rating is left as-is: it may have been set by hand
          // and the server never derives it from the descriptor list.
          obj[category] = obj[category].filter(
            (i) => id(i.id) !== id(el.dataset.itemId),
          );
          render();
        } catch (err) {
          alert(err.message);
        }
        break;
      }
      case "edit-mov":
        openModal({ mode: "edit-mov", kraId, objId });
        break;
      case "delete-mov":
        try {
          upsertObjective(
            await apiCall("POST", `/irc/irc8a/objective/${objId}/mov`, {
              url: "",
            }),
          );
          render();
        } catch (err) {
          alert(err.message);
        }
        break;
      case "edit-actual":
        openModal({ mode: "edit-actual", kraId, objId });
        break;
      case "edit-timeline":
        openModal({ mode: "edit-timeline", kraId, objId });
        break;
      case "pick-level": {
        const obj = findObjective(kraId, objId);
        if (!obj) return;
        const category = el.dataset.category;
        const level = parseInt(el.dataset.level, 10);
        const current = hasVal(obj.ratings[category])
          ? Number(obj.ratings[category])
          : null;
        // Only levels that have a descriptor can be newly rated.
        if (
          current !== level &&
          !(obj[category] || []).some(
            (i) =>
              i.rate === level && typeof i.label === "string" && i.label.trim(),
          )
        )
          return;
        await setRating(objId, category, current === level ? null : level);
        break;
      }
    }
  });

  // Keyboard: Enter / Space on a focused rating row acts like a click.
  workspaceEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest('.irc8a-level[data-action="pick-level"]');
    if (!row || e.target !== row) return;
    e.preventDefault();
    row.click();
  });

  // ================= Form details (report header) =================
  // Each field posts only itself ({ [field]: value }) so one input's save can
  // never clobber a value another field just saved -- the server endpoint
  // only touches keys present in the body.
  const detailsSumEl = document.getElementById("irc8a-details-sum");
  const headerInputs = document.querySelectorAll("[data-header]");

  function updateDetailsSummary(h) {
    const bits = [
      (h.nameOfEmployee || "").toUpperCase(),
      h.ratingPeriod,
    ].filter(Boolean);
    detailsSumEl.textContent = bits.length
      ? bits.join(" · ")
      : "Not filled in yet";
  }

  function currentHeader() {
    const h = {};
    headerInputs.forEach((inp) => {
      h[inp.dataset.header] = inp.value.trim();
    });
    return h;
  }

  // The rater's position is fixed (shown under the name and printed as is).
  // The name defaults to the line below whenever the saved one is empty; it
  // stays fully editable and whatever the person types is saved.
  const RATER_POSITION = "SGOD Chief";
  const RATER_DEFAULTS = {
    nameOfRater: "DR. JONATHAN P. DOMINGO",
  };

  async function loadHeader() {
    let h = {};
    try {
      h = (await apiCall("GET", "/api/irc8a/report-header")) || {};
    } catch (err) {
      /* the form still works without its header block */
    }
    headerInputs.forEach((inp) => {
      const v = h[inp.dataset.header] || "";
      inp.value = inp.dataset.upper ? v.toUpperCase() : v;
    });
    // Fill in (and save) the rater defaults for anything still empty.
    for (const [field, def] of Object.entries(RATER_DEFAULTS)) {
      const inp = document.querySelector(`[data-header="${field}"]`);
      if (!inp || inp.value.trim()) continue;
      inp.value = def;
      h[field] = def;
      try {
        await apiCall("POST", "/api/irc8a/report-header", { [field]: def });
      } catch (err) {
        /* shown and printed anyway; it will save on the next edit */
      }
    }
    updateDetailsSummary(h);
  }

  // Name fields are forced to capitals as the person types (cursor kept).
  document.querySelectorAll("[data-upper]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const start = inp.selectionStart;
      const end = inp.selectionEnd;
      inp.value = inp.value.toUpperCase();
      try {
        inp.setSelectionRange(start, end);
      } catch (e) {
        /* not supported for this input type */
      }
    });
  });

  // ---- Autosave -------------------------------------------------------
  // A field saves 0.8s after the person stops typing, immediately on blur /
  // change, and -- so nothing typed is lost -- is flushed with a keepalive
  // request when the page is hidden or closed (switching tabs, quitting the
  // app, clicking a link in the middle of typing).
  const pendingSaves = new Map(); // input -> { timer, save }
  function autosave(inp, save) {
    const run = async (keepalive) => {
      const p = pendingSaves.get(inp);
      if (p) clearTimeout(p.timer);
      pendingSaves.delete(inp);
      try {
        await save(keepalive);
      } catch (err) {
        if (!keepalive) alert(err.message);
      }
    };
    inp.addEventListener("input", () => {
      const p = pendingSaves.get(inp);
      if (p) clearTimeout(p.timer);
      pendingSaves.set(inp, { timer: setTimeout(() => run(false), 800), run });
    });
    inp.addEventListener("change", () => run(false));
  }
  function flushPendingSaves() {
    Array.from(pendingSaves.values()).forEach((p) => p.run(true));
  }
  window.addEventListener("pagehide", flushPendingSaves);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingSaves();
  });

  // Approving authority is IRC8A's own single global row
  // (/api/irc8a/approving-authority), separate from the report header.
  const authorityInput = document.getElementById("irc8a-h-approvingAuthority");
  async function loadAuthority() {
    if (!authorityInput) return;
    try {
      const a = await apiCall("GET", "/api/irc8a/approving-authority");
      authorityInput.value = ((a && a.name) || "").toUpperCase();
    } catch (err) {
      /* leave blank */
    }
  }
  if (authorityInput) {
    autosave(authorityInput, async (keepalive) => {
      await apiCall(
        "POST",
        "/api/irc8a/approving-authority",
        { name: authorityInput.value.trim().toUpperCase() },
        keepalive,
      );
    });
  }

  headerInputs.forEach((inp) => {
    autosave(inp, async (keepalive) => {
      const value =
        inp.type === "date"
          ? inp.value
          : inp.dataset.upper
            ? inp.value.trim().toUpperCase()
            : inp.value.trim();
      const h = await apiCall(
        "POST",
        "/api/irc8a/report-header",
        { [inp.dataset.header]: value },
        keepalive,
      );
      updateDetailsSummary(h || currentHeader());
    });
  });

  // ================= Print / Save as PDF =================
  // Builds a print-only copy of the whole form (header block, KRA table,
  // signatories) laid out like the official sheet, then calls window.print().
  // Styling lives in irc8a_print.css (long bond, landscape). The root is
  // moved to <body> so the print stylesheet can hide everything else on the
  // page without knowing base.html's structure.
  const printRoot = document.getElementById("irc8a-print-root");
  const printBtn = document.getElementById("irc8a-pdf-btn");
  if (printRoot) document.body.appendChild(printRoot);

  const SCALE_LABELS = {
    5: "5<br>(Outstanding)",
    4: "4<br>(Very Satisfactory)",
    3: "3<br>(Satisfactory)",
    2: "2<br>(Unsatisfactory)",
    1: "1<br>(Poor)",
  };

  // Column widths are % of the table and add up to ~100.
  function printCols() {
    const scale = [5, 4, 3, 2, 1].map((n) => ({
      k: "r" + n,
      group: "scale",
      label: SCALE_LABELS[n],
      w: 7.6,
    }));
    return [
      { k: "mfo", label: "MFOs", w: 5 },
      { k: "kra", label: "Key Result Areas (KRA)", w: 8.5 },
      { k: "obj", label: "Objectives", w: 12 },
      { k: "time", label: "Timeline", w: 5 },
      { k: "wt", label: "Weight Allocation", w: 4 },
      {
        k: "meas",
        label: "Performance Measure<br>(Quality, Efficiency, Timeliness)",
        w: 5,
      },
      ...scale,
      { k: "mov", label: "Means of Verification (MOVs)", w: 7.5 },
      { k: "act", label: "Actual Results/ Accomplishments", w: 7 },
      { k: "rate", label: "RATING<br>(Q,E,T)", w: 2.5 },
      { k: "avg", label: "AVERAGE<br>(QET)", w: 2.5 },
      { k: "wavg", label: "WEIGHTED AVERAGE", w: 3 },
    ];
  }

  const pText = (v) => escapeHtml(v == null ? "" : String(v));
  const pWeight = (w) =>
    hasVal(w) ? Math.round(Number(w) * 100) / 100 + "%" : "";
  const pFmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return isNaN(d)
      ? iso
      : d.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
  };

  function printTableHead(cols) {
    const evalStart = cols.findIndex((c) => c.k === "act");
    const colgroup = `<colgroup>${cols.map((c) => `<col style="width:${c.w}%">`).join("")}</colgroup>`;
    const row1 = `<tr class="ph-band">
      <th colspan="${evalStart}">TO BE ACCOMPLISHED DURING PLANNING</th>
      <th colspan="${cols.length - evalStart}">TO BE FILLED DURING EVALUATION</th></tr>`;
    let row2 = "";
    let row3 = "";
    for (let i = 0; i < cols.length; ) {
      const c = cols[i];
      if (!c.group) {
        row2 += `<th rowspan="2">${c.label}</th>`;
        i++;
        continue;
      }
      let j = i;
      while (j < cols.length && cols[j].group === c.group) j++;
      row2 += `<th colspan="${j - i}">Rating Scale</th>`;
      for (let x = i; x < j; x++) row3 += `<th>${cols[x].label}</th>`;
      i = j;
    }
    return `${colgroup}<thead>${row1}<tr>${row2}</tr><tr>${row3}</tr></thead>`;
  }

  // One <tbody> per KRA. Each objective is three rows (Quality / Efficiency /
  // Timeliness); cells that apply to the whole objective span those rows.
  function printKraBody(kra, cols) {
    const objs = kra.objectives.length ? kra.objectives : [null];
    const totalRows = objs.length * 3;
    let html = `<tbody class="pb-kra">`;
    objs.forEach((obj, oi) => {
      INDICATOR_CATEGORIES.forEach((cat, ci) => {
        let tr = "<tr>";
        cols.forEach((c) => {
          const first = oi === 0 && ci === 0;
          switch (c.k) {
            case "mfo":
              if (first)
                tr += `<td rowspan="${totalRows}" class="pc-kra">${pText(MFO_NAME)}</td>`;
              break;
            case "kra":
              if (first)
                tr += `<td rowspan="${totalRows}" class="pc-kra">${pText(kra.text)}${
                  hasVal(kra.weight) ? `<br>(${pWeight(kra.weight)})` : ""
                }</td>`;
              break;
            case "meas":
              tr += `<td class="pc-meas">${cat.label}</td>`;
              break;
            case "rate":
              tr += `<td class="pc-c">${obj && hasVal(obj.ratings[cat.key]) ? Number(obj.ratings[cat.key]) : ""}</td>`;
              break;
            case "r5":
            case "r4":
            case "r3":
            case "r2":
            case "r1": {
              const n = Number(c.k.slice(1));
              const item = obj ? obj[cat.key].find((i) => i.rate === n) : null;
              tr += `<td>${item ? pText(item.label) : ""}</td>`;
              break;
            }
            default:
              if (ci !== 0) break; // objective-level cell, only on first row
              {
                let v = "";
                let cls = "";
                if (obj) {
                  if (c.k === "obj") v = pText(obj.text);
                  else if (c.k === "time") v = pText(obj.timeline);
                  else if (c.k === "wt")
                    ((v = pWeight(obj.weight)), (cls = "pc-c"));
                  else if (c.k === "mov")
                    v = obj.mov
                      ? `<span class="pc-link">${pText(obj.mov)}</span>`
                      : "";
                  else if (c.k === "act") v = pText(obj.actualResults);
                  else if (c.k === "avg") {
                    const a = computeAverage(obj);
                    ((v = a === null ? "" : fmt3(a)), (cls = "pc-c"));
                  } else if (c.k === "wavg") {
                    const s = computeScore(obj);
                    ((v = s === null ? "" : fmt3(s)), (cls = "pc-c"));
                  }
                }
                tr += `<td rowspan="3" class="${cls}">${v}</td>`;
              }
          }
        });
        html += tr + "</tr>";
      });
    });
    return html + "</tbody>";
  }

  function printTable() {
    const cols = printCols();
    let kras = state.kras;
    if (!kras.length) {
      // Nothing entered yet: print blank rows, as on the paper form.
      kras = [{ text: "", weight: null, objectives: [null, null] }];
    }
    const t = formTotals();
    const bodies = kras.map((k) => printKraBody(k, cols)).join("");
    // Total row: total KRA weight lines up under Weight Allocation (col 5),
    // the label runs to the Weighted Average column, which holds the score.
    const wtIdx = cols.findIndex((c) => c.k === "wt");
    const total = `<tbody class="pb-total"><tr>
      <td colspan="${wtIdx}" class="pc-total-label"></td>
      <td class="pc-c">${t.weight ? pWeight(t.weight) : ""}</td>
      <td colspan="${cols.length - wtIdx - 2}" class="pc-total-label">Overall Rating for Accomplishments</td>
      <td class="pc-c">${t.score === null ? "" : fmt3(t.score)}</td>
    </tr></tbody>`;
    return `<div class="p-part">
      <table class="p-table">${printTableHead(cols)}${bodies}${total}</table>
    </div>`;
  }

  function buildPrintHtml() {
    const h = currentHeader();
    const authority = authorityInput ? authorityInput.value.trim() : "";
    const headerImg = printRoot.dataset.headerImg;
    const up = (v) => (v == null ? "" : String(v).toUpperCase());
    const info = (l1, v1, l2, v2) =>
      `<tr><th>${l1}</th><td>${pText(v1)}</td><th>${l2}</th><td>${pText(v2)}</td></tr>`;
    const sign = (name, role) =>
      `<div class="p-sign"><div class="p-sign-name">${pText(name)}</div><div class="p-sign-role">${role}</div></div>`;
    return `
      <div class="p-head">
        ${headerImg ? `<img class="p-header-img" src="${headerImg}" alt="Department of Education">` : ""}
        <div class="p-title">INDIVIDUAL PERFORMANCE COMMITMENT AND REVIEW FORM (IPCRF)</div>
      </div>
      <table class="p-info">
        ${info("Name of Employee:", up(h.nameOfEmployee), "Name of Rater:", up(h.nameOfRater))}
        ${info("Position:", h.positionOfEmployee, "Position:", RATER_POSITION)}
        ${info("Review Period:", h.ratingPeriod, "Approving Authority:", up(authority))}
        ${info("Bureau/Center/Service/Division:", h.bureau, "Date of Review:", pFmtDate(h.dateOfReview))}
        <tr><th>Statement of Purpose:</th><td colspan="3">${pText(h.statementOfPurpose)}</td></tr>
      </table>
      ${printTable()}
      <div class="p-signs">
        ${sign(up(h.nameOfEmployee), "RATEE")}
        ${sign(up(h.nameOfRater), "RATER")}
        ${sign(up(authority), "APPROVING AUTHORITY")}
      </div>`;
  }

  function refreshPrintRoot() {
    if (printRoot) printRoot.innerHTML = buildPrintHtml();
  }

  // The header image only starts downloading once the print copy is built,
  // so printing straight away used to catch it before it had loaded (blank
  // on the first print, fine on the second once it was cached). Two fixes:
  //  1. preload the image as soon as the page opens, so it is cached, and
  //  2. before printing, wait (up to 4s) for every image in the print copy.
  if (printRoot && printRoot.dataset.headerImg) {
    const preload = new Image();
    preload.src = printRoot.dataset.headerImg;
  }

  function imagesReady(root, timeoutMs) {
    const waits = Array.from(root.querySelectorAll("img")).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          }),
    );
    return Promise.race([
      Promise.all(waits),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  if (printBtn && printRoot) {
    // Set while the button's own print is in progress, so the beforeprint
    // handler below doesn't rebuild the copy (and reload the image) again.
    let builtForButton = false;
    printBtn.addEventListener("click", async () => {
      printBtn.disabled = true;
      const previousTitle = document.title;
      document.title = `IRC8A IPCRF ${state.year || new Date().getFullYear()}`;
      const restore = () => {
        document.title = previousTitle;
        builtForButton = false;
        window.removeEventListener("afterprint", restore);
      };
      window.addEventListener("afterprint", restore);
      try {
        refreshPrintRoot();
        await imagesReady(printRoot, 4000);
        builtForButton = true;
        window.print();
      } finally {
        printBtn.disabled = false;
      }
    });
    // Ctrl+P / browser menu print gets the same layout (the image is already
    // cached from the preload above).
    window.addEventListener("beforeprint", () => {
      if (!builtForButton) refreshPrintRoot();
    });
  }

  // ================= Initial load =================
  async function init() {
    loadHeader();
    loadAuthority();
    try {
      const data = await apiCall("GET", "/irc/irc8a/data");
      state.year = data.year;
      state.kras = data.kras;
      render();
    } catch (err) {
      workspaceEl.style.display = "none";
      emptyAddKraBtn.style.display = "none";
      emptyStateEl.style.display = "block";
      emptyStateTextEl.textContent =
        "Couldn't load this report: " + err.message;
    }
  }

  init();
})();
