/* IRC4 - TA Catch-up Plan - JS */

(function () {
  "use strict";

  const MIN_OBJECTIVES = 3;

  // Same master school list used in IRC2a, kept in sync so a school name
  // selected here matches what IRC2a already tracks. Only the name is
  // needed on this tab. A school may be selected into more than one group
  // (e.g. it receives TA in two different months) — no exclusivity here.
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

    els.activity = document.getElementById("irc4Activity");
    els.taReceiver = document.getElementById("irc4TaReceiver");
    els.movs = document.getElementById("irc4Movs");

    els.objectivesList = document.getElementById("irc4ObjectivesList");
    els.addObjectiveBtn = document.getElementById("irc4AddObjectiveBtn");
    els.objectivesWarning = document.getElementById("irc4ObjectivesWarning");

    els.groupsList = document.getElementById("irc4GroupsList");
    els.groupsEmpty = document.getElementById("irc4GroupsEmpty");
    els.addGroupBtn = document.getElementById("irc4AddGroupBtn");

    els.objectiveTemplate = document.getElementById("irc4-objective-template");
    els.groupTemplate = document.getElementById("irc4-group-template");
    els.chipTemplate = document.getElementById("irc4-chip-template");
  }

  function autoGrow(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
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
    li.querySelector(".irc4-objective-input").value = obj.text;
    return li;
  }

  function addObjective() {
    const obj = { id: genId("obj"), text: "" };
    data.objectives.push(obj);

    const li = buildObjectiveNode(obj);
    els.objectivesList.appendChild(li);
    relabelObjectives();
    updateObjectivesWarning();

    const textarea = li.querySelector(".irc4-objective-input");
    if (textarea) textarea.focus();
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

  function onObjectivesInput(e) {
    const input = e.target.closest(".irc4-objective-input");
    if (!input) return;
    const li = input.closest(".irc4-objective-item");
    const obj = data.objectives.find((o) => o.id === li.dataset.objId);
    if (obj) obj.text = input.value;
    autoGrow(input);
  }

  // ============================================================
  // School + Schedule groups (no exclusivity — a school may be picked
  // into more than one group; groups are unlabeled, only removable)
  // ============================================================

  function populateSchoolSelect(select) {
    select.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a school\u2026";
    select.appendChild(placeholder);

    SCHOOLS.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
  }

  function updateGroupsEmptyState() {
    els.groupsEmpty.hidden = data.groups.length !== 0;
  }

  function buildChipNode(schoolName) {
    const frag = els.chipTemplate.content.cloneNode(true);
    const chip = frag.querySelector(".irc4-school-chip");
    chip.dataset.school = schoolName;
    chip.querySelector(".irc4-school-chip-name").textContent = schoolName;
    return chip;
  }

  function updateGroupSchoolsUI(card, group) {
    const chipsContainer = card.querySelector('[data-role="school-chips"]');
    const emptyHint = card.querySelector('[data-role="school-empty-hint"]');

    chipsContainer.innerHTML = "";
    group.schools.forEach((name) => {
      chipsContainer.appendChild(buildChipNode(name));
    });
    emptyHint.hidden = group.schools.length !== 0;
  }

  function buildGroupNode(group) {
    const frag = els.groupTemplate.content.cloneNode(true);
    const card = frag.querySelector(".irc4-group");
    card.dataset.groupId = group.id;

    const select = card.querySelector('[data-role="school-select"]');
    populateSchoolSelect(select);

    card.querySelector('[data-role="schedule-select"]').value = group.schedule;
    updateGroupSchoolsUI(card, group);
    return card;
  }

  function addGroup() {
    const group = { id: genId("group"), schools: [], schedule: "" };
    data.groups.push(group);

    const node = buildGroupNode(group);
    els.groupsList.appendChild(node);

    updateGroupsEmptyState();
    node.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function removeGroup(groupId) {
    const idx = data.groups.findIndex((g) => g.id === groupId);
    if (idx === -1) return;
    data.groups.splice(idx, 1);

    const card = els.groupsList.querySelector(
      `.irc4-group[data-group-id="${CSS.escape(groupId)}"]`,
    );
    if (card) card.remove();

    updateGroupsEmptyState();
  }

  function findGroup(groupId) {
    return data.groups.find((g) => g.id === groupId) || null;
  }

  function addSchoolToGroup(groupId) {
    const group = findGroup(groupId);
    if (!group) return;

    const card = els.groupsList.querySelector(
      `.irc4-group[data-group-id="${CSS.escape(groupId)}"]`,
    );
    if (!card) return;

    const select = card.querySelector('[data-role="school-select"]');
    const schoolName = select.value;
    if (!schoolName) return; // nothing chosen

    // Same school can be added more than once across groups, but not
    // duplicated twice within the SAME group.
    if (!group.schools.includes(schoolName)) {
      group.schools.push(schoolName);
    }

    select.value = "";
    updateGroupSchoolsUI(card, group);
  }

  function removeSchoolFromGroup(groupId, schoolName) {
    const group = findGroup(groupId);
    if (!group) return;

    const idx = group.schools.indexOf(schoolName);
    if (idx === -1) return;
    group.schools.splice(idx, 1);

    const card = els.groupsList.querySelector(
      `.irc4-group[data-group-id="${CSS.escape(groupId)}"]`,
    );
    if (card) updateGroupSchoolsUI(card, group);
  }

  function onGroupsClick(e) {
    const removeGroupBtn = e.target.closest(".irc4-group-remove");
    if (removeGroupBtn) {
      const card = removeGroupBtn.closest(".irc4-group");
      if (!card) return;
      if (confirm("Remove this group and its selected schools?")) {
        removeGroup(card.dataset.groupId);
      }
      return;
    }

    const addSchoolBtn = e.target.closest('[data-role="school-add"]');
    if (addSchoolBtn) {
      const card = addSchoolBtn.closest(".irc4-group");
      if (card) addSchoolToGroup(card.dataset.groupId);
      return;
    }

    const chipRemoveBtn = e.target.closest(".irc4-chip-remove");
    if (chipRemoveBtn) {
      const card = chipRemoveBtn.closest(".irc4-group");
      const chip = chipRemoveBtn.closest(".irc4-school-chip");
      if (card && chip) {
        removeSchoolFromGroup(card.dataset.groupId, chip.dataset.school);
      }
      return;
    }
  }

  function onGroupsChange(e) {
    const scheduleSelect = e.target.closest('[data-role="schedule-select"]');
    if (!scheduleSelect) return;
    const card = scheduleSelect.closest(".irc4-group");
    if (!card) return;
    const group = findGroup(card.dataset.groupId);
    if (group) group.schedule = scheduleSelect.value;
  }

  // ============================================================
  // Plain fields (activity / TA receiver / MOV's)
  // ============================================================

  function onPlainFieldInput(e) {
    const field = e.target.dataset.plainField;
    if (!field) return;
    data[field] = e.target.value;
    autoGrow(e.target);
  }

  // ============================================================
  // Init
  // ============================================================

  function init() {
    cacheEls();
    if (!els.root) return; // not on this page

    els.activity.dataset.plainField = "activity";
    els.taReceiver.dataset.plainField = "taReceiver";
    els.movs.dataset.plainField = "movs";

    [els.activity, els.taReceiver, els.movs].forEach((el) =>
      el.addEventListener("input", onPlainFieldInput),
    );

    els.addObjectiveBtn.addEventListener("click", addObjective);
    els.objectivesList.addEventListener("click", onObjectivesClick);
    els.objectivesList.addEventListener("input", onObjectivesInput);

    els.addGroupBtn.addEventListener("click", addGroup);
    els.groupsList.addEventListener("click", onGroupsClick);
    els.groupsList.addEventListener("change", onGroupsChange);

    // Start with the recommended minimum of three objective fields ready
    // to type into, and one school/schedule group ready to fill out.
    for (let i = 0; i < MIN_OBJECTIVES; i++) addObjective();
    updateGroupsEmptyState();
    addGroup();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
