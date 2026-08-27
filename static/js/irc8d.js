(function () {
  const listEl = document.getElementById("irc8d-kra-list");
  if (!listEl) return;

  const emptyStateEl = document.getElementById("irc8d-empty-state");
  const weightWarningEl = document.getElementById("irc8d-weight-warning");
  const weightWarningTextEl = document.getElementById(
    "irc8d-weight-warning-text",
  );
  const summaryEl = document.getElementById("irc8d-summary");
  const summaryRatingEl = document.getElementById("irc8d-summary-rating");
  const summaryAdjectivalEl = document.getElementById(
    "irc8d-summary-adjectival",
  );

  // Same 4-hue cycle as irc8a.js's kraPaletteClass, kept in sync by
  // position (not id) so this page's tinting always matches IRC8a's.
  const KRA_PALETTE_SIZE = 4;
  function kraPaletteClass(kraIndex) {
    return "irc8d-kra-palette-" + ((kraIndex % KRA_PALETTE_SIZE) + 1);
  }

  // DepEd RPMS/IPCRF numerical-to-adjectival rating scale (5-point).
  // Adjust the thresholds here if your office uses a different scale --
  // nothing else in this file depends on the exact cutoffs.
  const ADJECTIVAL_BANDS = [
    { min: 4.5, label: "Outstanding", cls: "outstanding" },
    { min: 3.5, label: "Very Satisfactory", cls: "very-satisfactory" },
    { min: 2.5, label: "Satisfactory", cls: "satisfactory" },
    { min: 1.5, label: "Unsatisfactory", cls: "unsatisfactory" },
    { min: -Infinity, label: "Poor", cls: "poor" },
  ];

  function adjectivalRating(score) {
    return ADJECTIVAL_BANDS.find((band) => score >= band.min);
  }

  // ================= API helper =================
  async function apiCall(method, url) {
    let res;
    try {
      res = await fetch(url, { method });
    } catch (e) {
      throw new Error(
        "Network error — please check your connection and try again.",
      );
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // no/invalid JSON body — fall through with data = null
    }
    if (!res.ok) {
      throw new Error(
        (data && data.error) || "Something went wrong. Please try again.",
      );
    }
    return data;
  }

  // ================= Helpers =================
  function fmtWeight(w) {
    if (w === null || w === undefined || w === "" || isNaN(w)) return "—";
    const n = Number(w);
    return (Math.round(n * 100) / 100).toString() + "%";
  }

  function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function fmtRate(n) {
    return n === null || n === undefined || n === "" ? "—" : String(n);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  function textOrMuted(str, placeholder) {
    const val = (str || "").trim();
    return val
      ? escapeHtml(val)
      : `<span class="irc8d-muted">${placeholder}</span>`;
  }

  function sumWeights(list) {
    return list.reduce((sum, item) => {
      const w = parseFloat(item.weight);
      return sum + (isNaN(w) ? 0 : w);
    }, 0);
  }

  // ================= Render =================
  function renderKraCard(kra, kraIndex) {
    const card = document.createElement("div");
    card.className = "irc8d-kra-card " + kraPaletteClass(kraIndex);

    const objectives = kra.objectives || [];

    let rowsHtml = "";
    if (objectives.length === 0) {
      rowsHtml = "";
    } else {
      rowsHtml = objectives
        .map(
          (obj) => `
        <tr>
          <td class="irc8d-obj-text">${textOrMuted(obj.text, "Untitled objective")}</td>
          <td class="irc8d-timeline-cell">${textOrMuted(obj.timeline, "No timeline set")}</td>
          <td class="irc8d-actual-cell">${textOrMuted(obj.actualResults, "No actual results recorded yet")}</td>
          <td class="irc8d-rate-cell">${fmtRate(obj.ratings.quality)}</td>
          <td class="irc8d-rate-cell">${fmtRate(obj.ratings.efficiency)}</td>
          <td class="irc8d-rate-cell">${fmtRate(obj.ratings.timeliness)}</td>
          <td class="irc8d-avg-cell">${fmtNum(obj.average)}</td>
          <td class="irc8d-score-cell">${fmtNum(obj.score)}</td>
        </tr>
      `,
        )
        .join("");
    }

    card.innerHTML = `
      <div class="irc8d-kra-card-header">
        <span class="irc8d-kra-card-title">${(kra.text || "").trim() ? escapeHtml(kra.text) : '<span class="irc8d-muted--on-dark">Untitled KRA</span>'}</span>
        <span class="irc8d-kra-card-weight">Weight ${fmtWeight(kra.weight)}</span>
      </div>
      ${
        objectives.length === 0
          ? '<p class="irc8d-no-objectives">No objectives yet for this KRA — add one on the IRC8a tab.</p>'
          : `
        <table class="irc8d-obj-table">
          <colgroup>
            <col class="irc8d-col-objective">
            <col class="irc8d-col-timeline">
            <col class="irc8d-col-actual">
            <col class="irc8d-col-rate">
            <col class="irc8d-col-rate">
            <col class="irc8d-col-rate">
            <col class="irc8d-col-avg">
            <col class="irc8d-col-score">
          </colgroup>
          <thead>
            <tr>
              <th>Objective</th>
              <th>Timeline</th>
              <th>Actual results</th>
              <th class="irc8d-col-rate">Q</th>
              <th class="irc8d-col-rate">E</th>
              <th class="irc8d-col-rate">T</th>
              <th class="irc8d-col-avg">Avg</th>
              <th class="irc8d-col-score">Score</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `
      }
    `;

    return card;
  }

  function updateWeightWarning(totalKraWeight) {
    const ok = Math.abs(totalKraWeight - 100) < 0.005;
    if (ok) {
      weightWarningEl.style.display = "none";
      return;
    }
    weightWarningEl.style.display = "flex";
    weightWarningTextEl.textContent = `Total KRA weight is ${fmtWeight(totalKraWeight)} — it should total 100%. Adjust KRA weights on the IRC8a tab.`;
  }

  function render(kras) {
    listEl.innerHTML = "";

    const hasKras = kras.length > 0;
    listEl.style.display = hasKras ? "flex" : "none";
    emptyStateEl.style.display = hasKras ? "none" : "block";

    if (!hasKras) {
      weightWarningEl.style.display = "none";
      summaryEl.style.display = "none";
      return;
    }

    kras.forEach((kra, kraIndex) => {
      listEl.appendChild(renderKraCard(kra, kraIndex));
    });

    updateWeightWarning(sumWeights(kras));

    let allObjectives = [];
    kras.forEach(
      (k) => (allObjectives = allObjectives.concat(k.objectives || [])),
    );

    let scoreSum = 0;
    let hasAnyScore = false;
    allObjectives.forEach((o) => {
      if (o.score !== null && o.score !== undefined) {
        scoreSum += o.score;
        hasAnyScore = true;
      }
    });

    summaryEl.style.display = "block";
    if (hasAnyScore) {
      summaryRatingEl.textContent = fmtNum(scoreSum);
      const band = adjectivalRating(scoreSum);
      summaryAdjectivalEl.textContent = band.label;
      summaryAdjectivalEl.className =
        "irc8d-summary-adjectival irc8d-summary-adjectival--" + band.cls;
    } else {
      summaryRatingEl.textContent = "—";
      summaryAdjectivalEl.textContent = "";
      summaryAdjectivalEl.className = "irc8d-summary-adjectival";
    }
  }

  // ================= Initial load =================
  // Deliberately hits IRC8a's own data endpoint rather than a separate
  // IRC8d one -- there's nothing IRC8d-specific to store, it's a pure
  // read-only view of whatever's currently on IRC8a. Same approach IRC8c
  // already takes for its "Strength/Development Need" source data.
  async function init() {
    try {
      const data = await apiCall("GET", "/irc/irc8a/data");
      render(data.kras || []);
    } catch (err) {
      listEl.style.display = "none";
      emptyStateEl.style.display = "none";
      weightWarningEl.style.display = "none";
      summaryEl.style.display = "none";
      const errBox = document.createElement("div");
      errBox.className = "irc8d-load-error";
      errBox.textContent = "Couldn't load this report: " + err.message;
      listEl.closest("section").insertBefore(errBox, listEl);
    }
  }

  init();
})();
