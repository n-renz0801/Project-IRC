(function () {
  "use strict";

  const typeSelect = document.getElementById("homeUploadType");
  const dropzone = document.getElementById("homeUploadDropzone");
  const fileInput = document.getElementById("homeUploadInput");
  const uploadBtn = document.getElementById("homeUploadBtn");
  const statusEl = document.getElementById("homeUploadStatus");

  const irc2aReview = document.getElementById("homeUploadIrc2aReview");
  const irc2aList = document.getElementById("homeUploadIrc2aList");
  const irc2aConfirmBtn = document.getElementById("homeUploadIrc2aConfirm");

  const recentList = document.getElementById("homeRecentUploads");

  if (!dropzone || !fileInput || !uploadBtn) return; // not on the home page

  // Maps the dropdown's value straight onto the matching extract route —
  // every extract endpoint accepts the file under the same "file" field,
  // so one upload flow covers all of them.
  function extractEndpointFor(ircType) {
    return `/irc/${ircType}/extract`;
  }

  let pendingIrc2a = null; // { fileId, monthKey, schools: [names] }

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

    irc2aReview.hidden = true;
    pendingIrc2a = null;
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

        if (ircType === "irc2a") {
          showIrc2aReview(data);
        } else {
          const label = ircType === "irc1a" ? "TA ratings" : "customer count";
          showStatus(
            `Saved ${label} for ${data.month.toUpperCase()}.`,
            "success",
          );
          refreshRecentUploads();
        }
      })
      .catch((err) => {
        setUploading(false);
        showStatus("Upload failed: " + err.message, "error");
      });
  }

  // --- IRC2a: review-then-confirm, mirrors the IRC2a tab's own preview modal ---
  function showIrc2aReview(data) {
    pendingIrc2a = {
      fileId: data.file_id,
      monthKey: data.month_key,
      schools: data.schools,
    };

    irc2aList.innerHTML = "";
    data.schools.forEach((name) => {
      const li = document.createElement("li");
      li.className = "home-upload-irc2a-item";
      li.innerHTML = `
        <label>
          <input type="checkbox" class="home-upload-irc2a-check" checked value="${name.replace(/"/g, "&quot;")}" />
          <span>${name}</span>
        </label>
      `;
      irc2aList.appendChild(li);
    });

    showStatus(
      `Found ${data.schools.length} school(s) for ${data.month.toUpperCase()}. Review below, then confirm.`,
      "info",
    );
    irc2aReview.hidden = false;
  }

  if (irc2aConfirmBtn) {
    irc2aConfirmBtn.addEventListener("click", () => {
      if (!pendingIrc2a) return;

      const checked = Array.from(
        irc2aList.querySelectorAll(".home-upload-irc2a-check:checked"),
      ).map((cb) => cb.value);

      if (checked.length === 0) {
        showStatus("Select at least one school to import.", "error");
        return;
      }

      irc2aConfirmBtn.disabled = true;

      fetch("/irc/irc2a/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: pendingIrc2a.fileId,
          schools: checked,
        }),
      })
        .then((res) => res.json())
        .then((result) => {
          irc2aConfirmBtn.disabled = false;
          irc2aReview.hidden = true;
          pendingIrc2a = null;

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
          irc2aConfirmBtn.disabled = false;
          showStatus("Import failed: " + err.message, "error");
        });
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
