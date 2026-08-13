/* IRC4 - TA Catch-up Plan - JS */

(function () {
  "use strict";

  // Minimum recommended objectives per activity (per the form instructions).
  const MIN_OBJECTIVES = 3;

  /**
   * In-memory state.
   * entries: Array<{
   *   id: string,
   *   activity: string,
   *   objectives: Array<{ id: string, text: string }>,
   *   school: null,          // logic to be specified later
   *   schedule: string,      // "Jan" .. "Dec" or ""
   *   taReceiver: string,
   *   movs: string,
   * }>
   */
  let entries = [];
  let uidCounter = 0;

  const els = {};

  function cacheEls() {
    els.root = document.getElementById("irc4-tab");
    els.entriesContainer = document.getElementById("irc4Entries");
    els.empty = document.getElementById("irc4Empty");
    els.addEntryBtn = document.getElementById("irc4AddEntryBtn");
    els.countBadge = document.getElementById("irc4EntryCount");
    els.entryTemplate = document.getElementById("irc4-entry-template");
    els.objectiveTemplate = document.getElementById("irc4-objective-template");
  }

  function genId(prefix) {
    uidCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
  }

  // Converts a zero-based index into an alphabetic label: 0 -> a, 1 -> b,
  // ..., 25 -> z, 26 -> aa, 27 -> bb, ... (spreadsheet-column style, but
  // doubled letters rather than aa/ab/ac so it stays readable as a running
  // "next letter set" once the alphabet is exhausted).
  function letterLabel(index) {
    const letter = String.fromCharCode(97 + (index % 26)); // 'a'..'z'
    const repeat = Math.floor(index / 26) + 1;
    return letter.repeat(repeat);
  }

  // ---- rendering: entry cards ---------------------------------------------

  function updateEntryCount() {
    const n = entries.length;
    els.countBadge.textContent = `${n} ${n === 1 ? "activity" : "activities"}`;
    els.empty.hidden = n !== 0;
    els.entriesContainer.hidden = n === 0;
  }

  function updateEntryNumbers() {
    els.entriesContainer
      .querySelectorAll(".irc4-entry")
      .forEach((card, idx) => {
        card.querySelector(".irc4-entry-number").textContent =
          `Activity #${idx + 1}`;
      });
  }

  function buildEntryNode(entry) {
    const frag = els.entryTemplate.content.cloneNode(true);
    const card = frag.querySelector(".irc4-entry");
    card.dataset.id = entry.id;

    card.querySelector('[data-field="activity"]').value = entry.activity;
    card.querySelector('[data-field="taReceiver"]').value = entry.taReceiver;
    card.querySelector('[data-field="movs"]').value = entry.movs;
    card.querySelector('[data-field="schedule"]').value = entry.schedule;

    const list = card.querySelector('[data-role="objectives-list"]');
    entry.objectives.forEach((obj) => {
      list.appendChild(buildObjectiveNode(obj));
    });
    relabelObjectives(list);
    updateObjectivesWarning(card, entry);

    return card;
  }

  function buildObjectiveNode(obj) {
    const frag = els.objectiveTemplate.content.cloneNode(true);
    const li = frag.querySelector(".irc4-objective-item");
    li.dataset.objId = obj.id;
    li.querySelector(".irc4-objective-input").value = obj.text;
    return li;
  }

  function relabelObjectives(listEl) {
    listEl.querySelectorAll(".irc4-objective-item").forEach((li, idx) => {
      li.querySelector(".irc4-objective-label").textContent =
        `${letterLabel(idx)}.`;
    });
  }

  function updateObjectivesWarning(cardEl, entry) {
    const warning = cardEl.querySelector('[data-role="objectives-warning"]');
    warning.hidden = entry.objectives.length >= MIN_OBJECTIVES;
  }

  // ---- entry CRUD ----------------------------------------------------------

  function createEmptyEntry() {
    const entry = {
      id: genId("entry"),
      activity: "",
      objectives: [],
      school: null, // logic to be specified in a later prompt
      schedule: "",
      taReceiver: "",
      movs: "",
    };
    // Start every new activity with the recommended minimum of three
    // objective fields already present, ready to type into.
    for (let i = 0; i < MIN_OBJECTIVES; i++) {
      entry.objectives.push({ id: genId("obj"), text: "" });
    }
    return entry;
  }

  function addEntry() {
    const entry = createEmptyEntry();
    entries.push(entry);

    const node = buildEntryNode(entry);
    els.entriesContainer.appendChild(node);

    updateEntryNumbers();
    updateEntryCount();

    // Bring the freshly added card into view and focus its first field.
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    const firstField = node.querySelector('[data-field="activity"]');
    if (firstField) firstField.focus();
  }

  function deleteEntry(entryId) {
    const idx = entries.findIndex((e) => e.id === entryId);
    if (idx === -1) return;

    entries.splice(idx, 1);

    const node = els.entriesContainer.querySelector(
      `.irc4-entry[data-id="${CSS.escape(entryId)}"]`,
    );
    if (node) node.remove();

    updateEntryNumbers();
    updateEntryCount();
  }

  function findEntry(entryId) {
    return entries.find((e) => e.id === entryId) || null;
  }

  // ---- objective CRUD --------------------------------------------------

  function addObjective(entryId) {
    const entry = findEntry(entryId);
    if (!entry) return;

    const obj = { id: genId("obj"), text: "" };
    entry.objectives.push(obj);

    const card = els.entriesContainer.querySelector(
      `.irc4-entry[data-id="${CSS.escape(entryId)}"]`,
    );
    if (!card) return;

    const list = card.querySelector('[data-role="objectives-list"]');
    const li = buildObjectiveNode(obj);
    list.appendChild(li);
    relabelObjectives(list);
    updateObjectivesWarning(card, entry);

    const textarea = li.querySelector(".irc4-objective-input");
    if (textarea) textarea.focus();
  }

  function deleteObjective(entryId, objId) {
    const entry = findEntry(entryId);
    if (!entry) return;

    const idx = entry.objectives.findIndex((o) => o.id === objId);
    if (idx === -1) return;
    entry.objectives.splice(idx, 1);

    const card = els.entriesContainer.querySelector(
      `.irc4-entry[data-id="${CSS.escape(entryId)}"]`,
    );
    if (!card) return;

    const list = card.querySelector('[data-role="objectives-list"]');
    const li = list.querySelector(
      `.irc4-objective-item[data-obj-id="${CSS.escape(objId)}"]`,
    );
    if (li) li.remove();

    relabelObjectives(list);
    updateObjectivesWarning(card, entry);
  }

  // Grows a textarea to fit its content (used for both the activity/
  // receiver/MOV fields and the per-objective inputs).
  function autoGrow(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  // ---- event delegation --------------------------------------------------

  function onEntriesClick(e) {
    const deleteBtn = e.target.closest(".irc4-entry-delete");
    if (deleteBtn) {
      const card = deleteBtn.closest(".irc4-entry");
      if (!card) return;
      const label = card.querySelector(".irc4-entry-number").textContent;
      if (confirm(`Remove ${label}? This cannot be undone.`)) {
        deleteEntry(card.dataset.id);
      }
      return;
    }

    const addObjBtn = e.target.closest(".irc4-add-objective-btn");
    if (addObjBtn) {
      const card = addObjBtn.closest(".irc4-entry");
      if (card) addObjective(card.dataset.id);
      return;
    }

    const removeObjBtn = e.target.closest(".irc4-objective-remove");
    if (removeObjBtn) {
      const card = removeObjBtn.closest(".irc4-entry");
      const li = removeObjBtn.closest(".irc4-objective-item");
      if (card && li) deleteObjective(card.dataset.id, li.dataset.objId);
      return;
    }
  }

  function onEntriesInput(e) {
    const card = e.target.closest(".irc4-entry");
    if (!card) return;
    const entry = findEntry(card.dataset.id);
    if (!entry) return;

    // Objective text field
    const objInput = e.target.closest(".irc4-objective-input");
    if (objInput) {
      const li = objInput.closest(".irc4-objective-item");
      const obj = entry.objectives.find((o) => o.id === li.dataset.objId);
      if (obj) obj.text = objInput.value;
      autoGrow(objInput);
      return;
    }

    // Plain textarea fields (activity / taReceiver / movs)
    const field = e.target.dataset.field;
    if (field && field in entry) {
      entry[field] = e.target.value;
      if (e.target.tagName === "TEXTAREA") autoGrow(e.target);
    }
  }

  function onEntriesChange(e) {
    // Select fields (schedule) fire "change", not "input".
    const select = e.target.closest('select[data-field="schedule"]');
    if (!select) return;
    const card = select.closest(".irc4-entry");
    if (!card) return;
    const entry = findEntry(card.dataset.id);
    if (entry) entry.schedule = select.value;
  }

  function init() {
    cacheEls();
    if (!els.root) return; // not on this page

    entries = [];
    updateEntryCount();

    els.addEntryBtn.addEventListener("click", addEntry);
    els.entriesContainer.addEventListener("click", onEntriesClick);
    els.entriesContainer.addEventListener("input", onEntriesInput);
    els.entriesContainer.addEventListener("change", onEntriesChange);

    // Start with one activity card ready to go, same spirit as a blank
    // first row in a form.
    addEntry();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
