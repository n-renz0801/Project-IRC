(function () {
  // Format a rating input's value to exactly 3 decimal places (e.g. "4" -> "4.000")
  function formatToThreeDecimals(input) {
    if (!input || input.value === "") return;
    const num = parseFloat(input.value);
    if (Number.isNaN(num)) return;
    input.value = num.toFixed(3);
  }

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

  const QUARTERS = [
    { label: "Q1", months: ["jan", "feb", "mar"] },
    { label: "Q2", months: ["apr", "may", "jun"] },
    { label: "Q3", months: ["jul", "aug", "sep"] },
    { label: "Q4", months: ["oct", "nov", "dec"] },
  ];

  const BAND_CLASSES = [
    "irc1a-band-poor",
    "irc1a-band-fair",
    "irc1a-band-satisfactory",
    "irc1a-band-very-satisfactory",
  ];

  const table = document.getElementById("irc1a-table");
  if (!table) return;

  const lowestList = document.getElementById("irc1a-lowest-list");
  const rowAverages = {};
  const monthAverages = {};

  const overallAvgEl = document.getElementById("irc1a-overall-avg");
  const overallDescEl = document.getElementById("irc1a-overall-desc");
  const footerAnnualAvgEl = document.getElementById("irc1a-footer-annual-avg");
  const footerAnnualDescEl = document.getElementById(
    "irc1a-footer-annual-desc",
  );

  const trendChartWrap = document.getElementById("irc1a-trend-chart-wrap");
  const trendToggle = document.getElementById("irc1a-trend-toggle");
  let trendMode = "monthly";

  const resetBtn = document.getElementById("irc1a-reset-btn");
  const resetConfirmOverlay = document.getElementById(
    "irc1a-reset-confirm-overlay",
  );
  const resetConfirmCancelBtn = document.getElementById(
    "irc1a-reset-confirm-cancel",
  );
  const resetConfirmConfirmBtn = document.getElementById(
    "irc1a-reset-confirm-confirm",
  );

  const legendBtn = document.getElementById("irc1a-legend-btn");
  const legendOverlay = document.getElementById("irc1a-legend-overlay");
  const legendCloseBtn = document.getElementById("irc1a-legend-close");

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

  // Applies the descriptive text + color-coded band class to a badge/pill
  // element (used for per-row badges, the footer annual badge, and the
  // hero "Overall Performance" pill).
  function paintDescriptiveBadge(el, avg) {
    if (!el) return;
    el.textContent = avg === null ? "—" : descriptiveValue(avg);
    el.classList.remove(...BAND_CLASSES);
    const cls = bandClass(avg);
    if (cls) el.classList.add(cls);
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
    if (avgSpan) avgSpan.textContent = avg === null ? "—" : avg.toFixed(3);

    monthAverages[month] = avg;
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
    if (rowAvgSpan)
      rowAvgSpan.textContent = avg === null ? "—" : avg.toFixed(3);

    const rowDescSpan = table.querySelector(
      `.irc1a-row-desc[data-indicator="${indicatorId}"]`,
    );
    paintDescriptiveBadge(rowDescSpan, avg);

    rowAverages[indicatorId] = avg;
    return avg;
  }

  // Overall average across ALL entered cells (every indicator, every
  // month) -- not an average of the row averages, but the average of
  // available raw data points, so it isn't skewed by how many months a
  // given indicator happens to have.
  function recalcOverall() {
    const inputs = table.querySelectorAll("tbody input.irc1a-rating");
    const values = Array.from(inputs).map((input) => parseFloat(input.value));
    const avg = average(values);

    if (overallAvgEl)
      overallAvgEl.textContent = avg === null ? "—" : avg.toFixed(3);
    paintDescriptiveBadge(overallDescEl, avg);
    if (overallDescEl && avg === null)
      overallDescEl.textContent = "No data yet";

    if (footerAnnualAvgEl)
      footerAnnualAvgEl.textContent = avg === null ? "—" : avg.toFixed(3);
    paintDescriptiveBadge(footerAnnualDescEl, avg);
  }

  // --- Monthly / Quarterly trend chart ---
  function bandColor(avg) {
    if (avg === null || avg === undefined) return "#9ca3af";
    if (avg >= 3.51) return "#22c55e";
    if (avg >= 2.51) return "#3b82f6";
    if (avg >= 1.51) return "#f59e0b";
    return "#ef4444";
  }

  function getMonthlyTrendPoints() {
    return MONTHS.map((m) => ({
      label: MONTH_LABELS[m],
      avg: monthAverages[m] === undefined ? null : monthAverages[m],
      tooltip: MONTH_LABELS[m],
    }));
  }

  function getQuarterlyTrendPoints() {
    // "Average only for months with data" -- a quarter with zero
    // populated months has no average at all (null), rather than 0.
    return QUARTERS.map((q) => {
      const monthVals = q.months
        .map((m) => monthAverages[m])
        .filter((v) => v !== null && v !== undefined);
      const avg = monthVals.length
        ? monthVals.reduce((a, b) => a + b, 0) / monthVals.length
        : null;
      return { label: q.label, avg, tooltip: q.label };
    });
  }

  function renderTrendChart() {
    if (!trendChartWrap) return;

    const points =
      trendMode === "quarterly"
        ? getQuarterlyTrendPoints()
        : getMonthlyTrendPoints();

    const hasData = points.some((p) => p.avg !== null);
    if (!hasData) {
      trendChartWrap.innerHTML =
        '<p class="irc1a-lowest-placeholder">Enter ratings below to see the trend.</p>';
      return;
    }

    const width = 720;
    const height = 180;
    const marginLeft = 30;
    const marginRight = 12;
    const marginTop = 12;
    const marginBottom = 22;
    const plotWidth = width - marginLeft - marginRight;
    const plotHeight = height - marginTop - marginBottom;
    const n = points.length;

    const xAt = (i) =>
      n === 1
        ? marginLeft + plotWidth / 2
        : marginLeft + (i / (n - 1)) * plotWidth;
    const yAt = (v) => marginTop + (1 - (v - 1) / 4) * plotHeight;

    let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;

    // Gridlines + y-axis labels at ratings 1-5
    for (let v = 1; v <= 5; v++) {
      const y = yAt(v);
      svg += `<line x1="${marginLeft}" y1="${y}" x2="${width - marginRight}" y2="${y}" stroke="#eef1f5" stroke-width="1" />`;
      svg += `<text x="${marginLeft - 6}" y="${y + 2.5}" text-anchor="end" font-size="7" fill="#999">${v}</text>`;
    }

    // Line segments -- broken at gaps so missing months/quarters don't
    // get bridged by a misleading straight line.
    let segment = [];
    const segments = [];
    points.forEach((p, i) => {
      if (p.avg === null) {
        if (segment.length) segments.push(segment);
        segment = [];
      } else {
        segment.push([xAt(i), yAt(p.avg)]);
      }
    });
    if (segment.length) segments.push(segment);

    segments.forEach((seg) => {
      if (seg.length < 2) return;
      const d = seg
        .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`)
        .join(" ");
      svg += `<path d="${d}" fill="none" stroke="#4a6fa5" stroke-width="1.5" />`;
    });

    // Points + x-axis labels
    points.forEach((p, i) => {
      const x = xAt(i);
      svg += `<text x="${x}" y="${height - 4}" text-anchor="middle" font-size="7" fill="#666">${p.label}</text>`;
      if (p.avg !== null) {
        const y = yAt(p.avg);
        const color = bandColor(p.avg);
        svg += `<circle class="irc1a-trend-point" cx="${x}" cy="${y}" r="3" style="fill:${color}"><title>${p.tooltip}: ${p.avg.toFixed(3)} (${descriptiveValue(p.avg)})</title></circle>`;
      }
    });

    svg += "</svg>";
    trendChartWrap.innerHTML = svg;
  }

  if (trendToggle) {
    trendToggle.addEventListener("click", (e) => {
      const btn = e.target.closest(".irc1a-toggle-btn");
      if (!btn) return;
      const mode = btn.dataset.mode;
      if (mode === trendMode) return;
      trendMode = mode;
      trendToggle
        .querySelectorAll(".irc1a-toggle-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      renderTrendChart();
    });
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
      li.textContent = "Enter ratings below to see results.";
      lowestList.appendChild(li);
      return;
    }

    entries.sort((a, b) => a.avg - b.avg);
    const lowestThree = entries.slice(0, 3);

    lowestThree.forEach((item, idx) => {
      const rank = idx + 1;
      const li = document.createElement("li");
      li.className = "irc1a-lowest-item";
      li.innerHTML = `<span class="irc1a-lowest-rank irc1a-rank-${rank}">${rank}</span><span class="irc1a-lowest-label">${item.label}</span><span class="irc1a-lowest-avg">${item.avg.toFixed(3)}</span>`;
      lowestList.appendChild(li);
    });
  }

  function recalcAll() {
    MONTHS.forEach(recalcMonth);
    for (let i = 1; i <= INDICATOR_COUNT; i++) recalcRow(i);
    recalcLowest();
    recalcOverall();
    renderTrendChart();
  }

  table.addEventListener("input", (e) => {
    if (!e.target.matches("input.irc1a-rating")) return;
    const row = e.target.closest("tr[data-indicator]");
    recalcMonth(e.target.dataset.month);
    if (row) recalcRow(row.dataset.indicator);
    recalcLowest();
    recalcOverall();
    renderTrendChart();
  });

  // Format each rating cell to exactly 3 decimal places once the user
  // leaves the field (blur), so "4" becomes "4.000" without disrupting typing.
  // Manual typing needs its own persistence path -- unlike a PDF import,
  // there's no "Confirm" button here, so each cell saves itself on blur.
  table.addEventListener(
    "blur",
    (e) => {
      if (!e.target.matches("input.irc1a-rating")) return;
      formatToThreeDecimals(e.target);
      saveManualRating(e.target);
    },
    true, // capture, since blur does not bubble
  );

  function saveManualRating(input) {
    const row = input.closest("tr[data-indicator]");
    if (!row) return;

    const indicatorId = row.dataset.indicator;
    const monthKey = input.dataset.month;

    // Cleared cell: delete the saved value instead of leaving it in the
    // DB. Previously this just returned here, so an emptied cell had no
    // way to reach the server and the old value came right back on the
    // next page load/refresh.
    if (input.value === "") {
      deleteManualRating(indicatorId, monthKey);
      return;
    }

    const value = parseFloat(input.value);
    if (Number.isNaN(value)) return;

    fetch("/irc/irc1a/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month_key: monthKey,
        ratings: { [indicatorId]: value },
      }),
    }).catch(() => {
      /* Best-effort: a failed save here shouldn't interrupt typing. The
         next successful edit (or a page reload once connectivity is back)
         will resend the current value anyway. */
    });
  }

  function deleteManualRating(indicatorId, monthKey) {
    fetch(`/irc/irc1a/rating/${monthKey}/${indicatorId}`, {
      method: "DELETE",
    }).catch(() => {
      /* Best-effort, same as saveManualRating's save path -- a failed
         delete just means the old value comes back on next reload, which
         the user can retry by clearing the cell again. */
    });
  }

  // Loads whatever's already saved in the database for this year, so a
  // page reload shows previously-imported/edited ratings instead of an
  // empty table (see /irc/irc1a/data in app.py).
  function loadPersistedRatings() {
    fetch("/irc/irc1a/data")
      .then((res) => res.json())
      .then((data) => {
        const ratings = data.ratings || {};
        Object.keys(ratings).forEach((indicatorId) => {
          Object.keys(ratings[indicatorId]).forEach((monthKey) => {
            const input = table.querySelector(
              `tbody tr[data-indicator="${indicatorId}"] input.irc1a-rating[data-month="${monthKey}"]`,
            );
            if (input) {
              input.value = ratings[indicatorId][monthKey];
              formatToThreeDecimals(input);
            }
          });
        });
        recalcAll();
      })
      .catch(() => {
        /* Table just stays at its blank baseline. */
      });
  }

  // --- Legend modal ---
  function openLegend() {
    if (legendOverlay) legendOverlay.classList.add("visible");
  }

  function closeLegend() {
    if (legendOverlay) legendOverlay.classList.remove("visible");
  }

  if (legendBtn) legendBtn.addEventListener("click", openLegend);
  if (legendCloseBtn) legendCloseBtn.addEventListener("click", closeLegend);
  if (legendOverlay) {
    legendOverlay.addEventListener("click", (e) => {
      if (e.target === legendOverlay) closeLegend();
    });
  }

  // --- Reset All Data ---
  // Clicking the reset button opens the confirmation modal (see
  // irc1a-reset-confirm-overlay in irc1a.html); the actual wipe only
  // happens once the user confirms inside that modal.
  function openResetConfirm() {
    if (resetConfirmOverlay) resetConfirmOverlay.classList.add("visible");
  }

  function closeResetConfirm() {
    if (resetConfirmOverlay) resetConfirmOverlay.classList.remove("visible");
  }

  function performReset() {
    if (resetBtn) resetBtn.disabled = true;

    fetch("/irc/irc1a/reset", { method: "DELETE" })
      .then((res) => res.json())
      .then((result) => {
        if (resetBtn) resetBtn.disabled = false;
        if (result.error) {
          alert("Reset failed: " + result.error);
          return;
        }

        // Wipe the table client-side without re-triggering per-cell
        // save/delete requests (the DB was already cleared server-side
        // in one shot above).
        table.querySelectorAll("tbody input.irc1a-rating").forEach((input) => {
          input.value = "";
        });

        const positive = document.getElementById("irc1a-positive");
        const ofi = document.getElementById("irc1a-ofi");
        if (positive) positive.value = "";
        if (ofi) ofi.value = "";

        recalcAll();
      })
      .catch((err) => {
        if (resetBtn) resetBtn.disabled = false;
        alert("Reset failed: " + err.message);
      });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", openResetConfirm);
  }
  if (resetConfirmCancelBtn) {
    resetConfirmCancelBtn.addEventListener("click", closeResetConfirm);
  }
  if (resetConfirmOverlay) {
    resetConfirmOverlay.addEventListener("click", (e) => {
      if (e.target === resetConfirmOverlay) closeResetConfirm();
    });
  }
  if (resetConfirmConfirmBtn) {
    resetConfirmConfirmBtn.addEventListener("click", () => {
      closeResetConfirm();
      performReset();
    });
  }

  recalcAll();
  loadPersistedRatings();
})();
