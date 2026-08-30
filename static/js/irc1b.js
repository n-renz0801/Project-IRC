(function () {
  const MONTHS = [
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

  const MIN_MONTHS_FOR_AVERAGE = 1; // average only shows once MORE than this many months have data

  const table = document.getElementById("irc1b-table");
  if (!table) return;

  const totalSpan = document.getElementById("irc1b-total");
  const totalStatValue = document.getElementById("irc1b-total-stat-value");
  const chartEl = document.getElementById("irc1b-chart");

  function getValues() {
    const values = {};
    const hasData = {};
    MONTHS.forEach((m) => {
      const input = table.querySelector(
        `input.irc1b-customers[data-month="${m}"]`,
      );
      const raw = input.value;
      hasData[m] = raw !== ""; // a month "has data" if the field isn't blank
      const num = parseFloat(raw);
      values[m] = Number.isNaN(num) ? 0 : num;
    });
    return { values, hasData };
  }

  function recalcTotal(values) {
    const total = MONTHS.reduce((sum, m) => sum + values[m], 0);
    totalSpan.textContent = total.toLocaleString();
    totalStatValue.textContent = total.toLocaleString();
    return total;
  }

  // Rounds to the nearest whole number — customer counts should not show decimals
  function formatAverage(avg) {
    return Math.round(avg).toLocaleString();
  }

  function renderChart(values, hasData) {
    const max = Math.max(1, ...MONTHS.map((m) => values[m]));

    // Average is computed only from months that have data entered
    const filledMonths = MONTHS.filter((m) => hasData[m]);
    const filledCount = filledMonths.length;
    const showAverage = filledCount > MIN_MONTHS_FOR_AVERAGE;
    const avg = showAverage
      ? filledMonths.reduce((sum, m) => sum + values[m], 0) / filledCount
      : 0;

    chartEl.innerHTML = "";

    // Row 1: bars track (relative container — everything below is
    // positioned as a % of THIS element, so bars and the avg line
    // share the exact same coordinate system)
    const barsTrack = document.createElement("div");
    barsTrack.className = "irc1b-chart-bars";

    // Row 2: month labels, aligned under bars via matching flex/gap
    const labelsRow = document.createElement("div");
    labelsRow.className = "irc1b-chart-labels";

    MONTHS.forEach((m) => {
      const val = values[m];
      const pct = val > 0 ? Math.max(2, (val / max) * 100) : 0;

      const colBar = document.createElement("div");
      colBar.className = "irc1b-chart-col-bar";
      colBar.title = `${MONTH_LABELS[m]}: ${val.toLocaleString()}`;

      const valLabel = document.createElement("span");
      valLabel.className = "irc1b-chart-val";
      valLabel.textContent = val > 0 ? val.toLocaleString() : "";

      const bar = document.createElement("div");
      bar.className = "irc1b-chart-bar";
      bar.style.height = pct + "%";

      colBar.appendChild(valLabel);
      colBar.appendChild(bar);
      barsTrack.appendChild(colBar);

      const label = document.createElement("span");
      label.className = "irc1b-chart-label";
      label.textContent = MONTH_LABELS[m];
      labelsRow.appendChild(label);
    });

    if (showAverage) {
      const fraction = max > 0 ? Math.min(1, avg / max) : 0;
      const bottomPct = fraction * 100;

      const line = document.createElement("div");
      line.className = "irc1b-chart-avg-line";
      line.style.bottom = bottomPct + "%";

      const label = document.createElement("div");
      label.className = "irc1b-chart-avg-label";
      label.style.bottom = bottomPct + "%";
      label.textContent = "Avg: " + formatAverage(avg);

      barsTrack.appendChild(line);
      barsTrack.appendChild(label);
    }

    chartEl.appendChild(barsTrack);
    chartEl.appendChild(labelsRow);
  }

  function recalcAll() {
    const { values, hasData } = getValues();
    recalcTotal(values);
    renderChart(values, hasData);
  }

  table.addEventListener("input", (e) => {
    if (!e.target.matches("input.irc1b-customers")) return;
    recalcAll();
  });

  // No "Confirm" button for manual typing (unlike a PDF import), so each
  // cell saves itself once the user leaves it.
  table.addEventListener(
    "blur",
    (e) => {
      if (!e.target.matches("input.irc1b-customers")) return;
      saveManualCount(e.target);
    },
    true, // capture, since blur does not bubble
  );

  function saveManualCount(input) {
    // Cleared cell: delete the saved value instead of leaving it in the
    // DB. Previously this just returned here, so an emptied cell had no
    // way to reach the server and the old value came right back on the
    // next page load/refresh.
    if (input.value === "") {
      deleteManualCount(input.dataset.month);
      return;
    }

    const customers = parseInt(input.value, 10);
    if (Number.isNaN(customers) || customers < 0) return;

    fetch("/irc/irc1b/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month_key: input.dataset.month,
        customers: customers,
      }),
    }).catch(() => {
      /* Best-effort: a failed save shouldn't interrupt typing. */
    });
  }

  function deleteManualCount(monthKey) {
    fetch(`/irc/irc1b/count/${monthKey}`, {
      method: "DELETE",
    }).catch(() => {
      /* Best-effort, same as saveManualCount's save path. */
    });
  }

  // Loads whatever's already saved in the database for this year, so a
  // page reload shows previously-imported/edited counts instead of an
  // empty table (see /irc/irc1b/data in app.py).
  function loadPersistedCounts() {
    fetch("/irc/irc1b/data")
      .then((res) => res.json())
      .then((data) => {
        const counts = data.counts || {};
        Object.keys(counts).forEach((monthKey) => {
          const input = table.querySelector(
            `input.irc1b-customers[data-month="${monthKey}"]`,
          );
          if (input) input.value = counts[monthKey];
        });
        recalcAll();
      })
      .catch(() => {
        /* Table just stays at its blank baseline. */
      });
  }

  recalcAll();
  loadPersistedCounts();

  // --- File upload & extraction ---
  const fileInput = document.getElementById("fileInput");
  const uploadBtn = document.getElementById("uploadBtn");
  const uploadArea = document.getElementById("uploadArea");
  const previewModal = document.getElementById("previewModal");
  const modalOverlay = document.getElementById("modalOverlay");
  const modalClose = document.getElementById("modalClose");
  const modalCancel = document.getElementById("modalCancel");
  const modalImport = document.getElementById("modalImport");
  const previewTableContainer = document.getElementById(
    "previewTableContainer",
  );

  let extractedData = null;

  uploadBtn.addEventListener("click", () => fileInput.click());

  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.style.background = "var(--gold)";
  });

  uploadArea.addEventListener("dragleave", () => {
    uploadArea.style.background = "";
  });

  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.style.background = "";
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileUpload(files[0]);
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
  });

  function handleFileUpload(file) {
    if (!file.type.includes("pdf")) {
      alert("Please upload a PDF file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    uploadBtn.textContent = "Uploading...";
    uploadBtn.disabled = true;

    fetch("/irc/irc1b/extract", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        uploadBtn.textContent = "📄 Choose PDF File";
        uploadBtn.disabled = false;

        if (data.error) {
          alert("Error: " + data.error);
          return;
        }

        // Expected shape: { month: "July", month_key: "jul", customers: 123,
        // file_id, year }. Nothing is written to the database yet at this
        // point -- the server only registered the uploaded file. The count
        // is persisted once the user reviews/edits it here and clicks Import.
        extractedData = {
          fileId: data.file_id,
          year: data.year,
          month: data.month,
          month_key: data.month_key,
          customers: data.customers,
        };
        showPreviewModal();
      })
      .catch((err) => {
        uploadBtn.textContent = "📄 Choose PDF File";
        uploadBtn.disabled = false;
        alert("Upload failed: " + err.message);
      });
  }

  function showPreviewModal() {
    const month = extractedData.month || "Unknown";
    const monthKey = extractedData.month_key || "unknown";
    const customers = extractedData.customers;
    const val = customers !== undefined && customers !== null ? customers : "";

    let html = `<div class="irc1b-preview-month-info"><strong>Month:</strong> ${month.toUpperCase()}</div>`;
    html +=
      '<table class="irc1b-preview-table"><thead><tr><th>Indicator</th><th>' +
      month.toUpperCase() +
      "</th></tr></thead><tbody>";
    html += `<tr>
      <td style="text-align:left">No. of Customers Served</td>
      <td><input type="number" class="preview-customers" data-month="${monthKey}" value="${val}" min="0" step="1" /></td>
    </tr>`;
    html += "</tbody></table>";

    previewTableContainer.innerHTML = html;
    previewModal.style.display = "flex";
  }

  function hidePreviewModal() {
    previewModal.style.display = "none";
  }

  modalClose.addEventListener("click", hidePreviewModal);
  modalCancel.addEventListener("click", hidePreviewModal);

  previewModal.addEventListener("click", function (e) {
    if (e.target === previewModal || e.target === modalOverlay) {
      hidePreviewModal();
    }
  });

  document
    .querySelector(".irc1b-modal-content")
    .addEventListener("click", function (e) {
      e.stopPropagation();
    });

  modalImport.addEventListener("click", function (e) {
    e.stopPropagation();
    const input = previewTableContainer.querySelector(".preview-customers");
    let customersValue = null;

    if (input && input.value !== "") {
      customersValue = parseInt(input.value, 10);
      const month = input.dataset.month;
      const tableInput = table.querySelector(
        `input.irc1b-customers[data-month="${month}"]`,
      );
      if (tableInput) {
        tableInput.value = input.value;
      }
    }

    recalcAll();

    // Persist the (possibly edited) count. Extraction only registered the
    // uploaded file -- this is the step that actually writes the DB.
    if (
      extractedData &&
      extractedData.fileId &&
      customersValue !== null &&
      !Number.isNaN(customersValue)
    ) {
      modalImport.disabled = true;
      fetch("/irc/irc1b/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: extractedData.fileId,
          year: extractedData.year,
          month_key: extractedData.month_key,
          customers: customersValue,
        }),
      })
        .then((res) => res.json())
        .then((result) => {
          modalImport.disabled = false;
          if (result.error) alert("Save failed: " + result.error);
        })
        .catch((err) => {
          modalImport.disabled = false;
          alert("Save failed: " + err.message);
        });
    }

    hidePreviewModal();
  });
})();
