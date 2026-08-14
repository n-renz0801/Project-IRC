/* IRC4 - TA Catch-up Plan - JS */

(function () {
  "use strict";

  const MIN_OBJECTIVES = 3;
  const MAX_SUGGESTIONS = 8;

  // Same master school list used in IRC2a, kept in sync so a school name
  // selected here matches what IRC2a already tracks — including its level
  // (elementary/secondary) and DEDP-priority status, which now drive this
  // page's color-coding and badges too. A school may be selected into more
  // than one group (e.g. it receives TA in two different months) — no
  // exclusivity here.
  const SCHOOLS = [
    { name: "Antipolo City Senior High School", level: "secondary" },
    { name: "Antipolo City SPED Center", level: "elementary" },
    { name: "Antipolo National Science and Technology HS", level: "secondary" },
    { name: "Antipolo NHS", level: "secondary" },
    { name: "Apia Integrated School", level: "secondary" },
    { name: "Bagong Nayon I ES", level: "elementary" },
    { name: "Bagong Nayon II ES", level: "elementary" },
    { name: "Bagong Nayon II NHS", level: "secondary" },
    { name: "Bagong Nayon IV ES", level: "elementary" },
    { name: "Binayoyo Integrated School", level: "secondary" },
    { name: "Cabading ES", level: "elementary" },
    { name: "Calawis ES", level: "elementary" },
    { name: "Calawis NHS", level: "secondary" },
    { name: "Canumay ES", level: "elementary" },
    { name: "Canumay NHS", level: "secondary" },
    { name: "Cupang ES", level: "elementary" },
    { name: "Cupang ES Annex", level: "elementary" },
    { name: "Cupang NHS", level: "secondary" },
    { name: "Dalig ES", level: "elementary" },
    { name: "Dalig NHS", level: "secondary" },
    { name: "Dela Paz ES", level: "elementary" },
    { name: "Dela Paz NHS", level: "secondary" },
    { name: "Inuman ES", level: "elementary" },
    { name: "Isaias S. Tapales ES", level: "elementary" },
    { name: "Jesus S. Cabarrus ES", level: "elementary" },
    { name: "Juan Sumulong ES", level: "elementary" },
    { name: "Kaila ES", level: "elementary" },
    { name: "Kaysakat ES", level: "elementary" },
    { name: "Kaysakat NHS", level: "secondary" },
    { name: "Knights of Columbus ES", level: "elementary" },
    { name: "Libis ES", level: "elementary" },
    { name: "Lores ES", level: "elementary" },
    { name: "Mambugan I ES", level: "elementary" },
    { name: "Mambugan II ES", level: "elementary" },
    { name: "Mambugan NHS", level: "secondary" },
    { name: "Marcelino M. Santos NHS", level: "secondary" },
    { name: "Maximo L. Gatlabayan MNHS", level: "secondary" },
    { name: "Mayamot ES", level: "elementary" },
    { name: "Mayamot NHS", level: "secondary" },
    { name: "Muntindilaw ES", level: "elementary" },
    { name: "Muntindilaw NHS", level: "secondary" },
    { name: "Nazarene Ville ES", level: "elementary" },
    { name: "Old Boso-Boso ES", level: "elementary" },
    { name: "Old Boso-Boso NHS", level: "secondary" },
    { name: "Paglitaw ES", level: "elementary" },
    { name: "Pantay ES", level: "elementary" },
    { name: "Peace Village ES", level: "elementary" },
    { name: "Peñafrancia ES", level: "elementary" },
    { name: "Peñafrancia ES Annex", level: "elementary" },
    { name: "Rizza ES", level: "elementary" },
    { name: "Rizza NHS", level: "secondary" },
    { name: "San Antonio Village ES", level: "elementary" },
    { name: "San Isidro ES", level: "elementary" },
    { name: "San Isidro NHS", level: "secondary" },
    { name: "San Jose NHS", level: "secondary" },
    { name: "San Joseph ES", level: "elementary" },
    { name: "San Juan NHS", level: "secondary" },
    { name: "San Luis ES", level: "elementary" },
    { name: "San Roque NHS", level: "secondary" },
    { name: "San Ysiro ES", level: "elementary" },
    { name: "Sapinit ES", level: "elementary" },
    { name: "Sta. Cruz ES", level: "elementary" },
    { name: "Sumilang ES", level: "elementary" },
    { name: "Taguete ES", level: "elementary" },
    { name: "Tanza ES", level: "elementary" },
    { name: "Teofila Z. Rovero MES", level: "elementary" },
    { name: "Upper Kilingan ES", level: "elementary" },
  ]
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  // Schools tagged as DEDP Priority — identical set to IRC2a.
  const DEDP_PRIORITY = new Set([
    "Antipolo NHS",
    "Bagong Nayon I ES",
    "Bagong Nayon II ES",
    "Bagong Nayon II NHS",
    "Bagong Nayon IV ES",
    "Cupang ES",
    "Dalig NHS",
    "Dela Paz ES",
    "Jesus S. Cabarrus ES",
    "Juan Sumulong ES",
    "Kaysakat ES",
    "Lores ES",
    "Mambugan I ES",
    "Mambugan II ES",
    "Mambugan NHS",
    "Maximo L. Gatlabayan MNHS",
    "Mayamot ES",
    "Muntindilaw ES",
    "Peace Village ES",
    "Peñafrancia ES",
    "Rizza ES",
    "San Antonio Village ES",
    "San Isidro ES",
    "San Isidro NHS",
    "San Jose NHS",
    "Tanza ES",
  ]);

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
   * Single-activity state (only one activity per plan).
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

  let uidCounter = 0;
  const els = {};

  function genId(prefix) {
    uidCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
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

  // ============================================================
  // Fixed-position dropdowns
  //
  // The modal clips its own contents (overflow: hidden/auto) so its own
  // height can stay capped even as the school list grows. `position: fixed`
  // is the escape hatch: a fixed element is placed relative to the
  // viewport, not to any scrolling/clipping ancestor, so anchoring the
  // suggestion panels this way lets them extend past the modal's edges
  // and show more rows at once instead of being cut off at the modal
  // boundary. We compute the anchor position in JS (from the input's own
  // on-screen position) and keep it in sync while the panel is open.
  //
  // Both the school-search dropdown and the schedule dropdown share this
  // same tracking mechanism (see renderSuggestions/hideSuggestions and
  // renderScheduleSuggestions/hideScheduleSuggestions below) so they
  // behave identically with respect to the modal's boundaries.
  // ============================================================

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
  //     .irc4-field-view              (visible by default)
  //       p[data-role="text"]
  //       button[data-role="edit-btn"]
  //     textarea[data-role="input"]   (hidden by default)
  //
  // Clicking the edit button swaps to the textarea; blurring the textarea
  // commits the value back into plain, non-clickable text.
  // ============================================================

  function initEditableField(fieldEl, initialValue, onChange) {
    const viewEl = fieldEl.querySelector(".irc4-field-view");
    const textEl = fieldEl.querySelector('[data-role="text"]');
    const editBtn = fieldEl.querySelector('[data-role="edit-btn"]');
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
      viewEl.hidden = true;
      inputEl.hidden = false;
      autoGrow(inputEl);
      inputEl.focus();
      const len = inputEl.value.length;
      inputEl.setSelectionRange(len, len);
    }

    function exitEdit() {
      inputEl.hidden = true;
      viewEl.hidden = false;
      refreshView();
    }

    inputEl.value = initialValue || "";
    refreshView();

    editBtn.addEventListener("click", enterEdit);
    inputEl.addEventListener("input", () => {
      autoGrow(inputEl);
      if (onChange) onChange(inputEl.value);
    });
    inputEl.addEventListener("blur", exitEdit);
    // Plain Enter commits the field (same effect as clicking away — the
    // existing blur handler above does the actual commit/view-swap).
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

    const fieldEl = li.querySelector(".irc4-field");
    initEditableField(fieldEl, obj.text, (val) => {
      obj.text = val;
    });

    return li;
  }

  function addObjective() {
    const obj = { id: genId("obj"), text: "" };
    data.objectives.push(obj);

    const li = buildObjectiveNode(obj);
    els.objectivesList.appendChild(li);
    relabelObjectives();
    updateObjectivesWarning();
  }

  function removeObjective(objId) {
    const idx = data.objectives.findIndex((o) => o.id === objId);
    if (idx === -1) return;
    data.objectives.splice(idx, 1);

    const li = els.objectivesList.querySelector(
      `.irc4-objective-item[data-obj-id="${CSS.escape(objId)}"]`,
    );
    if (li) li.remove();

    relabelObjectives();
    updateObjectivesWarning();
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
      `.irc4-group-view[data-group-id="${CSS.escape(group.id)}"]`,
    );
    const node = buildGroupViewNode(group);
    if (existing) {
      existing.replaceWith(node);
    } else {
      els.groupsList.appendChild(node);
    }
  }

  function removeGroup(groupId) {
    const idx = data.groups.findIndex((g) => g.id === groupId);
    if (idx === -1) return;
    data.groups.splice(idx, 1);

    const card = els.groupsList.querySelector(
      `.irc4-group-view[data-group-id="${CSS.escape(groupId)}"]`,
    );
    if (card) card.remove();

    updateGroupsEmptyState();
  }

  function findGroup(groupId) {
    return data.groups.find((g) => g.id === groupId) || null;
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

  // ---- modal: school search + selected list --------------------------

  function renderModalChips() {
    els.modalSchoolChips.innerHTML = "";
    modalDraft.schools.forEach((name) => {
      const frag = els.chipTemplate.content.cloneNode(true);
      const row = frag.querySelector(".irc4-school-row");
      row.dataset.school = name;

      const meta = getSchoolMeta(name);
      if (meta) row.dataset.level = meta.level;

      row.querySelector(".irc4-school-row-name").textContent = name;

      if (isDedpSchool(name)) {
        // Badge is inserted into .irc4-school-row-end (not `row` itself),
        // since the remove button now lives inside that wrapper — this
        // keeps the badge grouped visually next to the trash icon instead
        // of floating in the middle of the row.
        const badge = document.createElement("span");
        badge.className = "irc4-badge irc4-badge--dedp";
        badge.textContent = "DEDP";
        const rowEnd = row.querySelector(".irc4-school-row-end");
        rowEnd.insertBefore(badge, rowEnd.querySelector(".irc4-chip-remove"));
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

    const nameSpan = document.createElement("span");
    nameSpan.className = "irc4-school-suggestion-name";
    nameSpan.textContent = school.name;
    item.appendChild(nameSpan);

    if (isDedpSchool(school.name)) {
      const badge = document.createElement("span");
      badge.className = "irc4-badge irc4-badge--dedp";
      badge.textContent = "DEDP";
      item.appendChild(badge);
    }

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
      item.textContent = m.label;
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

  function openModal() {
    els.modalSchoolSearch.value = "";
    hideSuggestions();
    els.modalScheduleInput.value = MONTH_LABELS[modalDraft.schedule] || "";
    hideScheduleSuggestions();
    renderModalChips();
    els.modal.style.display = "flex";
    suppressNextSchoolOpen = true;
    els.modalSchoolSearch.focus();
  }

  function openAddGroupModal() {
    modalDraft = { editingGroupId: null, schools: [], schedule: "" };
    els.modalTitle.textContent = "Add Group";
    els.modalSave.textContent = "Save Group";
    openModal();
  }

  function openEditGroupModal(groupId) {
    const group = findGroup(groupId);
    if (!group) return;
    modalDraft = {
      editingGroupId: group.id,
      schools: group.schools.slice(),
      schedule: group.schedule,
    };
    els.modalTitle.textContent = "Edit Group";
    els.modalSave.textContent = "Save Changes";
    openModal();
  }

  function closeModal() {
    els.modal.style.display = "none";
    hideSuggestions();
    hideScheduleSuggestions();
  }

  // NOTE: irc4.js is unchanged from the previous version — no JS edits were
  // needed for the modal height cap, badge alignment, or numbering. Those are
  // handled entirely in irc4.html (chip template markup) and irc4.css.
  function saveModal() {
    // Resolve any schedule text the user typed but never blurred out of
    // (e.g. they typed a month then clicked Save directly).
    resolveScheduleInput();

    if (modalDraft.editingGroupId) {
      const group = findGroup(modalDraft.editingGroupId);
      if (group) {
        group.schools = modalDraft.schools.slice();
        group.schedule = modalDraft.schedule;
        renderGroupView(group);
      }
    } else {
      const group = {
        id: genId("group"),
        schools: modalDraft.schools.slice(),
        schedule: modalDraft.schedule,
      };
      data.groups.push(group);
      renderGroupView(group);
    }

    updateGroupsEmptyState();
    closeModal();
  }

  // ============================================================
  // Init
  // ============================================================

  function init() {
    cacheEls();
    if (!els.root) return; // not on this page

    initEditableField(els.activityField, data.activity, (val) => {
      data.activity = val;
    });
    initEditableField(els.taReceiverField, data.taReceiver, (val) => {
      data.taReceiver = val;
    });
    initEditableField(els.movsField, data.movs, (val) => {
      data.movs = val;
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

    // Start with the recommended minimum of three objective fields.
    // Groups start empty — the user adds the first one via the modal.
    for (let i = 0; i < MIN_OBJECTIVES; i++) addObjective();
    updateGroupsEmptyState();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
