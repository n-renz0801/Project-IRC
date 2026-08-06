(function () {
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

  // Format a rating input's value to exactly 3 decimal places (e.g. "4" -> "4.000")
  function formatToThreeDecimals(input) {
    if (!input || input.value === "") return;
    const num = parseFloat(input.value);
    if (Number.isNaN(num)) return;
    input.value = num.toFixed(3);
  }

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

    fetch("/irc/irc1a/extract", {
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

        // Store the extracted data including month info
        extractedData = {
          month: data.month,
          month_key: data.month_key,
          extracted_ratings: data.extracted_ratings,
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
    // extractedData contains: { month_key: "jul", month_name: "July", extracted_ratings: { "1": {jul: 4.0}, ... } }
    const month = extractedData.month || "Unknown";
    const monthKey = extractedData.month_key || "unknown";
    const ratings = extractedData.extracted_ratings || {};

    const indicatorLabels = {
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

    let html = `<div class="irc1a-preview-month-info"><strong>Month:</strong> ${month.toUpperCase()}</div>`;
    html +=
      '<table class="irc1a-preview-table"><thead><tr><th>TA Indicator</th><th>' +
      month.toUpperCase() +
      "</th></tr></thead><tbody>";

    for (let i = 1; i <= 10; i++) {
      const rawVal =
        ratings[i] && ratings[i][monthKey] ? ratings[i][monthKey] : "";
      const val =
        rawVal !== "" && !Number.isNaN(parseFloat(rawVal))
          ? parseFloat(rawVal).toFixed(3)
          : "";
      html += `<tr>
        <td style="text-align:left">${i}. ${indicatorLabels[i]}</td>
        <td><input type="number" class="preview-rating" data-indicator="${i}" data-month="${monthKey}" value="${val}" min="1" max="5" step="0.001" /></td>
      </tr>`;
    }

    html += "</tbody></table>";
    previewTableContainer.innerHTML = html;
    previewModal.style.display = "flex";
  }

  function hidePreviewModal() {
    previewModal.style.display = "none";
  }

  modalClose.addEventListener("click", hidePreviewModal);
  modalCancel.addEventListener("click", hidePreviewModal);

  // Close modal when clicking the overlay (outside the content)
  previewModal.addEventListener("click", function (e) {
    if (e.target === previewModal || e.target === modalOverlay) {
      hidePreviewModal();
    }
  });

  // Prevent modal close when clicking inside the content
  document
    .querySelector(".irc1a-modal-content")
    .addEventListener("click", function (e) {
      e.stopPropagation();
    });

  // Format preview modal inputs to 3 decimals when the user leaves the field
  previewTableContainer.addEventListener(
    "blur",
    function (e) {
      if (!e.target.matches("input.preview-rating")) return;
      formatToThreeDecimals(e.target);
    },
    true, // capture, since blur does not bubble
  );

  modalImport.addEventListener("click", function (e) {
    e.stopPropagation();
    const inputs = previewTableContainer.querySelectorAll(".preview-rating");
    inputs.forEach((input) => {
      const indicator = input.dataset.indicator;
      const month = input.dataset.month; // This is the month_key from extraction
      const value = input.value;
      if (value) {
        const tableInput = document.querySelector(
          `#irc1a-table tbody tr[data-indicator="${indicator}"] input[data-month="${month}"]`,
        );
        if (tableInput) {
          tableInput.value = value;
          formatToThreeDecimals(tableInput);
        }
      }
    });

    // Trigger recalc for all affected months and rows
    const event = new Event("input", { bubbles: true });
    document
      .querySelectorAll("#irc1a-table input.irc1a-rating")
      .forEach((inp) => inp.dispatchEvent(event));

    hidePreviewModal();
  });

  // --- Original IRC1a calculation code ---
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
  const INDICATOR_COUNT = 10;
  const INDICATOR_LABELS = {
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

  const ABSOLUTE_WEIGHT = 85;
  const RELATIVE_WEIGHT = 15;
  const FLAT_EPSILON = 0.0001;

  const table = document.getElementById("irc1a-table");
  if (!table) return;

  const lowestList = document.getElementById("irc1a-lowest-list");
  const rowAverages = {};

  function descriptiveValue(avg) {
    if (avg === null) return "—";
    if (avg >= 3.51) return "Very Satisfactory";
    if (avg >= 2.51) return "Satisfactory";
    if (avg >= 1.51) return "Fair";
    return "Poor";
  }

  function bandClass(avg) {
    if (avg === null) return null;
    if (avg >= 3.51) return "irc1a-band-very-satisfactory";
    if (avg >= 2.51) return "irc1a-band-satisfactory";
    if (avg >= 1.51) return "irc1a-band-fair";
    return "irc1a-band-poor";
  }

  function average(values) {
    const nums = values.filter((v) => !Number.isNaN(v));
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  function recalcMonth(month) {
    const inputs = table.querySelectorAll(
      `tbody input.irc1a-rating[data-month="${month}"]`,
    );
    const values = Array.from(inputs).map((input) => parseFloat(input.value));
    const avg = average(values);

    const avgSpan = table.querySelector(`.irc1a-avg[data-month="${month}"]`);
    const descSpan = table.querySelector(`.irc1a-desc[data-month="${month}"]`);

    avgSpan.textContent = avg === null ? "—" : avg.toFixed(3);
    descSpan.textContent = descriptiveValue(avg);
  }

  function recalcRow(indicatorId) {
    const inputs = table.querySelectorAll(
      `tbody tr[data-indicator="${indicatorId}"] input.irc1a-rating`,
    );
    const values = Array.from(inputs).map((input) => parseFloat(input.value));
    const avg = average(values);

    const rowAvgSpan = table.querySelector(
      `.irc1a-row-avg[data-indicator="${indicatorId}"]`,
    );
    rowAvgSpan.textContent = avg === null ? "—" : avg.toFixed(3);

    rowAverages[indicatorId] = avg;
    return avg;
  }

  function recalcBars() {
    const entries = Object.entries(rowAverages).filter(
      ([, avg]) => avg !== null && avg !== undefined,
    );
    const minV = entries.length ? Math.min(...entries.map(([, v]) => v)) : null;
    const maxV = entries.length ? Math.max(...entries.map(([, v]) => v)) : null;
    const flat = minV === null || maxV === null || maxV - minV < FLAT_EPSILON;

    for (let i = 1; i <= INDICATOR_COUNT; i++) {
      const avg = rowAverages[i];
      const fill = table.querySelector(
        `.irc1a-bar-fill[data-indicator="${i}"]`,
      );
      const bar = table.querySelector(`.irc1a-bar[data-indicator="${i}"]`);
      if (!fill) continue;

      let pct = 0;
      if (avg !== null && avg !== undefined) {
        if (flat) {
          pct = 100;
        } else {
          const absolutePct = ((avg - 1) / 4) * ABSOLUTE_WEIGHT;
          const relativePct = ((avg - minV) / (maxV - minV)) * RELATIVE_WEIGHT;
          pct = absolutePct + relativePct;
        }
      }
      fill.style.width = Math.max(2, Math.min(100, pct)) + "%";

      fill.classList.remove(
        "irc1a-band-poor",
        "irc1a-band-fair",
        "irc1a-band-satisfactory",
        "irc1a-band-very-satisfactory",
      );
      const cls = bandClass(avg === undefined ? null : avg);
      if (cls) fill.classList.add(cls);

      if (bar) {
        bar.setAttribute(
          "title",
          avg === null || avg === undefined
            ? "No data yet"
            : `${avg.toFixed(3)} / 5 (${descriptiveValue(avg)})`,
        );
      }
    }
  }

  function recalcLowest() {
    const entries = [];
    for (let i = 1; i <= INDICATOR_COUNT; i++) {
      const avg = rowAverages[i];
      if (avg !== null && avg !== undefined) {
        entries.push({ id: i, label: INDICATOR_LABELS[i], avg });
      }
    }

    lowestList.innerHTML = "";

    if (entries.length === 0) {
      const li = document.createElement("li");
      li.className = "irc1a-lowest-placeholder";
      li.textContent = "Enter ratings above to see results.";
      lowestList.appendChild(li);
      return;
    }

    entries.sort((a, b) => a.avg - b.avg);
    const lowestThree = entries.slice(0, 3);

    lowestThree.forEach((item) => {
      const li = document.createElement("li");
      li.className = "irc1a-lowest-item";
      li.innerHTML = `<span class="irc1a-lowest-label">${item.label}</span><span class="irc1a-lowest-avg">${item.avg.toFixed(3)}</span>`;
      lowestList.appendChild(li);
    });
  }

  function recalcAll() {
    MONTHS.forEach(recalcMonth);
    for (let i = 1; i <= INDICATOR_COUNT; i++) recalcRow(i);
    recalcBars();
    recalcLowest();
  }

  table.addEventListener("input", (e) => {
    if (!e.target.matches("input.irc1a-rating")) return;
    const row = e.target.closest("tr[data-indicator]");
    recalcMonth(e.target.dataset.month);
    if (row) recalcRow(row.dataset.indicator);
    recalcBars();
    recalcLowest();
  });

  // Format each rating cell to exactly 3 decimal places once the user
  // leaves the field (blur), so "4" becomes "4.000" without disrupting typing.
  table.addEventListener(
    "blur",
    (e) => {
      if (!e.target.matches("input.irc1a-rating")) return;
      formatToThreeDecimals(e.target);
    },
    true, // capture, since blur does not bubble
  );

  // Format any pre-filled values (e.g. loaded from the server) on page load
  table
    .querySelectorAll("tbody input.irc1a-rating")
    .forEach((input) => formatToThreeDecimals(input));

  recalcAll();
})();
