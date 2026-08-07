/* IRC2a - Number of Schools Provided with TA - JS */

(function () {
  "use strict";

  // Constant master list — do not add/remove here at runtime.
  const SCHOOLS = [
    "Antipolo City Senior High School",
    "Antipolo City SPED Center",
    "Antipolo National Science and Technology HS",
    "Antipolo NHS",
    "Apia Integrated School",
    "Bagong Nayon I ES",
    "Bagong Nayon II ES",
    "Bagong Nayon II NHS",
    "Bagong Nayon IV ES",
    "Binayoyo Integrated School",
    "Cabading ES",
    "Calawis ES",
    "Calawis NHS",
    "Canumay ES",
    "Canumay NHS",
    "Cupang ES",
    "Cupang ES Annex",
    "Cupang NHS",
    "Dalig ES",
    "Dalig NHS",
    "Dela Paz ES",
    "Dela Paz NHS",
    "Inuman ES",
    "Isaias S. Tapales ES",
    "Jesus S. Cabarrus ES",
    "Juan Sumulong ES",
    "Kaila ES",
    "Kaysakat ES",
    "Kaysakat NHS",
    "Knights of Columbus ES",
    "Libis ES",
    "Lores ES",
    "Mambugan I ES",
    "Mambugan II ES",
    "Mambugan NHS",
    "Marcelino M. Santos NHS",
    "Maximo L. Gatlabayan MNHS",
    "Mayamot ES",
    "Mayamot NHS",
    "Muntindilaw ES",
    "Muntindilaw NHS",
    "Nazarene Ville ES",
    "Old Boso-Boso ES",
    "Old Boso-Boso NHS",
    "Paglitaw ES",
    "Pantay ES",
    "Peace Village ES",
    "Peñafrancia ES",
    "Peñafrancia ES Annex",
    "Rizza ES",
    "Rizza NHS",
    "San Antonio Village ES",
    "San Isidro ES",
    "San Isidro NHS",
    "San Jose NHS",
    "San Joseph ES",
    "San Juan NHS",
    "San Luis ES",
    "San Roque NHS",
    "San Ysiro ES",
    "Sapinit ES",
    "Sta. Cruz ES",
    "Sumilang ES",
    "Taguete ES",
    "Tanza ES",
    "Teofila Z. Rovero MES",
    "Upper Kilingan ES",
  ];

  /** @type {Record<string, "provided"|"unprovided">} */
  let state = {};

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
    els.providedTotal = document.getElementById("irc2a-provided-count");
    els.grandTotal = document.getElementById("irc2a-total-count");
  }

  function initState() {
    // Everyone starts as "unprovided" every time the page loads.
    state = {};
    SCHOOLS.forEach((name) => {
      state[name] = "unprovided";
    });
  }

  function makeItem(name, status) {
    const li = document.createElement("li");
    li.className = "irc2a-item";
    li.dataset.school = name;
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute(
      "aria-label",
      status === "unprovided"
        ? `${name}. Not yet provided with TA. Activate to mark as provided.`
        : `${name}. Provided with TA. Activate to move back to not yet provided.`,
    );

    const nameSpan = document.createElement("span");
    nameSpan.className = "irc2a-item-name";
    nameSpan.textContent = name;

    const actionSpan = document.createElement("span");
    actionSpan.className = "irc2a-item-action";

    li.appendChild(nameSpan);
    li.appendChild(actionSpan);
    return li;
  }

  function currentFilters() {
    return {
      unprovided: els.searches.unprovided.value,
      provided: els.searches.provided.value,
    };
  }

  function render(filterText) {
    filterText = filterText || { unprovided: "", provided: "" };

    const buckets = { unprovided: [], provided: [] };
    SCHOOLS.forEach((name) => buckets[state[name]].push(name));

    ["unprovided", "provided"].forEach((status) => {
      const list = els.lists[status];
      const query = (filterText[status] || "").trim().toLowerCase();
      const names = buckets[status]
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .filter((name) => !query || name.toLowerCase().includes(query));

      list.innerHTML = "";
      const frag = document.createDocumentFragment();
      names.forEach((name) => frag.appendChild(makeItem(name, status)));
      list.appendChild(frag);

      els.empties[status].hidden = names.length !== 0;
      els.counts[status].textContent = String(buckets[status].length);
    });

    els.providedTotal.textContent = String(buckets.provided.length);
    els.grandTotal.textContent = String(SCHOOLS.length);
  }

  function toggleSchool(name) {
    state[name] = state[name] === "unprovided" ? "provided" : "unprovided";
    render(currentFilters());
  }

  function onListClick(e) {
    const item = e.target.closest(".irc2a-item");
    if (!item) return;
    toggleSchool(item.dataset.school);
  }

  function onListKeydown(e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest(".irc2a-item");
    if (!item) return;
    e.preventDefault();
    toggleSchool(item.dataset.school);
  }

  function onSearchInput() {
    render(currentFilters());
  }

  function init() {
    cacheEls();
    if (!els.root) return; // not on this page

    initState();
    render();

    els.lists.unprovided.addEventListener("click", onListClick);
    els.lists.provided.addEventListener("click", onListClick);
    els.lists.unprovided.addEventListener("keydown", onListKeydown);
    els.lists.provided.addEventListener("keydown", onListKeydown);

    els.searches.unprovided.addEventListener("input", onSearchInput);
    els.searches.provided.addEventListener("input", onSearchInput);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
