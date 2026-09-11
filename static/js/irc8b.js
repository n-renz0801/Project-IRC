(function () {
  const sectionsCbcEl = document.getElementById("irc8b-sections-cbc");
  const sectionsCsEl = document.getElementById("irc8b-sections-cs");
  if (!sectionsCbcEl || !sectionsCsEl) return;

  // Maps a DATA section key to the container it renders into, now that
  // Core Behavioral Competencies and Core Skills each get their own
  // guided-flow step/section instead of sharing one #irc8b-sections list.
  const SECTION_CONTAINERS = {
    cbc: sectionsCbcEl,
    cs: sectionsCsEl,
  };

  const summaryCbcEl = document.getElementById("irc8b-summary-cbc");
  const summaryCbcDescEl = document.getElementById("irc8b-summary-cbc-desc");
  const summaryCsEl = document.getElementById("irc8b-summary-cs");
  const summaryCsDescEl = document.getElementById("irc8b-summary-cs-desc");
  const summaryOverallEl = document.getElementById("irc8b-summary-overall");
  const summaryOverallDescEl = document.getElementById(
    "irc8b-summary-overall-desc",
  );

  const resetBtn = document.getElementById("irc8b-reset-btn");
  const resetConfirmOverlay = document.getElementById(
    "irc8b-reset-confirm-overlay",
  );
  const resetConfirmCancelBtn = document.getElementById(
    "irc8b-reset-confirm-cancel",
  );
  const resetConfirmConfirmBtn = document.getElementById(
    "irc8b-reset-confirm-confirm",
  );

  // ================= Rating scale =================
  const RATING_LABELS = {
    5: "Role model",
    4: "Consistently demonstrate",
    3: "Most of the time demonstrate",
    2: "Sometimes demonstrate",
    1: "Rarely demonstrate",
  };

  // ================= Fixed data model =================
  const DATA = [
    {
      key: "cbc",
      title: "Core Behavioral Competencies",
      subsections: [
        {
          key: "self_management",
          title: "Self Management",
          criteria: [
            "Sets personal goals and direction, needs and development.",
            "Undertakes personal actions and behaviors that are clear and purposive and takes into account personal goals and values congruent to that of the organization.",
            "Displays emotional maturity and enthusiasm for and is challenged by higher goals.",
            "Prioritize work tasks and schedules (through gantt charts, checklists, etc.) to achieve goals.",
            "Sets high quality, challenging, realistic goals for self and others.",
          ],
        },
        {
          key: "teamwork",
          title: "Teamwork",
          criteria: [
            "Willingly does his/her share of responsibility.",
            "Promotes collaboration and removes barriers to teamwork and goal accomplishment across the organization.",
            "Applies negotiation principles in arriving at win-win agreements.",
            "Drives consensus and team ownership of decisions.",
            "Works constructively and collaboratively with others and across organizations to accomplish organizational goals and objectives.",
          ],
        },
        {
          key: "professionalism_ethics",
          title: "Professionalism and Ethics",
          criteria: [
            "Demonstrates the values and behavior enshrined in the Norms of Conduct and Ethical Standards for public officials and employees (RA 6713).",
            "Practices ethical and professional behavior and conduct taking into account the impact of his/her actions and decisions.",
            "Maintains a professional image: being trustworthy, regularity of attendance and punctuality, good grooming and communication.",
            "Makes personal sacrifices to meet the organization's needs.",
            "Acts with a sense of urgency and responsibility to meet the organization's needs, improve systems and help others improve their effectiveness.",
          ],
        },
        {
          key: "service_orientation",
          title: "Service Orientation",
          criteria: [
            "Can explain and articulate organizational directions, issues and problems.",
            "Takes personal responsibility for dealing with and/or correcting customer service issues and concerns.",
            "Initiates activities that promotes advocacy for men and women empowerment.",
            "Participates in updating of office vision, mission, mandates and strategies based on DepEd strategies and directions.",
            "Develops and adopts service improvement programs through simplified procedures that will further enhance service delivery.",
          ],
        },
        {
          key: "result_focus",
          title: "Result Focus",
          criteria: [
            "Achieves results with optimal use of time and resources most of the time.",
            "Avoids rework, mistakes and wastage through effective work methods by placing organizational needs before personal needs.",
            "Delivers error-free outputs most of the time by conforming to standard operating procedures correctly and consistently. Able to produce very satisfactory quality of work in terms of usefulness/acceptability and completeness with no supervision required.",
            "Expresses a desire to do better and may express frustration at waste or inefficiency. May focus on new or more precise ways of meeting goals set.",
            "Makes specific changes in the system or in own work methods to improve performance. Examples may include doing something better, faster, at a lower cost, more efficiently; or improving quality, customer satisfaction, morale, without setting any specific goal.",
          ],
        },
        {
          key: "innovation",
          title: "Innovation",
          criteria: [
            "Examines the root cause of problems and suggests effective solutions. Fosters new ideas, processes, and suggests better ways to do things (cost and/or operational efficiency).",
            'Demonstrates an ability to think "beyond the box". Continuously focuses on improving personal productivity to create higher value and results.',
            "Promotes a creative climate and inspires co-workers to develop original ideas or solutions.",
            "Translates creative thinking into tangible changes and solutions that improve the work unit and organization.",
            "Uses ingenious methods to accomplish responsibilities. Demonstrates resourcefulness and the ability to succeed with minimal resources.",
          ],
        },
      ],
    },
    {
      key: "cs",
      title: "Core Skills",
      subsections: [
        {
          key: "achievement",
          title: "Achievement",
          criteria: [
            "Enjoys working hard.",
            "Is action-oriented and full of energy for the things he/she sees as challenging.",
            "Not fearful of acting with a minimum of planning.",
            "Seizes more opportunities than others.",
            "Strategic thinker.",
          ],
        },
        {
          key: "managing_diversity",
          title: "Managing Diversity",
          criteria: [
            "Respects all kinds and classes of people.",
            "Deals effectively with all races, nationalities, cultures, disabilities, ages and both sexes.",
            "Support equal and fair treatment and opportunity for all.",
            "Applies equal standards and criteria to all classes.",
            "Manifests cultural and gender sensitivity when dealing with people.",
          ],
        },
        {
          key: "accountability",
          title: "Accountability",
          criteria: [
            "Can be counted on to exceed goals successfully.",
            "Steadfastly pushes self and others towards results.",
            "Gets things done on time and optimum use of resources.",
            "Builds team spirit.",
            "Transacts with transparency.",
          ],
        },
      ],
    },
  ];

  // ================= State =================
  // ratings[subsectionKey] = [r1, r2, r3, r4, r5]  (each null or 1-5)
  const ratings = {};
  DATA.forEach((section) => {
    section.subsections.forEach((sub) => {
      ratings[sub.key] = sub.criteria.map(() => null);
    });
  });

  // Which section (cbc/cs) each subsection belongs to -- needed when
  // saving a rating, since the server stores sectionKey alongside it
  // (see models.IRC8BRating) even though the client mostly indexes by
  // subsectionKey alone.
  const SUBSECTION_TO_SECTION = {};
  DATA.forEach((section) => {
    section.subsections.forEach((sub) => {
      SUBSECTION_TO_SECTION[sub.key] = section.key;
    });
  });

  const YEAR = new Date().getFullYear();

  // Ratings themselves are persisted server-side (see /irc/irc8b/data and
  // /irc/irc8b/rating) -- the sections/subsections/criteria above stay
  // hardcoded, only the numbers the user picks are saved.
  async function loadRatings() {
    try {
      const res = await fetch(`/irc/irc8b/data?year=${YEAR}`);
      if (!res.ok) throw new Error("Failed to load ratings");
      const data = await res.json();
      const serverRatings = data.ratings || {};

      Object.keys(serverRatings).forEach((subKey) => {
        if (!ratings[subKey]) return; // unknown subsection key -- ignore
        const idxMap = serverRatings[subKey];
        Object.keys(idxMap).forEach((idxStr) => {
          const idx = Number(idxStr);
          if (idx >= 0 && idx < ratings[subKey].length) {
            ratings[subKey][idx] = idxMap[idxStr];
          }
        });
      });
    } catch (err) {
      console.error("Failed to load IRC8b ratings:", err);
    }
    render();
  }

  async function saveRating(subKey, idx, value) {
    try {
      const res = await fetch("/irc/irc8b/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: YEAR,
          sectionKey: SUBSECTION_TO_SECTION[subKey],
          subsectionKey: subKey,
          criterionIndex: idx,
          rating: value,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
    } catch (err) {
      console.error("Failed to save IRC8b rating:", err);
    }
  }

  // ================= Reset-page confirmation modal =================
  // There's no bulk-clear endpoint (only per-criterion POST /rating,
  // which accepts rating: null to clear one), so reset fires one
  // best-effort clear request per currently-set rating -- same
  // per-item pattern used everywhere else these reset buttons appear.
  function openResetConfirm() {
    resetConfirmOverlay.classList.add("visible");
  }

  function closeResetConfirm() {
    resetConfirmOverlay.classList.remove("visible");
  }

  resetBtn.addEventListener("click", openResetConfirm);
  resetConfirmCancelBtn.addEventListener("click", closeResetConfirm);
  resetConfirmOverlay.addEventListener("click", (e) => {
    if (e.target === resetConfirmOverlay) closeResetConfirm();
  });

  resetConfirmConfirmBtn.addEventListener("click", async () => {
    resetConfirmConfirmBtn.disabled = true;
    try {
      const clears = [];
      Object.keys(ratings).forEach((subKey) => {
        ratings[subKey].forEach((value, idx) => {
          if (value !== null) {
            clears.push(saveRating(subKey, idx, null));
          }
          ratings[subKey][idx] = null;
        });
      });
      await Promise.all(clears);
    } finally {
      render();
      resetConfirmConfirmBtn.disabled = false;
      closeResetConfirm();
    }
  });

  // ================= Helpers =================
  function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  function average(values) {
    const rated = values.filter((v) => v !== null && v !== undefined);
    if (rated.length === 0) return null;
    return rated.reduce((sum, v) => sum + v, 0) / rated.length;
  }

  // Converts a numeric average into the closest 1-5 descriptive label
  // (e.g. 4.3 -> "Consistently demonstrate"). Empty when nothing rated.
  function ratingDescription(avg) {
    if (avg === null || avg === undefined || isNaN(avg)) return "";
    let rounded = Math.round(avg);
    rounded = Math.min(5, Math.max(1, rounded));
    return RATING_LABELS[rounded];
  }

  function subsectionAverage(subKey) {
    return average(ratings[subKey]);
  }

  function sectionAverage(section) {
    const subAvgs = section.subsections
      .map((sub) => subsectionAverage(sub.key))
      .filter((v) => v !== null);
    return average(subAvgs);
  }

  // ================= Render =================
  function render() {
    sectionsCbcEl.innerHTML = "";
    sectionsCsEl.innerHTML = "";

    DATA.forEach((section) => {
      const container = SECTION_CONTAINERS[section.key];
      if (!container) return; // unknown section key -- shouldn't happen

      const sectionCard = document.createElement("div");
      sectionCard.className = "irc8b-section";

      const secAvg = sectionAverage(section);

      const subHtml = section.subsections
        .map((sub) => renderSubsection(sub))
        .join("");

      sectionCard.innerHTML = `
        <div class="irc8b-section-header">
          <span class="irc8b-section-title">${escapeHtml(section.title)}</span>
          <span class="irc8b-section-avg">${fmtNum(secAvg)}</span>
        </div>
        <div class="irc8b-subsection-list">${subHtml}</div>
      `;

      container.appendChild(sectionCard);
    });

    updateSummary();
  }

  function renderSubsection(sub) {
    const subAvg = subsectionAverage(sub.key);

    const rowsHtml = sub.criteria
      .map((text, i) => renderCriterionRow(sub.key, i, text))
      .join("");

    return `
      <div class="irc8b-subsection-card">
        <div class="irc8b-subsection-header">
          <span class="irc8b-subsection-title">${escapeHtml(sub.title)}</span>
          <span class="irc8b-subsection-avg">${fmtNum(subAvg)}</span>
        </div>
        <div class="irc8b-criteria-list">${rowsHtml}</div>
      </div>
    `;
  }

  function renderCriterionRow(subKey, index, text) {
    const current = ratings[subKey][index];
    const buttons = [5, 4, 3, 2, 1]
      .map((r) => {
        const selected = current === r ? " irc8b-rate-btn--selected" : "";
        return `<button type="button" class="irc8b-rate-btn${selected}" data-sub="${subKey}" data-idx="${index}" data-rate="${r}" title="${r} — ${RATING_LABELS[r]}">${r}</button>`;
      })
      .join("");

    return `
      <div class="irc8b-criterion-row">
        <span class="irc8b-criterion-num">${index + 1}</span>
        <span class="irc8b-criterion-text">${escapeHtml(text)}</span>
        <div class="irc8b-rate-group">${buttons}</div>
      </div>
    `;
  }

  function updateSummary() {
    const cbcSection = DATA.find((s) => s.key === "cbc");
    const csSection = DATA.find((s) => s.key === "cs");

    const cbcAvg = sectionAverage(cbcSection);
    const csAvg = sectionAverage(csSection);
    const sectionAvgs = [cbcAvg, csAvg].filter((v) => v !== null);
    const overallAvg = average(sectionAvgs);

    summaryCbcEl.textContent = fmtNum(cbcAvg);
    summaryCbcDescEl.textContent = ratingDescription(cbcAvg);

    summaryCsEl.textContent = fmtNum(csAvg);
    summaryCsDescEl.textContent = ratingDescription(csAvg);

    summaryOverallEl.textContent = fmtNum(overallAvg);
    summaryOverallDescEl.textContent = ratingDescription(overallAvg);
  }

  // ================= Delegated clicks =================
  function handleRateClick(e) {
    const btn = e.target.closest(".irc8b-rate-btn");
    if (!btn) return;

    const subKey = btn.dataset.sub;
    const idx = parseInt(btn.dataset.idx, 10);
    const rate = parseInt(btn.dataset.rate, 10);

    // Clicking the already-selected rating clears it; otherwise sets it.
    const newValue = ratings[subKey][idx] === rate ? null : rate;
    ratings[subKey][idx] = newValue;

    render();
    saveRating(subKey, idx, newValue);
  }

  sectionsCbcEl.addEventListener("click", handleRateClick);
  sectionsCsEl.addEventListener("click", handleRateClick);

  // ================= Initial load =================
  loadRatings();
})();
