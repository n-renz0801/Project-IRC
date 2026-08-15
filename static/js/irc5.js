(function () {
  const tab = document.getElementById("irc5-tab");
  if (!tab) return;

  const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const WEEKDAY_COUNT = 7;
  const TEXTAREA_MIN_HEIGHT = 44; // px, must match the CSS default height

  // In-memory store of entries. Swap this out for a fetch()/POST to
  // Flask once a persistence layer exists for IRC5.
  let entries = [];
  let editingId = null; // id of entry currently being edited, or null for "add"
  let nextId = 1;
  let pendingDeleteId = null; // id awaiting confirmation in the delete modal

  // Calendar state (scoped to whatever modal instance is open)
  let calViewYear;
  let calViewMonth; // 0-11
  let selectedDates = new Set(); // ISO "YYYY-MM-DD" strings
  let isDragging = false;
  let dragMode = "add"; // "add" | "remove", decided by the anchor cell's state

  // ------------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------------
  const tableBody = document.getElementById("irc5-table-body");
  const tableWrapper = document.querySelector(".irc5-table-wrapper");
  const emptyState = document.getElementById("irc5-empty-state");

  const addBtn = document.getElementById("irc5-add-btn");
  const modalOverlay = document.getElementById("irc5-modal-overlay");
  const modalTitle = document.getElementById("irc5-modal-title");
  const modalClose = document.getElementById("irc5-modal-close");
  const cancelBtn = document.getElementById("irc5-cancel-btn");
  const form = document.getElementById("irc5-form");

  const fTitle = document.getElementById("irc5-f-title");
  const fNature = document.getElementById("irc5-f-nature");
  const fParticipants = document.getElementById("irc5-f-participants");
  const fRating = document.getElementById("irc5-f-rating");
  const fDescVal = document.getElementById("irc5-f-descval");
  const fIndicator = document.getElementById("irc5-f-indicator");
  const fCause = document.getElementById("irc5-f-cause");
  const fMeasures = document.getElementById("irc5-f-measures");

  const calPrevBtn = document.getElementById("irc5-cal-prev");
  const calNextBtn = document.getElementById("irc5-cal-next");
  const calLabel = document.getElementById("irc5-cal-label");
  const calGrid = document.getElementById("irc5-cal-grid");
  const calClearBtn = document.getElementById("irc5-cal-clear");
  const datePreviewText = document.getElementById("irc5-date-preview-text");

  const confirmOverlay = document.getElementById("irc5-confirm-overlay");
  const confirmCancelBtn = document.getElementById("irc5-confirm-cancel");
  const confirmDeleteBtn = document.getElementById("irc5-confirm-delete");

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function isoDate(year, month, day) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }

  function parseIso(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(date, n) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + n);
    return copy;
  }

  function toIso(date) {
    return isoDate(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function todayIso() {
    return toIso(new Date());
  }

  // Overall Rating -> Descriptive Value, per the fixed 0.75-wide bands:
  //   3.26 - 4.00  -> Strongly Agree
  //   2.51 - 3.25  -> Agree
  //   1.76 - 2.50  -> Disagree
  //   1.00 - 1.75  -> Strongly Disagree
  // Anything blank, non-numeric, or outside 1.00-4.00 yields "" so the
  // field just shows its "Enter a rating first" placeholder / stays
  // blank rather than a misleading label.
  function computeDescVal(ratingInput) {
    const val = parseFloat(ratingInput);
    if (isNaN(val)) return "";
    if (val >= 3.26 && val <= 4.0) return "Strongly Agree";
    if (val >= 2.51 && val <= 3.25) return "Agree";
    if (val >= 1.76 && val <= 2.5) return "Disagree";
    if (val >= 1.0 && val <= 1.75) return "Strongly Disagree";
    return "";
  }

  function descValClass(value) {
    switch (value) {
      case "Strongly Agree":
        return "sa";
      case "Agree":
        return "a";
      case "Disagree":
        return "d";
      case "Strongly Disagree":
        return "sd";
      default:
        return "";
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  // Grows a textarea to fit its content, but never shrinks below the
  // fixed default height. Called on input and whenever a field is
  // populated programmatically (e.g. opening the edit modal).
  function autosizeTextarea(el) {
    el.style.height = "auto";
    const newHeight = Math.max(el.scrollHeight, TEXTAREA_MIN_HEIGHT);
    el.style.height = `${newHeight}px`;
  }

  // ------------------------------------------------------------------
  // Overall Rating -> Descriptive Value (auto-fill)
  // ------------------------------------------------------------------
  fRating.addEventListener("input", () => {
    fDescVal.value = computeDescVal(fRating.value);
  });

  // ------------------------------------------------------------------
  // Hybrid date formatting
  //   Selected ISO dates -> "Dec. 11, 14-16, 2026" style string.
  //   Consecutive calendar days collapse into a "start-end" range.
  //   Ranges are grouped by month; a month name is written once per
  //   contiguous block of ranges in that month. If the selection spans
  //   multiple years, each month-group carries its own year and groups
  //   are separated with "; "; otherwise a single year is appended once
  //   at the end.
  // ------------------------------------------------------------------
  function formatDateSelection(datesSet) {
    if (datesSet.size === 0) return "";

    const dates = Array.from(datesSet)
      .map(parseIso)
      .sort((a, b) => a - b);

    // Collapse into consecutive-day runs, splitting a run whenever the
    // month or year changes so each run maps cleanly to one month-group.
    const runs = [];
    let runStart = dates[0];
    let runEnd = dates[0];

    for (let i = 1; i < dates.length; i++) {
      const prev = dates[i - 1];
      const curr = dates[i];
      const isConsecutive = toIso(addDays(prev, 1)) === toIso(curr);
      const sameMonth =
        prev.getMonth() === curr.getMonth() &&
        prev.getFullYear() === curr.getFullYear();

      if (isConsecutive && sameMonth) {
        runEnd = curr;
      } else {
        runs.push({ start: runStart, end: runEnd });
        runStart = curr;
        runEnd = curr;
      }
    }
    runs.push({ start: runStart, end: runEnd });

    // Group runs by month+year, preserving order.
    const monthGroups = [];
    runs.forEach((run) => {
      const key = `${run.start.getFullYear()}-${run.start.getMonth()}`;
      let group = monthGroups[monthGroups.length - 1];
      if (!group || group.key !== key) {
        group = {
          key,
          year: run.start.getFullYear(),
          month: run.start.getMonth(),
          ranges: [],
        };
        monthGroups.push(group);
      }
      group.ranges.push(run);
    });

    const years = new Set(monthGroups.map((g) => g.year));
    const singleYear = years.size === 1 ? monthGroups[0].year : null;

    const groupStrings = monthGroups.map((group) => {
      const rangeStrs = group.ranges.map((r) => {
        const startDay = r.start.getDate();
        const endDay = r.end.getDate();
        return startDay === endDay ? `${startDay}` : `${startDay}-${endDay}`;
      });
      const monthLabel = `${MONTH_NAMES[group.month]}.`;
      const base = `${monthLabel} ${rangeStrs.join(", ")}`;
      return singleYear === null ? `${base}, ${group.year}` : base;
    });

    return singleYear === null
      ? groupStrings.join("; ")
      : `${groupStrings.join(", ")}, ${singleYear}`;
  }

  // ------------------------------------------------------------------
  // Calendar rendering
  // ------------------------------------------------------------------
  function renderCalendar() {
    calLabel.textContent = `${MONTH_NAMES[calViewMonth]} ${calViewYear}`;
    calGrid.innerHTML = "";

    const firstOfMonth = new Date(calViewYear, calViewMonth, 1);
    const startOffset = firstOfMonth.getDay(); // 0 = Sunday
    const gridStart = addDays(firstOfMonth, -startOffset);

    const totalCells = 42; // 6 weeks, keeps grid height stable
    const today = todayIso();

    for (let i = 0; i < totalCells; i++) {
      const cellDate = addDays(gridStart, i);
      const iso = toIso(cellDate);
      const isOutside = cellDate.getMonth() !== calViewMonth;

      const cell = document.createElement("div");
      cell.className = "irc5-cal-day";
      cell.dataset.date = iso;
      cell.textContent = cellDate.getDate();

      if (isOutside) cell.classList.add("irc5-cal-outside");
      if (iso === today) cell.classList.add("irc5-cal-today");
      if (selectedDates.has(iso)) cell.classList.add("irc5-cal-selected");

      calGrid.appendChild(cell);
    }
  }

  function updatePreview() {
    const text = formatDateSelection(selectedDates);
    datePreviewText.textContent = text || "No dates selected";
  }

  function applyDragRange(anchorIso, currentIso, mode) {
    const anchor = parseIso(anchorIso);
    const current = parseIso(currentIso);
    const start = anchor < current ? anchor : current;
    const end = anchor < current ? current : anchor;

    let cursor = start;
    while (cursor <= end) {
      const iso = toIso(cursor);
      if (mode === "add") selectedDates.add(iso);
      else selectedDates.delete(iso);
      cursor = addDays(cursor, 1);
    }
  }

  function refreshCalendarSelectionClasses() {
    calGrid.querySelectorAll(".irc5-cal-day").forEach((cell) => {
      cell.classList.toggle(
        "irc5-cal-selected",
        selectedDates.has(cell.dataset.date),
      );
    });
    updatePreview();
  }

  calGrid.addEventListener("mousedown", (e) => {
    const cell = e.target.closest(".irc5-cal-day");
    if (!cell) return;
    e.preventDefault();

    const iso = cell.dataset.date;
    isDragging = true;
    dragMode = selectedDates.has(iso) ? "remove" : "add";
    applyDragRange(iso, iso, dragMode);
    calGrid.dataset.anchor = iso;
    refreshCalendarSelectionClasses();
  });

  calGrid.addEventListener(
    "mouseenter",
    (e) => {
      if (!isDragging) return;
      const cell = e.target.closest(".irc5-cal-day");
      if (!cell) return;
      const anchor = calGrid.dataset.anchor;
      if (!anchor) return;

      // Recompute from scratch each move so the preview range stays exact
      // even if the user drags back over already-visited days.
      applyDragRange(anchor, cell.dataset.date, dragMode);
      refreshCalendarSelectionClasses();
    },
    true,
  );

  document.addEventListener("mouseup", () => {
    isDragging = false;
    delete calGrid.dataset.anchor;
  });

  calPrevBtn.addEventListener("click", () => {
    calViewMonth -= 1;
    if (calViewMonth < 0) {
      calViewMonth = 11;
      calViewYear -= 1;
    }
    renderCalendar();
  });

  calNextBtn.addEventListener("click", () => {
    calViewMonth += 1;
    if (calViewMonth > 11) {
      calViewMonth = 0;
      calViewYear += 1;
    }
    renderCalendar();
  });

  calClearBtn.addEventListener("click", () => {
    selectedDates.clear();
    refreshCalendarSelectionClasses();
  });

  // ------------------------------------------------------------------
  // Textarea autosize wiring
  // ------------------------------------------------------------------
  fCause.addEventListener("input", () => autosizeTextarea(fCause));
  fMeasures.addEventListener("input", () => autosizeTextarea(fMeasures));

  // ------------------------------------------------------------------
  // Modal open / close
  // ------------------------------------------------------------------
  function resetForm() {
    form.reset();
    fDescVal.value = "";
    fCause.style.height = `${TEXTAREA_MIN_HEIGHT}px`;
    fMeasures.style.height = `${TEXTAREA_MIN_HEIGHT}px`;
    selectedDates = new Set();
    const now = new Date();
    calViewYear = now.getFullYear();
    calViewMonth = now.getMonth();
  }

  function openModalForAdd() {
    editingId = null;
    modalTitle.textContent = "Add Entry";
    resetForm();
    renderCalendar();
    updatePreview();
    modalOverlay.classList.add("visible");
  }

  function openModalForEdit(entry) {
    editingId = entry.id;
    modalTitle.textContent = "Edit Entry";

    fTitle.value = entry.title;
    fNature.value = entry.nature;
    fParticipants.value = entry.participants;
    fRating.value = entry.rating;
    // Recompute rather than trusting the stored value, so edited
    // entries always reflect the current rating -> descriptive value
    // mapping even if the field was populated programmatically.
    fDescVal.value = computeDescVal(entry.rating);
    fIndicator.value = entry.indicator;
    fCause.value = entry.cause;
    fMeasures.value = entry.measures;
    autosizeTextarea(fCause);
    autosizeTextarea(fMeasures);

    selectedDates = new Set(entry.dateIsoList);
    if (entry.dateIsoList.length > 0) {
      const first = parseIso(entry.dateIsoList[0]);
      calViewYear = first.getFullYear();
      calViewMonth = first.getMonth();
    } else {
      const now = new Date();
      calViewYear = now.getFullYear();
      calViewMonth = now.getMonth();
    }

    renderCalendar();
    updatePreview();
    modalOverlay.classList.add("visible");
  }

  function closeModal() {
    modalOverlay.classList.remove("visible");
    editingId = null;
  }

  addBtn.addEventListener("click", openModalForAdd);
  modalClose.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // ------------------------------------------------------------------
  // Delete confirmation modal
  // ------------------------------------------------------------------
  function openDeleteConfirm(id) {
    pendingDeleteId = id;
    confirmOverlay.classList.add("visible");
  }

  function closeDeleteConfirm() {
    pendingDeleteId = null;
    confirmOverlay.classList.remove("visible");
  }

  confirmCancelBtn.addEventListener("click", closeDeleteConfirm);
  confirmOverlay.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) closeDeleteConfirm();
  });

  confirmDeleteBtn.addEventListener("click", () => {
    if (pendingDeleteId !== null) {
      entries = entries.filter((en) => en.id !== pendingDeleteId);
      renderTable();
    }
    closeDeleteConfirm();
  });

  // ------------------------------------------------------------------
  // Table rendering
  // ------------------------------------------------------------------
  function renderTable() {
    tableBody.innerHTML = "";

    if (entries.length === 0) {
      emptyState.classList.add("visible");
      tableWrapper.classList.add("irc5-empty");
      return;
    }

    emptyState.classList.remove("visible");
    tableWrapper.classList.remove("irc5-empty");

    entries.forEach((entry, index) => {
      const tr = document.createElement("tr");
      const natureClass = entry.nature === "Funded" ? "funded" : "non-funded";
      const descClass = descValClass(entry.descVal);

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td class="irc5-cell-title">${escapeHtml(entry.title)}</td>
        <td><span class="irc5-nature-badge ${natureClass}">${escapeHtml(
          entry.nature,
        )}</span></td>
        <td class="irc5-cell-text">${escapeHtml(entry.dateDisplay) || "N/A"}</td>
        <td class="irc5-cell-text">${escapeHtml(entry.participants) || "N/A"}</td>
        <td><span class="irc5-rating-value">${
          entry.rating !== "" ? escapeHtml(entry.rating) : "N/A"
        }</span></td>
        <td><span class="irc5-descval-badge ${descClass}">${escapeHtml(
          entry.descVal,
        )}</span></td>
        <td class="irc5-cell-text">${escapeHtml(entry.indicator) || "N/A"}</td>
        <td class="irc5-cell-text">${escapeHtml(entry.cause) || "N/A"}</td>
        <td class="irc5-cell-text">${escapeHtml(entry.measures) || "N/A"}</td>
        <td>
          <div class="irc5-actions-cell">
            <button type="button" class="irc5-icon-btn irc5-edit-btn" data-id="${
              entry.id
            }" title="Edit">&#9998;</button>
            <button type="button" class="irc5-icon-btn irc5-delete-btn" data-id="${
              entry.id
            }" title="Delete">&#128465;</button>
          </div>
        </td>
      `;

      tableBody.appendChild(tr);
    });
  }

  tableBody.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".irc5-edit-btn");
    const deleteBtn = e.target.closest(".irc5-delete-btn");

    if (editBtn) {
      const entry = entries.find((en) => en.id === Number(editBtn.dataset.id));
      if (entry) openModalForEdit(entry);
    }

    if (deleteBtn) {
      openDeleteConfirm(Number(deleteBtn.dataset.id));
    }
  });

  // ------------------------------------------------------------------
  // Form submit
  // ------------------------------------------------------------------
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const dateIsoList = Array.from(selectedDates).sort();
    const entryData = {
      title: fTitle.value.trim(),
      nature: fNature.value,
      dateIsoList,
      dateDisplay: formatDateSelection(selectedDates),
      participants: fParticipants.value.trim(),
      rating: fRating.value.trim(),
      descVal: fDescVal.value,
      indicator: fIndicator.value.trim(),
      cause: fCause.value.trim(),
      measures: fMeasures.value.trim(),
    };

    if (editingId !== null) {
      const idx = entries.findIndex((en) => en.id === editingId);
      if (idx !== -1) entries[idx] = { ...entries[idx], ...entryData };
    } else {
      entries.push({ id: nextId++, ...entryData });
    }

    renderTable();
    closeModal();
  });

  // ------------------------------------------------------------------
  // Initial render
  // ------------------------------------------------------------------
  renderTable();
})();
