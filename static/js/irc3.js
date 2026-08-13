(function () {
  const tab = document.getElementById("irc3-tab");
  if (!tab) return;

  const DEDP_TOTAL = 26;
  const NONDEDP_TOTAL = 41;
  const GRAND_TOTAL = DEDP_TOTAL + NONDEDP_TOTAL;

  // Standard CSC-style adjectival ratings paired with the 1-5 score
  const SCORE_LABELS = {
    5: "Outstanding",
    4: "Very Satisfactory",
    3: "Satisfactory",
    2: "Unsatisfactory",
    1: "Poor",
  };

  function clamp(value, min, max) {
    if (Number.isNaN(value)) return min;
    return Math.min(Math.max(value, min), max);
  }

  // Maps a percentage to the 1-5 OPCR/IPCR efficiency score using the
  // published brackets (96-100 / 91-95 / 86-90 / 81-85 / <=80).
  function getScore(percent) {
    if (percent >= 96) return 5;
    if (percent >= 91) return 4;
    if (percent >= 86) return 3;
    if (percent >= 81) return 2;
    return 1;
  }

  function paintScoreBadge(el, score) {
    if (!el) return;
    el.textContent = `${score} \u2013 ${SCORE_LABELS[score]}`;
    el.className = `irc3-score-badge irc3-score-${score}`;
  }

  function paintPercentBadge(el, percent) {
    if (!el) return;
    el.textContent = `${percent}%`;
  }

  function readClampedInt(id, min, max) {
    const el = document.getElementById(id);
    if (!el) return 0;
    const clamped = clamp(parseInt(el.value, 10) || 0, min, max);
    el.value = clamped;
    return clamped;
  }

  // --- Provision + score row ---
  function updateRow(idPrefix, taCount, base) {
    const percent = base > 0 ? Math.round((taCount / base) * 100) : 0;
    const score = getScore(percent);

    paintPercentBadge(document.getElementById(`${idPrefix}-percent`), percent);
    paintScoreBadge(document.getElementById(`${idPrefix}-score`), score);
  }

  function recalcAll() {
    const dedpTA = readClampedInt("irc3-dedp-ta", 0, DEDP_TOTAL);
    const nondedpTA = readClampedInt("irc3-nondedp-ta", 0, NONDEDP_TOTAL);
    const totalTA = dedpTA + nondedpTA;

    // Provided with TA + percentage + score
    updateRow("irc3-dedp-ta", dedpTA, DEDP_TOTAL);
    updateRow("irc3-nondedp-ta", nondedpTA, NONDEDP_TOTAL);
    document.getElementById("irc3-total-ta").textContent =
      totalTA.toLocaleString();
    updateRow("irc3-total-ta", totalTA, GRAND_TOTAL);

    // Not provided with TA (fully automatic)
    const dedpNot = DEDP_TOTAL - dedpTA;
    const nondedpNot = NONDEDP_TOTAL - nondedpTA;
    document.getElementById("irc3-dedp-not-provided").textContent =
      dedpNot.toLocaleString();
    document.getElementById("irc3-nondedp-not-provided").textContent =
      nondedpNot.toLocaleString();
    document.getElementById("irc3-total-not-provided").textContent = (
      dedpNot + nondedpNot
    ).toLocaleString();

    // Target totals
    recalcTarget();
  }

  function recalcTarget() {
    const dedpTarget = readClampedInt("irc3-dedp-target", 0, DEDP_TOTAL);
    const nondedpTarget = readClampedInt(
      "irc3-nondedp-target",
      0,
      NONDEDP_TOTAL,
    );

    document.getElementById("irc3-total-target").textContent = (
      dedpTarget + nondedpTarget
    ).toLocaleString();
  }

  // --- Rating basis cards: walks every possible count 0..base and
  // buckets it by score, using the exact same percent/score logic as
  // the live table, so the cards never drift out of sync with the
  // badges shown in the main table.
  function computeScoreRanges(base) {
    const ranges = { 5: null, 4: null, 3: null, 2: null, 1: null };

    for (let count = 0; count <= base; count++) {
      const percent = Math.round((count / base) * 100);
      const score = getScore(percent);

      if (!ranges[score]) {
        ranges[score] = [count, count];
      } else {
        ranges[score][1] = count;
      }
    }

    return ranges;
  }

  function formatRange(range, score) {
    if (!range) return "&ndash;";
    const [min, max] = range;
    if (score === 1) return `${max} & below`;
    if (min === max) return `${min}`;
    return `${min}&ndash;${max}`;
  }

  function renderBasisCards() {
    const bases = {
      dedp: DEDP_TOTAL,
      nondedp: NONDEDP_TOTAL,
      total: GRAND_TOTAL,
    };

    Object.entries(bases).forEach(([key, base]) => {
      const ranges = computeScoreRanges(base);
      [5, 4, 3, 2, 1].forEach((score) => {
        const el = document.getElementById(`irc3-basis-${score}-${key}`);
        if (el) el.innerHTML = formatRange(ranges[score], score);
      });
    });
  }

  // --- Wire up events ---
  ["irc3-dedp-ta", "irc3-nondedp-ta"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", recalcAll);
  });

  ["irc3-dedp-target", "irc3-nondedp-target"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", recalcTarget);
  });

  // --- Initial render ---
  renderBasisCards();
  recalcAll();
})();
