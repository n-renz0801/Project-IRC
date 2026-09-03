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

  // Quarter groupings for the "Quarterly" chart view -- a quarter's value
  // is the sum of its 3 months' values, and it "has data" if any of its
  // months has data (blank vs. typed, same distinction as the monthly view).
  const QUARTERS = [
    { key: "q1", label: "Q1", months: ["jan", "feb", "mar"] },
    { key: "q2", label: "Q2", months: ["apr", "may", "jun"] },
    { key: "q3", label: "Q3", months: ["jul", "aug", "sep"] },
    { key: "q4", label: "Q4", months: ["oct", "nov", "dec"] },
  ];

  const MIN_POINTS_FOR_AVERAGE = 1; // average only shows once MORE than this many periods have data

  const table = document.getElementById("irc1b-table");
  if (!table) return;

  const totalSpan = document.getElementById("irc1b-total");
  const totalStatValue = document.getElementById("irc1b-total-stat-value");
  const chartEl = document.getElementById("irc1b-chart");
  const periodToggle = document.getElementById("chartPeriodToggle");
  const resetAllBtn = document.getElementById("resetAllBtn");

  // "monthly" or "quarterly" -- which view the chart currently renders.
  let currentPeriod = "monthly";

  // Cached from the last recalc, so switching the toggle can redraw the
  // chart instantly without re-reading every input.
  let lastValues = null;
  let lastHasData = null;

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

  // Builds the ordered list of chart data points for the current period.
  function buildDataPoints(values, hasData, period) {
    if (period === "quarterly") {
      return QUARTERS.map((q) => ({
        key: q.key,
        label: q.label,
        value: q.months.reduce((sum, m) => sum + values[m], 0),
        hasData: q.months.some((m) => hasData[m]),
      }));
    }
    return MONTHS.map((m) => ({
      key: m,
      label: MONTH_LABELS[m],
      value: values[m],
      hasData: hasData[m],
    }));
  }

  // Draws the line-chart SVG (polyline + points + optional average line)
  // into `track`, sized to the track's actual pixel dimensions so it lines
  // up exactly with the period labels underneath.
  function drawLineSvg(track, points, max, avg, showAverage) {
    const svgNS = "http://www.w3.org/2000/svg";
    const width = Math.max(track.clientWidth, 1);
    const height = Math.max(track.clientHeight, 1);

    const padX = 22; // keeps the first/last points' value labels on-screen
    const padTop = 24; // room above the highest point for its value label
    const padBottom = 4;
    const usableWidth = Math.max(width - padX * 2, 1);
    const usableHeight = Math.max(height - padTop - padBottom, 1);

    const n = points.length;
    const xFor = (i) =>
      n === 1 ? width / 2 : padX + (usableWidth * i) / (n - 1);
    const yFor = (val) => {
      if (max <= 0) return height - padBottom;
      const frac = Math.max(0, Math.min(1, val / max));
      return height - padBottom - frac * usableHeight;
    };

    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.classList.add("irc1b-chart-svg");

    if (showAverage) {
      const y = yFor(avg);
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", "0");
      line.setAttribute("x2", String(width));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("class", "irc1b-chart-avg-line-svg");
      svg.appendChild(line);
    }

    const linePoints = points
      .map((p, i) => `${xFor(i)},${yFor(p.value)}`)
      .join(" ");
    const polyline = document.createElementNS(svgNS, "polyline");
    polyline.setAttribute("points", linePoints);
    polyline.setAttribute("class", "irc1b-chart-line-path");
    svg.appendChild(polyline);

    points.forEach((p, i) => {
      const cx = xFor(i);
      const cy = yFor(p.value);

      if (p.value > 0) {
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", String(cx));
        text.setAttribute("y", String(cy - 10));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("class", "irc1b-chart-val-text");
        text.textContent = p.value.toLocaleString();
        svg.appendChild(text);
      }

      const circle = document.createElementNS(svgNS, "circle");
      circle.setAttribute("cx", String(cx));
      circle.setAttribute("cy", String(cy));
      circle.setAttribute("r", p.value > 0 ? "4" : "3");
      circle.setAttribute(
        "class",
        "irc1b-chart-point" + (p.value > 0 ? "" : " irc1b-chart-point-empty"),
      );
      const titleEl = document.createElementNS(svgNS, "title");
      titleEl.textContent = `${p.label}: ${p.value.toLocaleString()}`;
      circle.appendChild(titleEl);
      svg.appendChild(circle);
    });

    track.appendChild(svg);

    if (showAverage) {
      const y = yFor(avg);
      const label = document.createElement("div");
      label.className = "irc1b-chart-avg-label";
      label.style.top = y + "px";
      label.textContent = "Avg: " + formatAverage(avg);
      track.appendChild(label);
    }
  }

  function renderChart(values, hasData) {
    const points = buildDataPoints(values, hasData, currentPeriod);
    const max = Math.max(1, ...points.map((p) => p.value));

    const filledPoints = points.filter((p) => p.hasData);
    const showAverage = filledPoints.length > MIN_POINTS_FOR_AVERAGE;
    const avg = showAverage
      ? filledPoints.reduce((sum, p) => sum + p.value, 0) / filledPoints.length
      : 0;

    chartEl.innerHTML = "";

    // Track: relative container the SVG is measured against and drawn into.
    const track = document.createElement("div");
    track.className = "irc1b-chart-track";
    chartEl.appendChild(track);

    // Period labels row, aligned under the points via matching flex/gap.
    const labelsRow = document.createElement("div");
    labelsRow.className = "irc1b-chart-labels";
    points.forEach((p) => {
      const label = document.createElement("span");
      label.className = "irc1b-chart-label";
      label.textContent = p.label;
      labelsRow.appendChild(label);
    });
    chartEl.appendChild(labelsRow);

    // Drawn last, once the track has real layout dimensions to measure.
    drawLineSvg(track, points, max, avg, showAverage);
  }

  function recalcAll() {
    const { values, hasData } = getValues();
    lastValues = values;
    lastHasData = hasData;
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

  // --- Reset All Data ---
  function resetAllData() {
    const confirmed = window.confirm(
      "This will permanently delete every month's customer count for this " +
        "year. This cannot be undone. Continue?",
    );
    if (!confirmed) return;

    resetAllBtn.disabled = true;
    const originalLabel = resetAllBtn.innerHTML;
    resetAllBtn.textContent = "Resetting...";

    fetch("/irc/irc1b/reset", { method: "DELETE" })
      .then((res) => res.json())
      .then((result) => {
        if (result.error) {
          alert("Reset failed: " + result.error);
          return;
        }
        // Clear every input, then recompute the total/chart/DB state so
        // the page matches the now-empty database.
        table.querySelectorAll("input.irc1b-customers").forEach((input) => {
          input.value = "";
        });
        recalcAll();
      })
      .catch((err) => {
        alert("Reset failed: " + err.message);
      })
      .finally(() => {
        resetAllBtn.disabled = false;
        resetAllBtn.innerHTML = originalLabel;
      });
  }

  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", resetAllData);
  }

  // --- Monthly / Quarterly chart toggle ---
  if (periodToggle) {
    periodToggle.addEventListener("click", (e) => {
      const btn = e.target.closest(".irc1b-chart-toggle-btn");
      if (!btn) return;
      const period = btn.dataset.period;
      if (!period || period === currentPeriod) return;

      currentPeriod = period;
      periodToggle.querySelectorAll(".irc1b-chart-toggle-btn").forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      if (lastValues && lastHasData) {
        renderChart(lastValues, lastHasData);
      }
    });
  }

  // Redraw on resize so the SVG stays aligned to the track's actual
  // pixel size (e.g. sidebar collapse, window resize, zoom).
  let resizeRaf = null;
  window.addEventListener("resize", () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (lastValues && lastHasData) {
        renderChart(lastValues, lastHasData);
      }
    });
  });

  recalcAll();
  loadPersistedCounts();
})();
