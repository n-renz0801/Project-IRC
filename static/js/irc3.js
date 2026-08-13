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

  function getIntValue(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    return clamp(parseInt(el.value, 10) || 0, 0, parseInt(el.max, 10));
  }

  // --- Provision + score row ---
  function updateRow(idPrefix, taCount, base) {
    const percent = base > 0 ? Math.round((taCount / base) * 100) : 0;
    const score = getScore(percent);

    paintPercentBadge(document.getElementById(`${idPrefix}-percent`), percent);
    paintScoreBadge(document.getElementById(`${idPrefix}-score`), score);

    return percent;
  }

  // --- Dashboard stat card + bar ---
  function updateStat(section, count, base) {
    const percent = base > 0 ? Math.round((count / base) * 100) : 0;

    const countEl = document.getElementById(`irc3-${section}-count`);
    const percentEl = document.getElementById(`irc3-${section}-percent`);
    const barEl = document.getElementById(`irc3-${section}-bar`);
    const barValEl = document.getElementById(`irc3-${section}-bar-val`);

    if (countEl) countEl.textContent = count.toLocaleString();
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (barEl) barEl.style.height = `${percent}%`;
    if (barValEl) barValEl.textContent = `${percent}%`;
  }

  function recalcAll() {
    // Clamp raw inputs first so typing out-of-range values self-corrects
    const dedpInput = document.getElementById("irc3-dedp-ta");
    const nondedpInput = document.getElementById("irc3-nondedp-ta");
    dedpInput.value = clamp(parseInt(dedpInput.value, 10) || 0, 0, DEDP_TOTAL);
    nondedpInput.value = clamp(
      parseInt(nondedpInput.value, 10) || 0,
      0,
      NONDEDP_TOTAL,
    );

    const dedpTA = getIntValue("irc3-dedp-ta");
    const nondedpTA = getIntValue("irc3-nondedp-ta");
    const totalTA = dedpTA + nondedpTA;

    // Provision + score table
    updateRow("irc3-dedp-ta", dedpTA, DEDP_TOTAL);
    updateRow("irc3-nondedp-ta", nondedpTA, NONDEDP_TOTAL);
    document.getElementById("irc3-total-ta").textContent =
      totalTA.toLocaleString();
    updateRow("irc3-total-ta", totalTA, GRAND_TOTAL);

    // Not-provided table (fully automatic)
    const dedpNot = DEDP_TOTAL - dedpTA;
    const nondedpNot = NONDEDP_TOTAL - nondedpTA;
    document.getElementById("irc3-dedp-not-provided").textContent =
      dedpNot.toLocaleString();
    document.getElementById("irc3-nondedp-not-provided").textContent =
      nondedpNot.toLocaleString();
    document.getElementById("irc3-total-not-provided").textContent = (
      dedpNot + nondedpNot
    ).toLocaleString();

    // Dashboard
    updateStat("dedp", dedpTA, DEDP_TOTAL);
    updateStat("nondedp", nondedpTA, NONDEDP_TOTAL);
  }

  function recalcTarget() {
    const dedpTargetInput = document.getElementById("irc3-dedp-target");
    const nondedpTargetInput = document.getElementById("irc3-nondedp-target");

    dedpTargetInput.value = clamp(
      parseInt(dedpTargetInput.value, 10) || 0,
      0,
      DEDP_TOTAL,
    );
    nondedpTargetInput.value = clamp(
      parseInt(nondedpTargetInput.value, 10) || 0,
      0,
      NONDEDP_TOTAL,
    );

    const dedpTarget = parseInt(dedpTargetInput.value, 10) || 0;
    const nondedpTarget = parseInt(nondedpTargetInput.value, 10) || 0;

    document.getElementById("irc3-total-target").textContent = (
      dedpTarget + nondedpTarget
    ).toLocaleString();
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
  recalcAll();
  recalcTarget();
})();
