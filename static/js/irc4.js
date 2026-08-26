/* IRC4 - TA Catch-up Plan - JS */

(function () {
  "use strict";

  const MIN_OBJECTIVES = 3;
  const MAX_SUGGESTIONS = 8;

  // Master school list + DEDP-priority set, fetched once from the School
  // table on init (see loadSchools()) instead of being hardcoded here —
  // this keeps IRC4 in sync with IRC2a/IRC2b/the rest of the app by
  // construction, rather than by manually copy-pasting the roster.
  // A school may be selected into more than one group (e.g. it receives
  // TA in two different months) — no exclusivity here.
  let SCHOOLS = [];
  let DEDP_PRIORITY = new Set();

  // School name -> count of IRC2b months marked "provided" this year.
  // Fetched fresh every time the Add/Edit Group modal opens (see
  // refreshTaStatus()); schools with no TA yet simply have no entry.
  let taStatusMap = {};

  const MONTH_LABELS = {
    Jan: "January",
    Feb: "February",
    Mar: "March",
    Apr: "April",
    May: "May",
    Jun: "June",
    Jul: "July",
    Aug: "August",
    Sep: "September",
    Oct: "October",
    Nov: "November",
    Dec: "December",
  };

  /**
   * Single-activity state (only one activity per plan), mirroring
   * IRC4Plan.to_dict() on the server. `id` fields below are the database
   * row ids returned by /irc/irc4/*, not locally-generated ones — every
   * objective/group is persisted (and assigned its real id) at the point
   * it's created, not just when the page is later saved as a whole.
   * {
   *   activity: string,
   *   objectives: Array<{ id, text }>,
   *   groups: Array<{ id, schools: string[], schedule: string }>,
   *   taReceiver: string,
   *   movs: string,
   * }
   */
  let data = {
    activity: "",
    objectives: [],
    groups: [],
    taReceiver: "",
    movs: "",
  };

  // Working copy edited inside the modal; only committed to `data.groups`
  // on Save. `editingGroupId` is null while adding a brand-new group.
  let modalDraft = { editingGroupId: null, schools: [], schedule: "" };

  const els = {};

  // ---- server fetch helpers -------------------------------------------

  async function loadSchools() {
    try {
      const res = await fetch("/irc/schools");
      const payload = await res.json();
      const list = (payload && payload.schools) || [];
      SCHOOLS = list
        .map((s) => ({ name: s.name, level: s.level }))
        .sort((a, b) => a.name.localeCompare(b.name));
      DEDP_PRIORITY = new Set(
        list.filter((s) => s.is_dedp_priority).map((s) => s.name),
      );
    } catch (e) {
      SCHOOLS = [];
      DEDP_PRIORITY = new Set();
    }
  }

  // Fetched once when the Add/Edit Group modal opens (see openModal), so
  // the indicator reflects however up-to-date IRC2b's records are at the
  // moment the modal is used, without re-fetching on every keystroke.
  async function refreshTaStatus() {
    try {
      const res = await fetch("/irc/irc4/school-ta-status");
      taStatusMap = (await res.json()) || {};
    } catch (e) {
      taStatusMap = {};
    }
  }

  async function loadPlan() {
    try {
      const res = await fetch("/irc/irc4/data");
      const payload = await res.json();
      data = {
        activity: payload.activity || "",
        objectives: payload.objectives || [],
        groups: payload.groups || [],
        taReceiver: payload.taReceiver || "",
        movs: payload.movs || "",
      };
    } catch (e) {
      /* Falls back to the blank baseline declared above. */
    }
  }

  function savePlanField(field, value) {
    fetch("/irc/irc4/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    }).catch(() => {
      /* Best-effort, same as IRC2b's per-checkbox save: the field already
         reflects the change locally; a failed save just risks stale data
         on the next reload. */
    });
  }

  function debounce(fn, waitMs) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), waitMs);
    };
  }

  function letterLabel(index) {
    const letter = String.fromCharCode(97 + (index % 26)); // 'a'..'z'
    const repeat = Math.floor(index / 26) + 1;
    return letter.repeat(repeat);
  }

  function getSchoolMeta(name) {
    return SCHOOLS.find((s) => s.name === name) || null;
  }

  function isDedpSchool(name) {
    return DEDP_PRIORITY.has(name);
  }

  function monthEntries() {
    return Object.keys(MONTH_LABELS).map((code) => ({
      code,
      label: MONTH_LABELS[code],
    }));
  }

  let activeDropdown = null; // { inputEl, dropdownEl } | null

  function positionFixedDropdown(inputEl, dropdownEl) {
    const rect = inputEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    // Generous cap so many more rows are visible than the old in-modal
    // panel allowed, but still bounded by actual remaining viewport space.
    const maxHeight = Math.max(160, Math.min(360, spaceBelow));

    dropdownEl.style.position = "fixed";
    dropdownEl.style.left = `${rect.left}px`;
    dropdownEl.style.top = `${rect.bottom + 4}px`;
    dropdownEl.style.width = `${rect.width}px`;
    dropdownEl.style.maxHeight = `${maxHeight}px`;
  }

  function trackDropdown(inputEl, dropdownEl) {
    activeDropdown = { inputEl, dropdownEl };
    positionFixedDropdown(inputEl, dropdownEl);
  }

  function untrackDropdown(dropdownEl) {
    if (activeDropdown && activeDropdown.dropdownEl === dropdownEl) {
      activeDropdown = null;
    }
  }

  function repositionActiveDropdown() {
    if (!activeDropdown) return;
    positionFixedDropdown(activeDropdown.inputEl, activeDropdown.dropdownEl);
  }

  // Capture phase so this also fires for scrolling inside the modal body,
  // not just the window itself.
  window.addEventListener("scroll", repositionActiveDropdown, true);
  window.addEventListener("resize", repositionActiveDropdown);

  function cacheEls() {
    els.root = document.getElementById("irc4-tab");

    els.activityField = document.getElementById("irc4ActivityField");
    els.taReceiverField = document.getElementById("irc4TaReceiverField");
    els.movsField = document.getElementById("irc4MovsField");

    els.objectivesList = document.getElementById("irc4ObjectivesList");
    els.addObjectiveBtn = document.getElementById("irc4AddObjectiveBtn");
    els.objectivesWarning = document.getElementById("irc4ObjectivesWarning");

    els.groupsList = document.getElementById("irc4GroupsList");
    els.groupsEmpty = document.getElementById("irc4GroupsEmpty");
    els.addGroupBtn = document.getElementById("irc4AddGroupBtn");

    els.objectiveTemplate = document.getElementById("irc4-objective-template");
    els.groupViewTemplate = document.getElementById("irc4-group-view-template");
    els.chipTemplate = document.getElementById("irc4-chip-template");

    // Modal
    els.modal = document.getElementById("irc4GroupModal");
    els.modalOverlay = document.getElementById("irc4ModalOverlay");
    els.modalTitle = document.getElementById("irc4ModalTitle");
    els.modalClose = document.getElementById("irc4ModalClose");
    els.modalCancel = document.getElementById("irc4ModalCancel");
    els.modalSave = document.getElementById("irc4ModalSave");
    els.modalSchoolSearch = document.getElementById("irc4ModalSchoolSearch");
    els.modalSchoolSuggestions = document.getElementById(
      "irc4ModalSchoolSuggestions",
    );
    els.modalSchoolChips = document.getElementById("irc4ModalSchoolChips");
    els.modalSchoolEmptyHint = document.getElementById(
      "irc4ModalSchoolEmptyHint",
    );
    els.modalScheduleInput = document.getElementById("irc4ModalScheduleInput");
    els.modalScheduleSuggestions = document.getElementById(
      "irc4ModalScheduleSuggestions",
    );
  }

  // Textareas are non-resizable (CSS: resize: none) and grow purely with
  // their content, so there is never a manual drag handle. Safe to call on
  // any textarea at any time — it just measures and re-applies height.
  function autoGrow(textarea) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  // ============================================================
  // Generic view/edit field toggle
  //
  // Every text field (Activity, each Objective, TA Receiver, MOV's) is
  // built the same way in the HTML:
  //   .irc4-field
  //     .irc4-field-view                 (always present, never itself hidden)
  //       p[data-role="text"]            (view mode)
  //       textarea[data-role="input"]    (edit mode — lives in the SAME spot
  //                                        as the text, so typing happens
  //                                        right where the text was)
  //       button[data-role="edit-btn"]   (view mode — pencil)
  //       button[data-role="save-btn"]   (edit mode — check)
  //
  // Clicking the edit (pencil) button swaps the text for the textarea and
  // the pencil for a check button. Clicking the check button, blurring the
  // textarea, or pressing Enter all commit the value and swap back.
  // ============================================================

  function initEditableField(fieldEl, initialValue, onChange) {
    const textEl = fieldEl.querySelector('[data-role="text"]');
    const editBtn = fieldEl.querySelector('[data-role="edit-btn"]');
    const saveBtn = fieldEl.querySelector('[data-role="save-btn"]');
    const inputEl = fieldEl.querySelector('[data-role="input"]');
    const placeholder = textEl.dataset.placeholder || "";

    function refreshView() {
      const val = inputEl.value;
      if (val.trim()) {
        textEl.textContent = val;
        textEl.classList.remove("is-placeholder");
      } else {
        textEl.textContent = placeholder;
        textEl.classList.add("is-placeholder");
      }
    }

    function enterEdit() {
      textEl.hidden = true;
      inputEl.hidden = false;
      editBtn.hidden = true;
      saveBtn.hidden = false;
      autoGrow(inputEl);
      inputEl.focus();
      const len = inputEl.value.length;
      inputEl.setSelectionRange(len, len);
    }

    function exitEdit() {
      inputEl.hidden = true;
      textEl.hidden = false;
      editBtn.hidden = false;
      saveBtn.hidden = true;
      refreshView();
    }

    inputEl.value = initialValue || "";
    refreshView();

    editBtn.addEventListener("click", enterEdit);

    // mousedown + preventDefault keeps focus on the textarea when the save
    // button is clicked, so the click fires normally instead of racing the
    // textarea's own blur handler (same trick used for the school/schedule
    // suggestion items below).
    saveBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });
    saveBtn.addEventListener("click", () => {
      exitEdit();
      inputEl.blur();
    });

    inputEl.addEventListener("input", () => {
      autoGrow(inputEl);
      if (onChange) onChange(inputEl.value);
    });
    inputEl.addEventListener("blur", exitEdit);
    // Plain Enter commits the field (same effect as clicking the check
    // button — the existing blur handler above does the actual commit).
    // Shift+Enter falls through to the textarea's normal behavior so a
    // newline is inserted instead.
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        inputEl.blur();
      }
    });

    return { refreshView, enterEdit, exitEdit };
  }

  // ============================================================
  // Objectives
  // ============================================================

  function relabelObjectives() {
    els.objectivesList
      .querySelectorAll(".irc4-objective-item")
      .forEach((li, idx) => {
        li.querySelector(".irc4-objective-label").textContent =
          `${letterLabel(idx)}.`;
      });
  }

  function updateObjectivesWarning() {
    els.objectivesWarning.hidden = data.objectives.length >= MIN_OBJECTIVES;
  }

  function buildObjectiveNode(obj) {
    const frag = els.objectiveTemplate.content.cloneNode(true);
    const li = frag.querySelector(".irc4-objective-item");
    li.dataset.objId = obj.id;

    // Debounced so typing doesn't fire a save on every keystroke — only
    // once input has paused for a moment (same tradeoff as savePlanField).
    const saveText = debounce((val) => {
      fetch("/irc/irc4/objective", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: obj.id, text: val }),
      }).catch(() => {
        /* Best-effort: obj.text already reflects the change locally. */
      });
    }, 500);

    const fieldEl = li.querySelector(".irc4-field");
    initEditableField(fieldEl, obj.text, (val) => {
      obj.text = val;
      saveText(val);
    });

    return li;
  }

  // Renders whatever's currently in data.objectives (loaded from the
  // server) — used once at init, after loadPlan() has populated it.
  function renderObjectivesFromData() {
    els.objectivesList.innerHTML = "";
    data.objectives.forEach((obj) => {
      els.objectivesList.appendChild(buildObjectiveNode(obj));
    });
    relabelObjectives();
    updateObjectivesWarning();
  }

  // "Add Objective" creates the row server-side first, so it gets a real
  // id before anything tries to reference it (e.g. a save fired from a
  // fast follow-up edit).
  async function addObjective() {
    let obj;
    try {
      const res = await fetch("/irc/irc4/objective", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" }),
      });
      obj = await res.json();
    } catch (e) {
      return; // Can't track an objective that was never actually saved.
    }

    data.objectives.push(obj);
    const li = buildObjectiveNode(obj);
    els.objectivesList.appendChild(li);
    relabelObjectives();
    updateObjectivesWarning();
  }

  function removeObjective(objId) {
    const idx = data.objectives.findIndex(
      (o) => String(o.id) === String(objId),
    );
    if (idx === -1) return;
    data.objectives.splice(idx, 1);

    const li = els.objectivesList.querySelector(
      `.irc4-objective-item[data-obj-id="${CSS.escape(String(objId))}"]`,
    );
    if (li) li.remove();

    relabelObjectives();
    updateObjectivesWarning();

    fetch(`/irc/irc4/objective/${encodeURIComponent(objId)}`, {
      method: "DELETE",
    }).catch(() => {
      /* Best-effort, same as everywhere else — the item is already gone
         from the UI; a failed delete just risks it reappearing on reload. */
    });
  }

  function onObjectivesClick(e) {
    const removeBtn = e.target.closest(".irc4-objective-remove");
    if (!removeBtn) return;
    const li = removeBtn.closest(".irc4-objective-item");
    if (li) removeObjective(li.dataset.objId);
  }

  // ============================================================
  // School + Schedule groups — read-only cards on the page, all editing
  // happens through the Add/Edit Group modal.
  // ============================================================

  function updateGroupsEmptyState() {
    els.groupsEmpty.hidden = data.groups.length !== 0;
  }

  function groupTitle(group) {
    if (!group.schedule) return "No month selected";
    return `${MONTH_LABELS[group.schedule] || group.schedule} Schedule`;
  }

  function buildGroupViewNode(group) {
    const frag = els.groupViewTemplate.content.cloneNode(true);
    const card = frag.querySelector(".irc4-group-view");
    card.dataset.groupId = group.id;

    const title = card.querySelector('[data-role="title"]');
    title.textContent = groupTitle(group);
    title.classList.toggle("is-unset", !group.schedule);

    const list = card.querySelector('[data-role="school-list"]');
    list.innerHTML = "";
    if (group.schools.length === 0) {
      const li = document.createElement("li");
      li.className = "irc4-group-view-empty";
      li.textContent = "No schools selected";
      list.appendChild(li);
    } else {
      group.schools.forEach((name) => {
        const meta = getSchoolMeta(name);
        const li = document.createElement("li");
        li.className = "irc4-group-school-item";
        if (meta) li.dataset.level = meta.level;

        const nameSpan = document.createElement("span");
        nameSpan.className = "irc4-group-school-name";
        nameSpan.textContent = name;
        li.appendChild(nameSpan);

        if (isDedpSchool(name)) {
          const badge = document.createElement("span");
          badge.className = "irc4-badge irc4-badge--dedp";
          badge.textContent = "DEDP";
          li.appendChild(badge);
        }

        list.appendChild(li);
      });
    }

    return card;
  }

  function renderGroupView(group) {
    const existing = els.groupsList.querySelector(
      `.irc4-group-view[data-group-id="${CSS.escape(String(group.id))}"]`,
    );
    const node = buildGroupViewNode(group);
    if (existing) {
      existing.replaceWith(node);
    } else {
      els.groupsList.appendChild(node);
    }
  }

  function removeGroup(groupId) {
    const idx = data.groups.findIndex((g) => String(g.id) === String(groupId));
    if (idx === -1) return;
    data.groups.splice(idx, 1);

    const card = els.groupsList.querySelector(
      `.irc4-group-view[data-group-id="${CSS.escape(String(groupId))}"]`,
    );
    if (card) card.remove();

    updateGroupsEmptyState();

    fetch(`/irc/irc4/group/${encodeURIComponent(groupId)}`, {
      method: "DELETE",
    }).catch(() => {
      /* Best-effort, same as everywhere else in this file. */
    });
  }

  function findGroup(groupId) {
    return data.groups.find((g) => String(g.id) === String(groupId)) || null;
  }

  function onGroupsClick(e) {
    const deleteBtn = e.target.closest(".irc4-group-delete-btn");
    if (deleteBtn) {
      const card = deleteBtn.closest(".irc4-group-view");
      if (!card) return;
      if (confirm("Delete this group and its selected schools?")) {
        removeGroup(card.dataset.groupId);
      }
      return;
    }

    const editBtn = e.target.closest(".irc4-group-edit-btn");
    if (editBtn) {
      const card = editBtn.closest(".irc4-group-view");
      if (card) openEditGroupModal(card.dataset.groupId);
      return;
    }
  }

  // ---- modal: TA-provided indicator (sourced from IRC2b, via taStatusMap) --
  //
  // Shown only inside the modal (search dropdown + selected chips) — never
  // on the main page's read-only group cards. Always renders the box
  // (school's level color), but only fills in the check + count when
  // taStatusMap has a > 0 entry for that school; otherwise it's an empty
  // colored strip of the same fixed width.

  function buildTaIndicatorBox(name, meta) {
    const box = document.createElement("span");
    box.className = "irc4-ta-indicator";
    if (meta && meta.level) box.dataset.level = meta.level;

    const count = taStatusMap[name] || 0;
    if (count > 0) {
      box.innerHTML =
        '<svg class="irc4-ta-indicator-icon" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="20 6 9 17 4 12"></polyline></svg>' +
        `<span class="irc4-ta-indicator-label">TA<br>${count}X</span>`;
    }

    return box;
  }

  // ---- modal: school search + selected list --------------------------

  function renderModalChips() {
    els.modalSchoolChips.innerHTML = "";
    modalDraft.schools.forEach((name) => {
      const frag = els.chipTemplate.content.cloneNode(true);
      const row = frag.querySelector(".irc4-school-row");
      row.dataset.school = name;

      const meta = getSchoolMeta(name);
      if (meta) row.dataset.level = meta.level;

      // Flush against the row's left edge, ahead of everything else.
      row.insertBefore(buildTaIndicatorBox(name, meta), row.firstChild);

      row.querySelector(".irc4-school-row-name").textContent = name;

      if (isDedpSchool(name)) {
        // Reverted: badge is inserted directly into the row (a plain flex
        // sibling next to the name and remove button), spread apart via
        // justify-content: space-between on .irc4-school-row-content — not
        // grouped into a wrapper next to the remove button.
        const badge = document.createElement("span");
        badge.className = "irc4-badge irc4-badge--dedp";
        badge.textContent = "DEDP";
        row.insertBefore(badge, row.querySelector(".irc4-chip-remove"));
      }

      els.modalSchoolChips.appendChild(row);
    });
    els.modalSchoolEmptyHint.hidden = modalDraft.schools.length !== 0;
  }

  function hideSuggestions() {
    els.modalSchoolSuggestions.hidden = true;
    els.modalSchoolSuggestions.innerHTML = "";
    untrackDropdown(els.modalSchoolSuggestions);
  }

  function buildSchoolSuggestionItem(school) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "irc4-school-suggestion-item";
    item.dataset.name = school.name;
    if (school.level) item.dataset.level = school.level;

    // Flush against the item's left edge, ahead of everything else.
    item.appendChild(buildTaIndicatorBox(school.name, school));

    const content = document.createElement("span");
    content.className = "irc4-school-suggestion-content";

    const nameSpan = document.createElement("span");
    nameSpan.className = "irc4-school-suggestion-name";
    nameSpan.textContent = school.name;
    content.appendChild(nameSpan);

    if (isDedpSchool(school.name)) {
      const badge = document.createElement("span");
      badge.className = "irc4-badge irc4-badge--dedp";
      badge.textContent = "DEDP";
      content.appendChild(badge);
    }

    item.appendChild(content);

    // mousedown + preventDefault so the search input never blurs before
    // the click is registered (avoids a focus/blur race condition).
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      addSchoolToDraft(school.name);
    });

    return item;
  }

  // With no query, show every not-yet-selected school (the panel scrolls,
  // so there's no need to truncate the full list) — this is the "default"
  // dropdown view that opens on click/focus. Once there's a query, narrow
  // it down and cap it so the list stays easy to scan.
  function renderSuggestions(query) {
    const q = query.trim().toLowerCase();
    const available = SCHOOLS.filter(
      (s) => !modalDraft.schools.includes(s.name),
    );
    const matches = q
      ? available
          .filter((s) => s.name.toLowerCase().includes(q))
          .slice(0, MAX_SUGGESTIONS)
      : available;

    if (matches.length === 0) {
      hideSuggestions();
      return;
    }

    els.modalSchoolSuggestions.innerHTML = "";
    matches.forEach((s) => {
      els.modalSchoolSuggestions.appendChild(buildSchoolSuggestionItem(s));
    });
    els.modalSchoolSuggestions.hidden = false;
    trackDropdown(els.modalSchoolSearch, els.modalSchoolSuggestions);
  }

  function addSchoolToDraft(name) {
    if (!name) return;
    if (!modalDraft.schools.includes(name)) {
      modalDraft.schools.push(name);
    }
    els.modalSchoolSearch.value = "";
    hideSuggestions();
    renderModalChips();
    els.modalSchoolSearch.focus();
  }

  function removeSchoolFromDraft(name) {
    const idx = modalDraft.schools.indexOf(name);
    if (idx === -1) return;
    modalDraft.schools.splice(idx, 1);
    renderModalChips();
  }

  function onModalChipsClick(e) {
    const removeBtn = e.target.closest(".irc4-chip-remove");
    if (!removeBtn) return;
    const row = removeBtn.closest(".irc4-school-row");
    if (row) removeSchoolFromDraft(row.dataset.school);
  }

  function onModalSchoolSearchInput(e) {
    renderSuggestions(e.target.value);
  }

  function onModalSchoolSearchKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const firstItem = els.modalSchoolSuggestions.querySelector(
        ".irc4-school-suggestion-item",
      );
      if (firstItem) addSchoolToDraft(firstItem.dataset.name);
    } else if (e.key === "Escape") {
      hideSuggestions();
    }
  }

  // Opening the field (by focusing or clicking it) always shows the full
  // dropdown of remaining schools, regardless of whatever text happens to
  // be sitting in the input. It only narrows once the person actually
  // types (see onModalSchoolSearchInput) — so re-clicking a field never
  // feels "stuck" in plain typing mode with no options visible.
  //
  // `suppressNextSchoolOpen` guards the one case where we focus() the
  // field ourselves (right when the modal opens) — that shouldn't pop the
  // dropdown open before the person has actually asked for it.
  let suppressNextSchoolOpen = false;

  function onModalSchoolSearchOpen() {
    if (suppressNextSchoolOpen) {
      suppressNextSchoolOpen = false;
      return;
    }
    renderSuggestions("");
  }

  function onModalSchoolSearchBlur() {
    // Small delay so a mousedown-triggered suggestion click (which already
    // prevents default) still has time to run before we hide the list.
    setTimeout(hideSuggestions, 100);
  }

  // ---- modal: schedule combobox ---------------------------------------
  //
  // Same interaction pattern as the school search above: clicking/focusing
  // the field opens a dropdown of all twelve months so it can be picked
  // with the mouse, and typing filters that list down (by name or 3-letter
  // code) so it can be reached from the keyboard too. It also uses the
  // same fixed-position tracking (trackDropdown/untrackDropdown) as the
  // school search, so it escapes the modal's clipped bounds in exactly
  // the same way.

  function hideScheduleSuggestions() {
    els.modalScheduleSuggestions.hidden = true;
    els.modalScheduleSuggestions.innerHTML = "";
    untrackDropdown(els.modalScheduleSuggestions);
  }

  function renderScheduleSuggestions(query) {
    const q = query.trim().toLowerCase();
    const all = monthEntries();
    const matches = q
      ? all.filter(
          (m) =>
            m.label.toLowerCase().includes(q) ||
            m.code.toLowerCase().includes(q),
        )
      : all;

    if (matches.length === 0) {
      hideScheduleSuggestions();
      return;
    }

    els.modalScheduleSuggestions.innerHTML = "";
    matches.forEach((m) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "irc4-school-suggestion-item";
      item.dataset.code = m.code;

      const content = document.createElement("span");
      content.className = "irc4-school-suggestion-content";
      content.textContent = m.label;
      item.appendChild(content);

      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectScheduleMonth(m.code);
      });
      els.modalScheduleSuggestions.appendChild(item);
    });
    els.modalScheduleSuggestions.hidden = false;
    trackDropdown(els.modalScheduleInput, els.modalScheduleSuggestions);
  }

  function selectScheduleMonth(code) {
    modalDraft.schedule = code;
    els.modalScheduleInput.value = MONTH_LABELS[code] || "";
    hideScheduleSuggestions();
    els.modalScheduleInput.focus();
  }

  // Reconciles whatever text is currently sitting in the input with a real
  // month. The schedule is a fixed enum, so free text that doesn't match
  // anything falls back to the last confirmed selection instead of being
  // saved as-is.
  function resolveScheduleInput() {
    const typed = els.modalScheduleInput.value.trim().toLowerCase();

    if (!typed) {
      modalDraft.schedule = "";
      els.modalScheduleInput.value = "";
      return;
    }

    const match = monthEntries().find(
      (m) => m.label.toLowerCase() === typed || m.code.toLowerCase() === typed,
    );

    if (match) {
      modalDraft.schedule = match.code;
      els.modalScheduleInput.value = match.label;
    } else {
      els.modalScheduleInput.value = MONTH_LABELS[modalDraft.schedule] || "";
    }
  }

  function onModalScheduleInput(e) {
    renderScheduleSuggestions(e.target.value);
  }

  // Opening the field (focus or click) always shows all twelve months,
  // even if a month was already picked and its label is sitting in the
  // input — otherwise re-clicking a filled-in field just filters the list
  // down to the one already-selected match. Only actual typing narrows it
  // (see onModalScheduleInput).
  function onModalScheduleOpen() {
    renderScheduleSuggestions("");
  }

  function onModalScheduleKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const firstItem = els.modalScheduleSuggestions.querySelector(
        ".irc4-school-suggestion-item",
      );
      if (firstItem) {
        selectScheduleMonth(firstItem.dataset.code);
      } else {
        resolveScheduleInput();
        hideScheduleSuggestions();
      }
    } else if (e.key === "Escape") {
      hideScheduleSuggestions();
    }
  }

  function onModalScheduleBlur() {
    // Same delay trick as the school search: let a mousedown-triggered
    // suggestion click land before the dropdown disappears.
    setTimeout(() => {
      resolveScheduleInput();
      hideScheduleSuggestions();
    }, 100);
  }

  // ---- modal: open / close / save -------------------------------------

  async function openModal() {
    els.modalSchoolSearch.value = "";
    hideSuggestions();
    els.modalScheduleInput.value = MONTH_LABELS[modalDraft.schedule] || "";
    hideScheduleSuggestions();

    els.modal.style.display = "flex";
    suppressNextSchoolOpen = true;
    els.modalSchoolSearch.focus();

    // Render immediately with whatever TA-status data is already cached
    // (empty on the very first open this session), then fetch a fresh
    // copy and re-render so the indicator reflects IRC2b's current
    // records rather than a stale snapshot from an earlier modal open.
    renderModalChips();
    await refreshTaStatus();
    renderModalChips();
  }

  async function openAddGroupModal() {
    modalDraft = { editingGroupId: null, schools: [], schedule: "" };
    els.modalTitle.textContent = "Add Group";
    els.modalSave.textContent = "Save Group";
    await openModal();
  }

  async function openEditGroupModal(groupId) {
    const group = findGroup(groupId);
    if (!group) return;
    modalDraft = {
      editingGroupId: group.id,
      schools: group.schools.slice(),
      schedule: group.schedule,
    };
    els.modalTitle.textContent = "Edit Group";
    els.modalSave.textContent = "Save Changes";
    await openModal();
  }

  function closeModal() {
    els.modal.style.display = "none";
    hideSuggestions();
    hideScheduleSuggestions();
  }

  async function saveModal() {
    // Resolve any schedule text the user typed but never blurred out of
    // (e.g. they typed a month then clicked Save directly).
    resolveScheduleInput();

    const payload = {
      schools: modalDraft.schools.slice(),
      schedule: modalDraft.schedule || null,
    };
    if (modalDraft.editingGroupId) payload.id = modalDraft.editingGroupId;

    let saved;
    try {
      const res = await fetch("/irc/irc4/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      saved = await res.json();
    } catch (e) {
      closeModal();
      return; // Nothing persisted, nothing to render.
    }

    const group = {
      id: saved.id,
      schools: saved.schools || [],
      schedule: saved.schedule || "",
    };

    if (modalDraft.editingGroupId) {
      const idx = data.groups.findIndex(
        (g) => String(g.id) === String(group.id),
      );
      if (idx !== -1) data.groups[idx] = group;
      else data.groups.push(group);
    } else {
      data.groups.push(group);
    }

    renderGroupView(group);
    updateGroupsEmptyState();
    closeModal();
  }

  // ============================================================
  // Init
  // ============================================================

  const debouncedSaveActivity = debounce(
    (val) => savePlanField("activity", val),
    500,
  );
  const debouncedSaveTaReceiver = debounce(
    (val) => savePlanField("taReceiver", val),
    500,
  );
  const debouncedSaveMovs = debounce((val) => savePlanField("movs", val), 500);

  async function init() {
    cacheEls();
    if (!els.root) return; // not on this page

    // Schools first (objectives/groups render against SCHOOLS metadata),
    // then the saved plan itself.
    await loadSchools();
    await loadPlan();

    initEditableField(els.activityField, data.activity, (val) => {
      data.activity = val;
      debouncedSaveActivity(val);
    });
    initEditableField(els.taReceiverField, data.taReceiver, (val) => {
      data.taReceiver = val;
      debouncedSaveTaReceiver(val);
    });
    initEditableField(els.movsField, data.movs, (val) => {
      data.movs = val;
      debouncedSaveMovs(val);
    });

    els.addObjectiveBtn.addEventListener("click", addObjective);
    els.objectivesList.addEventListener("click", onObjectivesClick);

    els.addGroupBtn.addEventListener("click", openAddGroupModal);
    els.groupsList.addEventListener("click", onGroupsClick);

    els.modalClose.addEventListener("click", closeModal);
    els.modalCancel.addEventListener("click", closeModal);
    els.modalOverlay.addEventListener("click", closeModal);
    els.modalSave.addEventListener("click", saveModal);
    els.modalSchoolChips.addEventListener("click", onModalChipsClick);
    els.modalSchoolSearch.addEventListener("input", onModalSchoolSearchInput);
    els.modalSchoolSearch.addEventListener(
      "keydown",
      onModalSchoolSearchKeydown,
    );
    els.modalSchoolSearch.addEventListener("focus", onModalSchoolSearchOpen);
    // 'click' is needed too: if the field is already focused, clicking it
    // again fires no 'focus' event, so without this the dropdown would
    // stay closed until the person started typing.
    els.modalSchoolSearch.addEventListener("click", onModalSchoolSearchOpen);
    els.modalSchoolSearch.addEventListener("blur", onModalSchoolSearchBlur);

    els.modalScheduleInput.addEventListener("input", onModalScheduleInput);
    els.modalScheduleInput.addEventListener("keydown", onModalScheduleKeydown);
    els.modalScheduleInput.addEventListener("focus", onModalScheduleOpen);
    els.modalScheduleInput.addEventListener("click", onModalScheduleOpen);
    els.modalScheduleInput.addEventListener("blur", onModalScheduleBlur);

    // Objectives/groups were already loaded by loadPlan() above (the
    // server guarantees at least three blank objectives exist) — render
    // what came back instead of seeding it client-side.
    renderObjectivesFromData();
    data.groups.forEach(renderGroupView);
    updateGroupsEmptyState();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
