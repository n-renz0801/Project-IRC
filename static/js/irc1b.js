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

  const table = document.getElementById("irc1b-table");
  if (!table) return;

  const totalSpan = document.getElementById("irc1b-total");
  const totalStatValue = document.getElementById("irc1b-total-stat-value");
  const chartEl = document.getElementById("irc1b-chart");

  function getValues() {
    const values = {};
    MONTHS.forEach((m) => {
      const input = table.querySelector(
        `input.irc1b-customers[data-month="${m}"]`,
      );
      const num = parseFloat(input.value);
      values[m] = Number.isNaN(num) ? 0 : num;
    });
    return values;
  }

  function recalcTotal() {
    const values = getValues();
    const total = MONTHS.reduce((sum, m) => sum + values[m], 0);
    totalSpan.textContent = total.toLocaleString();
    totalStatValue.textContent = total.toLocaleString();
    return { values, total };
  }

  function renderChart(values) {
    const max = Math.max(1, ...MONTHS.map((m) => values[m]));
    chartEl.innerHTML = "";

    MONTHS.forEach((m) => {
      const val = values[m];
      const pct = val > 0 ? Math.max(2, (val / max) * 100) : 0;

      const col = document.createElement("div");
      col.className = "irc1b-chart-col";

      const barWrap = document.createElement("div");
      barWrap.className = "irc1b-chart-barwrap";
      barWrap.title = `${MONTH_LABELS[m]}: ${val.toLocaleString()}`;

      const bar = document.createElement("div");
      bar.className = "irc1b-chart-bar";
      bar.style.height = pct + "%";

      const valLabel = document.createElement("span");
      valLabel.className = "irc1b-chart-val";
      valLabel.textContent = val > 0 ? val.toLocaleString() : "";

      barWrap.appendChild(valLabel);
      barWrap.appendChild(bar);

      const label = document.createElement("span");
      label.className = "irc1b-chart-label";
      label.textContent = MONTH_LABELS[m];

      col.appendChild(barWrap);
      col.appendChild(label);
      chartEl.appendChild(col);
    });
  }

  function recalcAll() {
    const { values } = recalcTotal();
    renderChart(values);
  }

  table.addEventListener("input", (e) => {
    if (!e.target.matches("input.irc1b-customers")) return;
    recalcAll();
  });

  recalcAll();

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

        // Expected shape: { month: "July", month_key: "jul", customers: 123 }
        extractedData = {
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
    if (input && input.value !== "") {
      const month = input.dataset.month;
      const tableInput = table.querySelector(
        `input.irc1b-customers[data-month="${month}"]`,
      );
      if (tableInput) {
        tableInput.value = input.value;
      }
    }

    recalcAll();
    hidePreviewModal();
  });
})();
