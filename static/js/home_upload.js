(function () {
  "use strict";

  const typeSelect = document.getElementById("homeUploadType");
  const dropzone = document.getElementById("homeUploadDropzone");
  const fileInput = document.getElementById("homeUploadInput");
  const uploadBtn = document.getElementById("homeUploadBtn");
  const statusEl = document.getElementById("homeUploadStatus");

  // Generic "review before import" panel. Originally built for IRC2a only;
  // now reused for every extract type (IRC1a ratings, IRC1b customer count,
  // IRC2a schools) since they all need the same shape of flow: show what
  // was found, sectioned by report, let the user edit/uncheck it, then
  // confirm. IDs are kept exactly as before so no HTML template changes
  // are required -- only what gets rendered inside them changes per type.
  const reviewPanel = document.getElementById("homeUploadIrc2aReview");
  const reviewHint = reviewPanel
    ? reviewPanel.querySelector(".home-upload-irc2a-hint")
    : null;
  const reviewList = document.getElementById("homeUploadIrc2aList");
  const confirmBtn = document.getElementById("homeUploadIrc2aConfirm");

  const recentList = document.getElementById("homeRecentUploads");

  if (!dropzone || !fileInput || !uploadBtn) return; // not on the home page

  // Maps the dropdown's value straight onto the matching extract route —
  // every extract endpoint accepts the file under the same "file" field,
  // so one upload flow covers all of them.
  function extractEndpointFor(ircType) {
    return `/irc/${ircType}/extract`;
  }

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
  // confirms it here — every /extract route only registers the UploadedFile
  // row and hands back a preview. `pending` tracks what's awaiting
  // confirmation so the Confirm button knows which /import route to call
  // and how to build its payload from whatever the user edited.
  let pending = null; // { type, fileId, year, monthKey, month }

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

    const ircType = typeSelect.value;
    const formData = new FormData();
    formData.append("file", file);

    fetch(extractEndpointFor(ircType), { method: "POST", body: formData })
      .then((res) => res.json())
      .then((data) => {
        setUploading(false);

        if (data.error) {
          showStatus(data.error, "error");
          return;
        }

        if (ircType === "irc1a") {
          showIrc1aReview(data);
        } else if (ircType === "irc1b") {
          showIrc1bReview(data);
        } else if (ircType === "irc2a") {
          showIrc2aReview(data);
        } else {
          // No review flow defined yet for this type — nothing was
          // written to the DB (extract routes for reviewed types never
          // do), so at minimum say so plainly instead of implying success.
          showStatus(
            "File uploaded, but this report type has no review/import step configured yet.",
            "info",
          );
          refreshRecentUploads();
        }
      })
      .catch((err) => {
        setUploading(false);
        showStatus("Upload failed: " + err.message, "error");
      });
  }

  // --- IRC1a: 10 TA indicator ratings, editable before import ---
  function showIrc1aReview(data) {
    pending = {
      type: "irc1a",
      fileId: data.file_id,
      year: data.year,
      monthKey: data.month_key,
      month: data.month,
    };

    const ratings = data.extracted_ratings || {};

    reviewList.className = "home-upload-irc2a-list home-upload-irc1a-list";
    reviewList.innerHTML = "";

    for (let i = 1; i <= 10; i++) {
      const raw = ratings[i] && ratings[i][data.month_key];
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
      reviewList.appendChild(li);
    }

    if (reviewHint) {
      reviewHint.textContent = `Extracted TA indicator ratings for ${data.month.toUpperCase()}. Review/edit below, then confirm.`;
    }
    showStatus(
      `Found 10 TA indicator ratings for ${data.month.toUpperCase()}. Review below, then confirm.`,
      "info",
    );
    reviewPanel.hidden = false;
  }

  // --- IRC1b: single customer-count field, editable before import ---
  function showIrc1bReview(data) {
    pending = {
      type: "irc1b",
      fileId: data.file_id,
      year: data.year,
      monthKey: data.month_key,
      month: data.month,
    };

    reviewList.className = "home-upload-irc2a-list home-upload-irc1b-list";
    reviewList.innerHTML = "";

    const val =
      data.customers !== undefined && data.customers !== null
        ? data.customers
        : "";

    const li = document.createElement("li");
    li.className = "home-upload-irc2a-item";
    li.innerHTML = `
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
    `;
    reviewList.appendChild(li);

    if (reviewHint) {
      reviewHint.textContent = `Extracted the customer count for ${data.month.toUpperCase()}. Review/edit below, then confirm.`;
    }
    showStatus(
      `Found the customer count for ${data.month.toUpperCase()}. Review below, then confirm.`,
      "info",
    );
    reviewPanel.hidden = false;
  }

  // --- IRC2a: review-before-import checklist of schools ---
  function showIrc2aReview(data) {
    pending = {
      type: "irc2a",
      fileId: data.file_id,
      year: data.year,
      monthKey: data.month_key,
      month: data.month,
    };

    reviewList.className = "home-upload-irc2a-list";
    reviewList.innerHTML = "";
    data.schools.forEach((name) => {
      const li = document.createElement("li");
      li.className = "home-upload-irc2a-item";
      li.innerHTML = `
        <label>
          <input type="checkbox" class="home-upload-irc2a-check" checked value="${name.replace(/"/g, "&quot;")}" />
          <span>${name}</span>
        </label>
      `;
      reviewList.appendChild(li);
    });

    if (reviewHint) {
      reviewHint.textContent = `Found ${data.schools.length} school(s) for ${data.month.toUpperCase()}. Uncheck any that shouldn't be marked provided, then confirm.`;
    }
    showStatus(
      `Found ${data.schools.length} school(s) for ${data.month.toUpperCase()}. Review below, then confirm.`,
      "info",
    );
    reviewPanel.hidden = false;
  }

  // --- Confirm button: dispatches to the right /import route for whatever is pending ---
  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
      if (!pending) return;

      if (pending.type === "irc1a") {
        confirmIrc1a();
      } else if (pending.type === "irc1b") {
        confirmIrc1b();
      } else if (pending.type === "irc2a") {
        confirmIrc2a();
      }
    });
  }

  function confirmIrc1a() {
    const ratings = {};
    reviewList.querySelectorAll(".home-upload-irc1a-input").forEach((input) => {
      if (input.value !== "")
        ratings[input.dataset.indicator] = parseFloat(input.value);
    });

    if (Object.keys(ratings).length === 0) {
      showStatus("Enter at least one rating to import.", "error");
      return;
    }

    confirmBtn.disabled = true;
    const monthLabel = pending.month;

    fetch("/irc/irc1a/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id: pending.fileId,
        year: pending.year,
        month_key: pending.monthKey,
        ratings: ratings,
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
          `Saved ${result.updated.length} TA rating(s) for ${monthLabel.toUpperCase()}.`,
          "success",
        );
        refreshRecentUploads();
      })
      .catch((err) => {
        confirmBtn.disabled = false;
        showStatus("Import failed: " + err.message, "error");
      });
  }

  function confirmIrc1b() {
    const input = document.getElementById("homeUploadIrc1bInput");
    const customers = input ? parseInt(input.value, 10) : NaN;

    if (Number.isNaN(customers) || customers < 0) {
      showStatus("Enter a valid (non-negative) customer count.", "error");
      return;
    }

    confirmBtn.disabled = true;
    const monthLabel = pending.month;

    fetch("/irc/irc1b/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id: pending.fileId,
        year: pending.year,
        month_key: pending.monthKey,
        customers: customers,
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
          `Saved customer count for ${monthLabel.toUpperCase()}.`,
          "success",
        );
        refreshRecentUploads();
      })
      .catch((err) => {
        confirmBtn.disabled = false;
        showStatus("Import failed: " + err.message, "error");
      });
  }

  function confirmIrc2a() {
    const checked = Array.from(
      reviewList.querySelectorAll(".home-upload-irc2a-check:checked"),
    ).map((cb) => cb.value);

    if (checked.length === 0) {
      showStatus("Select at least one school to import.", "error");
      return;
    }

    confirmBtn.disabled = true;

    fetch("/irc/irc2a/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id: pending.fileId,
        year: pending.year,
        schools: checked,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        confirmBtn.disabled = false;
        hideReview();

        const notFoundNote =
          result.not_found && result.not_found.length
            ? ` (${result.not_found.length} name(s) didn't match any known school)`
            : "";
        showStatus(
          `Marked ${result.updated.length} school(s) as provided.${notFoundNote}`,
          "success",
        );
        refreshRecentUploads();
      })
      .catch((err) => {
        confirmBtn.disabled = false;
        showStatus("Import failed: " + err.message, "error");
      });
  }

  // --- Recent uploads: refresh from the server after any successful action,
  // and handle per-row deletion, without needing a full page reload. ---
  function formatFileRow(f) {
    const li = document.createElement("li");
    li.className = "home-recent-upload-item";
    li.dataset.fileId = f.id;

    const monthPart = f.month_name ? `&middot; ${f.month_name} ` : "";
    li.innerHTML = `
      <span class="home-recent-upload-icon"><i class="ti ti-file-type-pdf" aria-hidden="true"></i></span>
      <div class="home-recent-upload-info">
        <span class="home-recent-upload-name">${f.original_filename}</span>
        <span class="home-recent-upload-meta">${f.irc_type.toUpperCase()} ${monthPart}${f.year}</span>
      </div>
      <button type="button" class="home-recent-upload-delete" data-file-id="${f.id}"
        title="Delete this file and everything extracted from it">
        <i class="ti ti-trash" aria-hidden="true"></i>
      </button>
    `;
    return li;
  }

  function refreshRecentUploads() {
    if (!recentList) return;

    fetch("/files")
      .then((res) => res.json())
      .then((data) => {
        recentList.innerHTML = "";
        const files = (data.files || []).slice(0, 10);

        if (files.length === 0) {
          const li = document.createElement("li");
          li.className = "home-recent-upload-empty";
          li.id = "homeRecentUploadsEmpty";
          li.textContent = "No files uploaded yet.";
          recentList.appendChild(li);
          return;
        }

        files.forEach((f) => recentList.appendChild(formatFileRow(f)));
      })
      .catch(() => {
        /* Recent-uploads refresh is a nice-to-have; a failure here
           shouldn't surface as an error over the actual upload result. */
      });
  }

  if (recentList) {
    recentList.addEventListener("click", (e) => {
      const btn = e.target.closest(".home-recent-upload-delete");
      if (!btn) return;

      const fileId = btn.dataset.fileId;
      const row = btn.closest(".home-recent-upload-item");
      const fileName =
        row?.querySelector(".home-recent-upload-name")?.textContent ||
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
          row.remove();
          if (!recentList.querySelector(".home-recent-upload-item")) {
            refreshRecentUploads(); // repaint the "No files uploaded yet." state
          }
        })
        .catch((err) => {
          showStatus("Delete failed: " + err.message, "error");
          btn.disabled = false;
        });
    });
  }
})();
