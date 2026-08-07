/* IRC2a - Number of Schools Provided with TA - JS */

(function () {
  "use strict";

  // Constant master list — do not add/remove here at runtime.
  // level: "elementary" | "secondary" | "integrated" | "sped"
  const SCHOOLS = [
    { name: "Antipolo City Senior High School", level: "secondary" },
    { name: "Antipolo City SPED Center", level: "sped" },
    { name: "Antipolo National Science and Technology HS", level: "secondary" },
    { name: "Antipolo NHS", level: "secondary" },
    { name: "Apia Integrated School", level: "integrated" },
    { name: "Bagong Nayon I ES", level: "elementary" },
    { name: "Bagong Nayon II ES", level: "elementary" },
    { name: "Bagong Nayon II NHS", level: "secondary" },
    { name: "Bagong Nayon IV ES", level: "elementary" },
    { name: "Binayoyo Integrated School", level: "integrated" },
    { name: "Cabading ES", level: "elementary" },
    { name: "Calawis ES", level: "elementary" },
    { name: "Calawis NHS", level: "secondary" },
    { name: "Canumay ES", level: "elementary" },
    { name: "Canumay NHS", level: "secondary" },
    { name: "Cupang ES", level: "elementary" },
    { name: "Cupang ES Annex", level: "elementary" },
    { name: "Cupang NHS", level: "secondary" },
    { name: "Dalig ES", level: "elementary" },
    { name: "Dalig NHS", level: "secondary" },
    { name: "Dela Paz ES", level: "elementary" },
    { name: "Dela Paz NHS", level: "secondary" },
    { name: "Inuman ES", level: "elementary" },
    { name: "Isaias S. Tapales ES", level: "elementary" },
    { name: "Jesus S. Cabarrus ES", level: "elementary" },
    { name: "Juan Sumulong ES", level: "elementary" },
    { name: "Kaila ES", level: "elementary" },
    { name: "Kaysakat ES", level: "elementary" },
    { name: "Kaysakat NHS", level: "secondary" },
    { name: "Knights of Columbus ES", level: "elementary" },
    { name: "Libis ES", level: "elementary" },
    { name: "Lores ES", level: "elementary" },
    { name: "Mambugan I ES", level: "elementary" },
    { name: "Mambugan II ES", level: "elementary" },
    { name: "Mambugan NHS", level: "secondary" },
    { name: "Marcelino M. Santos NHS", level: "secondary" },
    { name: "Maximo L. Gatlabayan MNHS", level: "secondary" },
    { name: "Mayamot ES", level: "elementary" },
    { name: "Mayamot NHS", level: "secondary" },
    { name: "Muntindilaw ES", level: "elementary" },
    { name: "Muntindilaw NHS", level: "secondary" },
    { name: "Nazarene Ville ES", level: "elementary" },
    { name: "Old Boso-Boso ES", level: "elementary" },
    { name: "Old Boso-Boso NHS", level: "secondary" },
    { name: "Paglitaw ES", level: "elementary" },
    { name: "Pantay ES", level: "elementary" },
    { name: "Peace Village ES", level: "elementary" },
    { name: "Peñafrancia ES", level: "elementary" },
    { name: "Peñafrancia ES Annex", level: "elementary" },
    { name: "Rizza ES", level: "elementary" },
    { name: "Rizza NHS", level: "secondary" },
    { name: "San Antonio Village ES", level: "elementary" },
    { name: "San Isidro ES", level: "elementary" },
    { name: "San Isidro NHS", level: "secondary" },
    { name: "San Jose NHS", level: "secondary" },
    { name: "San Joseph ES", level: "elementary" },
    { name: "San Juan NHS", level: "secondary" },
    { name: "San Luis ES", level: "elementary" },
    { name: "San Roque NHS", level: "secondary" },
    { name: "San Ysiro ES", level: "elementary" },
    { name: "Sapinit ES", level: "elementary" },
    { name: "Sta. Cruz ES", level: "elementary" },
    { name: "Sumilang ES", level: "elementary" },
    { name: "Taguete ES", level: "elementary" },
    { name: "Tanza ES", level: "elementary" },
    { name: "Teofila Z. Rovero MES", level: "elementary" },
    { name: "Upper Kilingan ES", level: "elementary" },
  ];

  // Schools tagged as DEDP Priority.
  const DEDP_PRIORITY = new Set([
    "Antipolo NHS",
    "Bagong Nayon I ES",
    "Bagong Nayon II ES",
    "Bagong Nayon II NHS",
    "Bagong Nayon IV ES",
    "Cupang ES",
    "Dalig NHS",
    "Dela Paz ES",
    "Jesus S. Cabarrus ES",
    "Juan Sumulong ES",
    "Kaysakat ES",
    "Lores ES",
    "Mambugan I ES",
    "Mambugan II ES",
    "Mambugan NHS",
    "Maximo L. Gatlabayan MNHS",
    "Mayamot ES",
    "Muntindilaw ES",
    "Peace Village ES",
    "Peñafrancia ES",
    "Rizza ES",
    "San Antonio Village ES",
    "San Isidro ES",
    "San Isidro NHS",
    "San Jose NHS",
    "Tanza ES",
  ]);

  const LEVEL_LABELS = {
    elementary: "ES",
    secondary: "Secondary",
    integrated: "Integrated",
    sped: "SPED",
  };

  /** @type {Record<string, "provided"|"unprovided">} */
  let state = {};

  /** @type {{ level: string, dedpOnly: boolean }} */
  let filters = { level: "all", dedpOnly: false };

  const els = {};

  function cacheEls() {
    els.root = document.getElementById("irc2a-tab");
    els.lists = {
      unprovided: document.getElementById("unprovided-list"),
      provided: document.getElementById("provided-list"),
    };
    els.empties = {
      unprovided: document.getElementById("unprovided-empty"),
      provided: document.getElementById("provided-empty"),
    };
    els.counts = {
      unprovided: document.getElementById("unprovided-count"),
      provided: document.getElementById("provided-count"),
    };
    els.searches = {
      unprovided: document.getElementById("unprovided-search"),
      provided: document.getElementById("provided-search"),
    };
    els.levelFilterGroup = document.getElementById("irc2a-level-filters");
    els.dedpToggle = document.getElementById("dedp-filter-toggle");

    els.stats = {
      dedpElementary: document.getElementById("stat-dedp-elementary"),
      dedpSecondary: document.getElementById("stat-dedp-secondary"),
      dedpTotal: document.getElementById("stat-dedp-total"),
      dedpPct: document.getElementById("stat-dedp-pct"),
      nonDedpTotal: document.getElementById("stat-nondedp-total"),
      nonDedpPct: document.getElementById("stat-nondedp-pct"),
    };
    els.priorityChart = document.getElementById("irc2a-priority-chart");
  }

  function initState() {
    // Everyone starts as "unprovided" every time the page loads.
    state = {};
    SCHOOLS.forEach((s) => {
      state[s.name] = "unprovided";
    });
  }

  function matchesFilters(school) {
    if (filters.level !== "all" && school.level !== filters.level) {
      return false;
    }
    if (filters.dedpOnly && !DEDP_PRIORITY.has(school.name)) {
      return false;
    }
    return true;
  }

  function makeItem(school, status) {
    const { name, level } = school;
    const isDedp = DEDP_PRIORITY.has(name);

    const li = document.createElement("li");
    li.className = "irc2a-item";
    li.dataset.school = name;
    li.dataset.level = level;
    li.tabIndex = 0;
    li.setAttribute("role", "button");

    const levelLabel = LEVEL_LABELS[level] || level;
    const ariaExtra = isDedp ? ", DEDP Priority" : "";
    li.setAttribute(
      "aria-label",
      status === "unprovided"
        ? `${name}, ${levelLabel}${ariaExtra}. Not yet provided with TA. Activate to mark as provided.`
        : `${name}, ${levelLabel}${ariaExtra}. Provided with TA. Activate to move back to not yet provided.`,
    );

    const nameSpan = document.createElement("span");
    nameSpan.className = "irc2a-item-name";
    nameSpan.textContent = name;
    li.appendChild(nameSpan);

    if (isDedp) {
      const dedpBadge = document.createElement("span");
      dedpBadge.className = "irc2a-badge irc2a-badge--dedp";
      dedpBadge.textContent = "DEDP";
      li.appendChild(dedpBadge);
    }

    const actionSpan = document.createElement("span");
    actionSpan.className = "irc2a-item-action";
    li.appendChild(actionSpan);

    return li;
  }

  function currentFilters() {
    return {
      unprovided: els.searches.unprovided.value,
      provided: els.searches.provided.value,
    };
  }

  function render(searchText) {
    searchText = searchText || { unprovided: "", provided: "" };

    // Bucket by status first (unaffected by level/DEDP filters — those only
    // hide/show items within a bucket, they don't move schools between them).
    const buckets = { unprovided: [], provided: [] };
    SCHOOLS.forEach((s) => buckets[state[s.name]].push(s));

    ["unprovided", "provided"].forEach((status) => {
      const list = els.lists[status];
      const query = (searchText[status] || "").trim().toLowerCase();

      const all = buckets[status]
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));

      const visible = all.filter(
        (s) =>
          matchesFilters(s) && (!query || s.name.toLowerCase().includes(query)),
      );

      list.innerHTML = "";
      const frag = document.createDocumentFragment();
      visible.forEach((s) => frag.appendChild(makeItem(s, status)));
      list.appendChild(frag);

      els.empties[status].hidden = visible.length !== 0;
      // Count badge reflects total in this column regardless of filters,
      // so users always know the true tally.
      els.counts[status].textContent = String(buckets[status].length);
    });

    updateStats(buckets.provided);
  }

  function pct(numerator, denominator) {
    if (denominator === 0) return 0;
    return Math.round((numerator / denominator) * 1000) / 10; // one decimal
  }

  function updateStats(providedSchools) {
    const dedpProvided = providedSchools.filter((s) =>
      DEDP_PRIORITY.has(s.name),
    );
    const nonDedpProvided = providedSchools.filter(
      (s) => !DEDP_PRIORITY.has(s.name),
    );

    const dedpElementaryCount = dedpProvided.filter(
      (s) => s.level === "elementary",
    ).length;
    const dedpSecondaryCount = dedpProvided.filter(
      (s) => s.level === "secondary",
    ).length;

    const dedpTotalSchools = DEDP_PRIORITY.size;
    const nonDedpTotalSchools = SCHOOLS.length - DEDP_PRIORITY.size;

    const dedpPct = pct(dedpProvided.length, dedpTotalSchools);
    const nonDedpPct = pct(nonDedpProvided.length, nonDedpTotalSchools);

    els.stats.dedpElementary.textContent = String(dedpElementaryCount);
    els.stats.dedpSecondary.textContent = String(dedpSecondaryCount);
    els.stats.dedpTotal.textContent = `${dedpProvided.length} / ${dedpTotalSchools}`;
    els.stats.dedpPct.textContent = `${dedpPct}%`;
    els.stats.nonDedpTotal.textContent = `${nonDedpProvided.length} / ${nonDedpTotalSchools}`;
    els.stats.nonDedpPct.textContent = `${nonDedpPct}%`;

    renderPriorityChart(dedpPct, nonDedpPct);
  }

  function renderPriorityChart(dedpPct, nonDedpPct) {
    if (!els.priorityChart) return;

    const bars = [
      { label: "DEDP Priority", pct: dedpPct, modifier: "dedp" },
      { label: "Non-DEDP Priority", pct: nonDedpPct, modifier: "nondedp" },
    ];

    els.priorityChart.innerHTML = "";
    const frag = document.createDocumentFragment();

    bars.forEach((b) => {
      const col = document.createElement("div");
      col.className = "irc2a-chart-col";

      const barWrap = document.createElement("div");
      barWrap.className = "irc2a-chart-barwrap";
      barWrap.title = `${b.label}: ${b.pct}%`;

      const bar = document.createElement("div");
      bar.className = `irc2a-chart-bar irc2a-chart-bar--${b.modifier}`;
      bar.style.height = Math.max(2, b.pct) + "%"; // scale is fixed 0-100%

      const valLabel = document.createElement("span");
      valLabel.className = "irc2a-chart-val";
      valLabel.textContent = `${b.pct}%`;

      barWrap.appendChild(valLabel);
      barWrap.appendChild(bar);

      const label = document.createElement("span");
      label.className = "irc2a-chart-label";
      label.textContent = b.label;

      col.appendChild(barWrap);
      col.appendChild(label);
      frag.appendChild(col);
    });

    els.priorityChart.appendChild(frag);
  }

  function toggleSchool(name) {
    state[name] = state[name] === "unprovided" ? "provided" : "unprovided";
    render(currentFilters());
  }

  // Kept short and eased (no overshoot) so the move reads as a quick,
  // subtle shrink-out / grow-back-in rather than a bounce.
  const LEAVE_ANIMATION_MS = 120;
  const ENTER_ANIMATION_MS = 150; // must match the @keyframes duration in CSS

  function animateAndToggle(itemEl, name) {
    // Guard against double-triggering while already mid-animation.
    if (itemEl.classList.contains("is-leaving")) return;
    itemEl.classList.add("is-leaving");

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;

      toggleSchool(name);

      // Play a subtle entrance ("grow back outward") animation for the item
      // that just landed in its new column — works the same whichever
      // direction it moved (unprovided → provided, or provided → unprovided).
      const newItem = els.root.querySelector(
        `.irc2a-item[data-school="${CSS.escape(name)}"]`,
      );
      if (newItem) {
        // The item reappears at its alphabetical position, which — especially
        // in the long "Not Yet Provided" list — is often scrolled out of
        // view. Bring it into view first so the entrance animation below is
        // actually visible, regardless of which column it lands in.
        newItem.scrollIntoView({ block: "nearest" });

        // is-entering triggers a real @keyframes animation (see CSS), which
        // starts reliably the instant the class is applied — no forced
        // reflow / rAF timing games needed.
        newItem.classList.add("is-entering");
        const clearEntering = () => newItem.classList.remove("is-entering");
        newItem.addEventListener("animationend", clearEntering, {
          once: true,
        });
        // Fallback in case animationend never fires (e.g. reduced-motion
        // users, where the animation is set to `none`).
        setTimeout(clearEntering, ENTER_ANIMATION_MS + 40);
      }
    };

    itemEl.addEventListener("transitionend", finish, { once: true });
    // Fallback in case transitionend never fires (e.g. reduced-motion users).
    setTimeout(finish, LEAVE_ANIMATION_MS + 40);
  }

  function onLevelFilterClick(e) {
    const btn = e.target.closest(".irc2a-chip");
    if (!btn) return;

    filters.level = btn.dataset.level;

    els.levelFilterGroup
      .querySelectorAll(".irc2a-chip")
      .forEach((chip) => chip.classList.toggle("is-active", chip === btn));

    render(currentFilters());
  }

  function onDedpToggleChange() {
    filters.dedpOnly = els.dedpToggle.checked;
    render(currentFilters());
  }

  function onListClick(e) {
    const item = e.target.closest(".irc2a-item");
    if (!item) return;
    animateAndToggle(item, item.dataset.school);
  }

  function onListKeydown(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest(".irc2a-item");
    if (!item) return;
    e.preventDefault();
    animateAndToggle(item, item.dataset.school);
  }

  function onSearchInput() {
    render(currentFilters());
  }

  function updatePanelHeight() {
    if (!els.root) return;
    const top = els.root.getBoundingClientRect().top + window.scrollY;
    const bottomGap = 12; // small breathing room from the very bottom of the screen
    const available = window.innerHeight - top - bottomGap;
    // Measuring the real space (instead of assuming 100vh) is what lets
    // irc2a-panel-row sit right at the visible bottom of the screen no
    // matter what's above this section (navbar, page header, etc.) in
    // base.html.
    els.root.style.minHeight = Math.max(available, 0) + "px";
  }

  let resizeRaf = null;
  function onWindowResize() {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      updatePanelHeight();
    });
  }

  function init() {
    cacheEls();
    if (!els.root) return; // not on this page

    initState();
    render();
    updatePanelHeight();

    els.lists.unprovided.addEventListener("click", onListClick);
    els.lists.provided.addEventListener("click", onListClick);
    els.lists.unprovided.addEventListener("keydown", onListKeydown);
    els.lists.provided.addEventListener("keydown", onListKeydown);

    els.searches.unprovided.addEventListener("input", onSearchInput);
    els.searches.provided.addEventListener("input", onSearchInput);

    els.levelFilterGroup.addEventListener("click", onLevelFilterClick);
    els.dedpToggle.addEventListener("change", onDedpToggleChange);

    window.addEventListener("resize", onWindowResize);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
