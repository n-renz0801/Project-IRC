/* IRC4 - TA Catch-up Plan - JS */

(function () {
  "use strict";

  const MIN_OBJECTIVES = 3;
  const MAX_SUGGESTIONS = 8;

  // Same master school list used in IRC2a, kept in sync so a school name
  // selected here matches what IRC2a already tracks. A school may be
  // selected into more than one group (e.g. it receives TA in two
  // different months) — no exclusivity here.
  const SCHOOLS = [
    "Antipolo City Senior High School",
    "Antipolo City SPED Center",
    "Antipolo National Science and Technology HS",
    "Antipolo NHS",
    "Apia Integrated School",
    "Bagong Nayon I ES",
    "Bagong Nayon II ES",
    "Bagong Nayon II NHS",
    "Bagong Nayon IV ES",
    "Binayoyo Integrated School",
    "Cabading ES",
    "Calawis ES",
    "Calawis NHS",
    "Canumay ES",
    "Canumay NHS",
    "Cupang ES",
    "Cupang ES Annex",
    "Cupang NHS",
    "Dalig ES",
    "Dalig NHS",
    "Dela Paz ES",
    "Dela Paz NHS",
    "Inuman ES",
    "Isaias S. Tapales ES",
    "Jesus S. Cabarrus ES",
    "Juan Sumulong ES",
    "Kaila ES",
    "Kaysakat ES",
    "Kaysakat NHS",
    "Knights of Columbus ES",
    "Libis ES",
    "Lores ES",
    "Mambugan I ES",
    "Mambugan II ES",
    "Mambugan NHS",
    "Marcelino M. Santos NHS",
    "Maximo L. Gatlabayan MNHS",
    "Mayamot ES",
    "Mayamot NHS",
    "Muntindilaw ES",
    "Muntindilaw NHS",
    "Nazarene Ville ES",
    "Old Boso-Boso ES",
    "Old Boso-Boso NHS",
    "Paglitaw ES",
    "Pantay ES",
    "Peace Village ES",
    "Peñafrancia ES",
    "Peñafrancia ES Annex",
    "Rizza ES",
    "Rizza NHS",
    "San Antonio Village ES",
    "San Isidro ES",
    "San Isidro NHS",
    "San Jose NHS",
    "San Joseph ES",
    "San Juan NHS",
    "San Luis ES",
    "San Roque NHS",
    "San Ysiro ES",
    "Sapinit ES",
    "Sta. Cruz ES",
    "Sumilang ES",
    "Taguete ES",
    "Tanza ES",
    "Teofila Z. Rovero MES",
    "Upper Kilingan ES",
  ]
    .slice()
    .sort((a, b) => a.localeCompare(b));

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
    els.modalSchedule = document.getElementById("irc4ModalSchedule");
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
        const li = document.createElement("li");
        li.textContent = name;
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
      row.querySelector(".irc4-school-row-name").textContent = name;
      els.modalSchoolChips.appendChild(row);
    });
    els.modalSchoolEmptyHint.hidden = modalDraft.schools.length !== 0;
  }

  function hideSuggestions() {
    els.modalSchoolSuggestions.hidden = true;
    els.modalSchoolSuggestions.innerHTML = "";
  }

  function renderSuggestions(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      hideSuggestions();
      return;
    }

    const matches = SCHOOLS.filter(
      (name) =>
        !modalDraft.schools.includes(name) && name.toLowerCase().includes(q),
    ).slice(0, MAX_SUGGESTIONS);

    if (matches.length === 0) {
      hideSuggestions();
      return;
    }

    els.modalSchoolSuggestions.innerHTML = "";
    matches.forEach((name) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "irc4-school-suggestion-item";
      item.textContent = name;
      // mousedown + preventDefault so the search input never blurs before
      // the click is registered (avoids a focus/blur race condition).
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        addSchoolToDraft(name);
      });
      els.modalSchoolSuggestions.appendChild(item);
    });
    els.modalSchoolSuggestions.hidden = false;
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
      if (firstItem) addSchoolToDraft(firstItem.textContent);
    } else if (e.key === "Escape") {
      hideSuggestions();
    }
  }

  function onModalSchoolSearchFocus(e) {
    if (e.target.value.trim()) renderSuggestions(e.target.value);
  }

  function onModalSchoolSearchBlur() {
    // Small delay so a mousedown-triggered suggestion click (which already
    // prevents default) still has time to run before we hide the list.
    setTimeout(hideSuggestions, 100);
  }

  // ---- modal: open / close / save -------------------------------------

  function openModal() {
    els.modalSchoolSearch.value = "";
    hideSuggestions();
    els.modalSchedule.value = modalDraft.schedule;
    renderModalChips();
    els.modal.style.display = "flex";
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
  }

  function saveModal() {
    modalDraft.schedule = els.modalSchedule.value;

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
    els.modalSchoolSearch.addEventListener("focus", onModalSchoolSearchFocus);
    els.modalSchoolSearch.addEventListener("blur", onModalSchoolSearchBlur);

    // Start with the recommended minimum of three objective fields.
    // Groups start empty — the user adds the first one via the modal.
    for (let i = 0; i < MIN_OBJECTIVES; i++) addObjective();
    updateGroupsEmptyState();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
