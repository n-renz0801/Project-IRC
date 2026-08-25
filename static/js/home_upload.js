(function () {
  "use strict";

  const dropzone = document.getElementById("homeUploadDropzone");
  const fileInput = document.getElementById("homeUploadInput");
  const uploadBtn = document.getElementById("homeUploadBtn");
  const statusEl = document.getElementById("homeUploadStatus");

  const reviewPanel = document.getElementById("homeUploadReview");
  const reviewHint = document.getElementById("homeUploadReviewHint");
  const reviewSections = document.getElementById("homeUploadReviewSections");
  const confirmBtn = document.getElementById("homeUploadReviewConfirm");

  const monthGrid = document.getElementById("homeMonthGrid");

  if (!dropzone || !fileInput || !uploadBtn) return; // not on the home page

  const MONTH_ORDER = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const MONTH_LABELS = {
    jan: "Jan",
    feb: "Feb",
    mar: "Mar",
    apr: "Apr",
    may: "May",
    jun: "Jun",
    jul: "Jul",
    aug: "Aug",
    sep: "Sep",
    oct: "Oct",
    nov: "Nov",
    dec: "Dec",
  };
  const CURRENT_YEAR = monthGrid
    ? parseInt(monthGrid.dataset.year, 10)
    : new Date().getFullYear();

  const IRC1A_INDICATOR_LABELS = {
    1: "Observes the schedule.",
    2: "Establishes the objectives of the Technical Assistance.",
    3: "Uses necessary tools/process/procedure for the conduct of TA.",
    4: "Provide relevant, timely and appropriate Technical Assistance.",
    5: "Understand the situation of schools in case may be, their needs, aspirations, plans, strength and weaknesses.",
    6: "Recommends/suggests points for improvement.",
    7: "Provides constructive feedback and establishes a cordial atmosphere in giving of feedback.",
    8: "Skills and competencies of the TA provider.",
    9: "Processes the results of the Technical Assistance.",
    10: "General view of the provision of the Technical Assistance.",
  };

  // Nothing extracted from a PDF is written to the database until the user
  // confirms it here — /irc/home/extract only registers the UploadedFile
  // row and hands back a preview of every section it found. `pending`
  // tracks what's awaiting confirmation so the Confirm button knows which
  // file/month to import against.
  let pending = null; // { fileId, year, monthKey, month }

  function showStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.hidden = false;
    statusEl.className = "home-upload-status home-upload-status--" + kind;
  }

  function hideStatus() {
    statusEl.hidden = true;
  }

  function setUploading(isUploading) {
    uploadBtn.disabled = isUploading;
    uploadBtn.innerHTML = isUploading
      ? "Uploading..."
      : '<i class="ti ti-upload" style="margin-right: 6px"></i> Choose PDF';
  }

  function hideReview() {
    if (reviewPanel) reviewPanel.hidden = true;
    if (reviewSections) reviewSections.innerHTML = "";
    pending = null;
  }

  // --- Drag & drop / choose file wiring (same pattern as the per-tab uploaders) ---
  uploadBtn.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("home-upload-dropzone--drag");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("home-upload-dropzone--drag");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("home-upload-dropzone--drag");
    const files = e.dataTransfer.files;
    if (files.length > 0) handleUpload(files[0]);
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) handleUpload(e.target.files[0]);
    fileInput.value = ""; // allow re-selecting the same file later
  });

  function handleUpload(file) {
    if (!file.type.includes("pdf")) {
      showStatus("Please upload a PDF file.", "error");
      return;
    }

    hideReview();
    hideStatus();
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    fetch("/irc/home/extract", { method: "POST", body: formData })
      .then((res) => res.json())
      .then((data) => {
        setUploading(false);

        if (data.error) {
          showStatus(data.error, "error");
          return;
        }

        if (data.existing_file) {
          const proceed = window.confirm(
            `${data.month.toUpperCase()} already has "${data.existing_file.filename}" on file. ` +
              `Confirming the import below will replace it. Continue?`,
          );
          if (!proceed) {
            // The new file was already saved (same as every extract route
            // in this app) but nothing will use it now — clean it up.
            fetch(`/files/${data.file_id}`, { method: "DELETE" }).catch(
              () => {},
            );
            showStatus("Upload cancelled.", "info");
            return;
          }
        }

        showCombinedReview(data);
      })
      .catch((err) => {
        setUploading(false);
        showStatus("Upload failed: " + err.message, "error");
      });
  }

  // --- Build one collapsible-toggle section per report type found ---
  function sectionHeader(title) {
    const header = document.createElement("div");
    header.className = "home-upload-section-header";
    header.innerHTML = `
      <label class="home-upload-section-toggle">
        <input type="checkbox" class="home-upload-section-include" checked />
        <strong>${title}</strong>
      </label>
    `;
    const checkbox = header.querySelector(".home-upload-section-include");
    checkbox.addEventListener("change", () => {
      const section = checkbox.closest(".home-upload-section");
      section.classList.toggle(
        "home-upload-section--excluded",
        !checkbox.checked,
      );
    });
    return header;
  }

  function renderIrc1aSection(ratingsByIndicator, monthKey) {
    const section = document.createElement("div");
    section.className = "home-upload-section";
    section.dataset.section = "irc1a";

    const list = document.createElement("ul");
    list.className = "home-upload-irc2a-list home-upload-irc1a-list";

    for (let i = 1; i <= 10; i++) {
      const raw = ratingsByIndicator[i] && ratingsByIndicator[i][monthKey];
      const val =
        raw !== undefined &&
        raw !== null &&
        raw !== "" &&
        !Number.isNaN(parseFloat(raw))
          ? parseFloat(raw).toFixed(3)
          : "";

      const li = document.createElement("li");
      li.className = "home-upload-irc2a-item";
      li.innerHTML = `
        <div class="home-upload-irc1a-row">
          <span class="home-upload-irc1a-row-label">${i}. ${IRC1A_INDICATOR_LABELS[i]}</span>
          <input
            type="number"
            class="home-upload-irc1a-input"
            data-indicator="${i}"
            value="${val}"
            min="1"
            max="5"
            step="0.001"
          />
        </div>
      `;
      list.appendChild(li);
    }

    section.appendChild(sectionHeader("IRC1a — TA Ratings"));
    section.appendChild(list);
    reviewSections.appendChild(section);
  }

  function renderIrc1bSection(data) {
    const section = document.createElement("div");
    section.className = "home-upload-section";
    section.dataset.section = "irc1b";

    const val =
      data.customers !== undefined && data.customers !== null
        ? data.customers
        : "";

    const list = document.createElement("ul");
    list.className = "home-upload-irc2a-list home-upload-irc1b-list";
    list.innerHTML = `
      <li class="home-upload-irc2a-item">
        <div class="home-upload-irc1a-row">
          <span class="home-upload-irc1a-row-label">No. of Customers Served</span>
          <input
            type="number"
            id="homeUploadIrc1bInput"
            value="${val}"
            min="0"
            step="1"
          />
        </div>
      </li>
    `;

    section.appendChild(sectionHeader("IRC1b — Customers Served"));
    section.appendChild(list);
    reviewSections.appendChild(section);
  }

  function renderIrc2aSection(data) {
    const section = document.createElement("div");
    section.className = "home-upload-section";
    section.dataset.section = "irc2a";

    const schools = data.schools || [];

    const hint = document.createElement("p");
    hint.className = "home-upload-irc2a-hint";
    hint.textContent = "Uncheck any school you don't want to mark as provided.";

    const list = document.createElement("ul");
    list.className = "home-upload-irc2a-list";
    schools.forEach((name) => {
      const li = document.createElement("li");
      li.className = "home-upload-irc2a-item";
      li.innerHTML = `
        <label>
          <input type="checkbox" class="home-upload-irc2a-check" checked value="${name.replace(/"/g, "&quot;")}" />
          <span>${name}</span>
        </label>
      `;
      list.appendChild(li);
    });

    section.appendChild(
      sectionHeader(`IRC2a — Schools Provided with TA (${schools.length})`),
    );
    section.appendChild(hint);
    section.appendChild(list);
    reviewSections.appendChild(section);
  }

  function showCombinedReview(data) {
    pending = {
      fileId: data.file_id,
      year: data.year,
      monthKey: data.month_key,
      month: data.month,
    };

    reviewSections.innerHTML = "";

    const sections = data.sections || {};
    const foundLabels = [];

    if (sections.irc1a) {
      renderIrc1aSection(sections.irc1a, data.month_key);
      foundLabels.push("IRC1a TA ratings");
    }
    if (sections.irc1b) {
      renderIrc1bSection(sections.irc1b);
      foundLabels.push("IRC1b customer count");
    }
    if (sections.irc2a) {
      renderIrc2aSection(sections.irc2a);
      foundLabels.push("IRC2a school list");
    }

    if (reviewHint) {
      reviewHint.textContent = `Found ${foundLabels.join(", ")} for ${data.month.toUpperCase()}. Review each section below, then confirm.`;
    }
    showStatus(
      `Extracted ${foundLabels.length} section(s) for ${data.month.toUpperCase()}. Review below, then confirm.`,
      "info",
    );
    reviewPanel.hidden = false;
  }

  // --- Confirm button: gathers whatever sections are still included and imports them together ---
  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
      if (!pending) return;
      confirmCombinedImport();
    });
  }

  function sectionIncluded(sectionEl) {
    const checkbox = sectionEl.querySelector(".home-upload-section-include");
    return !checkbox || checkbox.checked;
  }

  function confirmCombinedImport() {
    const sectionsPayload = {};

    const irc1aEl = reviewSections.querySelector('[data-section="irc1a"]');
    if (irc1aEl && sectionIncluded(irc1aEl)) {
      const ratings = {};
      irc1aEl.querySelectorAll(".home-upload-irc1a-input").forEach((input) => {
        if (input.value !== "")
          ratings[input.dataset.indicator] = parseFloat(input.value);
      });
      if (Object.keys(ratings).length > 0) sectionsPayload.irc1a = ratings;
    }

    const irc1bEl = reviewSections.querySelector('[data-section="irc1b"]');
    if (irc1bEl && sectionIncluded(irc1bEl)) {
      const input = irc1bEl.querySelector("#homeUploadIrc1bInput");
      const customers = input ? parseInt(input.value, 10) : NaN;
      if (!Number.isNaN(customers) && customers >= 0) {
        sectionsPayload.irc1b = { customers: customers };
      }
    }

    const irc2aEl = reviewSections.querySelector('[data-section="irc2a"]');
    if (irc2aEl && sectionIncluded(irc2aEl)) {
      const checked = Array.from(
        irc2aEl.querySelectorAll(".home-upload-irc2a-check:checked"),
      ).map((cb) => cb.value);
      if (checked.length > 0) sectionsPayload.irc2a = { schools: checked };
    }

    if (Object.keys(sectionsPayload).length === 0) {
      showStatus("Select at least one section to import.", "error");
      return;
    }

    confirmBtn.disabled = true;
    const monthLabel = pending.month;

    fetch("/irc/home/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id: pending.fileId,
        year: pending.year,
        month_key: pending.monthKey,
        sections: sectionsPayload,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        confirmBtn.disabled = false;
        if (result.error) {
          showStatus(result.error, "error");
          return;
        }
        hideReview();
        showStatus(
          `Saved report data for ${monthLabel.toUpperCase()}.`,
          "success",
        );
        refreshMonthGrid();
      })
      .catch((err) => {
        confirmBtn.disabled = false;
        showStatus("Import failed: " + err.message, "error");
      });
  }

  // --- Month grid: refresh from the server after any successful action,
  // and handle per-row deletion, without needing a full page reload. ---
  function formatMonthRow(monthKey, file) {
    const li = document.createElement("li");
    li.className = "home-month-row" + (file ? "" : " home-month-row--empty");
    li.dataset.monthKey = monthKey;
    if (file) li.dataset.fileId = file.id;

    li.innerHTML = file
      ? `
        <span class="home-month-row-label">${MONTH_LABELS[monthKey]}</span>
        <span class="home-month-row-filename" title="${file.original_filename}">${file.original_filename}</span>
        <button type="button" class="home-month-row-delete" data-file-id="${file.id}"
          title="Delete this file and everything extracted from it">
          <i class="ti ti-trash" aria-hidden="true"></i>
        </button>
      `
      : `
        <span class="home-month-row-label">${MONTH_LABELS[monthKey]}</span>
        <span class="home-month-row-empty">No file uploaded yet</span>
      `;
    return li;
  }

  function refreshMonthGrid() {
    if (!monthGrid) return;

    fetch(`/files?year=${CURRENT_YEAR}`)
      .then((res) => res.json())
      .then((data) => {
        const files = data.files || [];

        // A month should only ever have one file behind it (the backend
        // enforces this on import), but pick the most recently uploaded
        // one per month just in case any stale duplicates are still
        // around from before that behavior existed.
        const byMonth = {};
        files.forEach((f) => {
          if (!f.month_key) return;
          const existing = byMonth[f.month_key];
          if (
            !existing ||
            new Date(f.uploaded_at) > new Date(existing.uploaded_at)
          ) {
            byMonth[f.month_key] = f;
          }
        });

        monthGrid.innerHTML = "";
        MONTH_ORDER.forEach((monthKey) => {
          monthGrid.appendChild(
            formatMonthRow(monthKey, byMonth[monthKey] || null),
          );
        });
      })
      .catch(() => {
        /* Month-grid refresh is a nice-to-have after a successful action;
           a failure here shouldn't surface as an error over the actual
           upload/import result. */
      });
  }

  if (monthGrid) {
    monthGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".home-month-row-delete");
      if (!btn) return;

      const fileId = btn.dataset.fileId;
      const row = btn.closest(".home-month-row");
      const fileName =
        row?.querySelector(".home-month-row-filename")?.textContent ||
        "this file";

      if (
        !window.confirm(
          `Delete "${fileName}"? This also removes everything extracted from it (ratings, counts, or school statuses). This cannot be undone.`,
        )
      ) {
        return;
      }

      btn.disabled = true;

      fetch(`/files/${fileId}`, { method: "DELETE" })
        .then((res) => res.json())
        .then((result) => {
          if (result.error) {
            showStatus(result.error, "error");
            btn.disabled = false;
            return;
          }
          refreshMonthGrid();
        })
        .catch((err) => {
          showStatus("Delete failed: " + err.message, "error");
          btn.disabled = false;
        });
    });
  }
})();
