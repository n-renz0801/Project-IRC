document.addEventListener("DOMContentLoaded", function () {
  // ---------- Home page card carousel ----------
  var track = document.getElementById("carouselTrack");
  var leftBtn = document.getElementById("carouselLeft");
  var rightBtn = document.getElementById("carouselRight");
  var CARDS_PER_PRESS = 3; // how many cards each arrow click scrolls past

  function getScrollStep() {
    var card = track.querySelector(".carousel-card");
    if (!card) return 280;
    var cardWidth = card.getBoundingClientRect().width;
    var gap = parseFloat(
      getComputedStyle(track).columnGap || getComputedStyle(track).gap || 20,
    );
    return (cardWidth + gap) * CARDS_PER_PRESS;
  }

  if (track) {
    if (leftBtn) {
      leftBtn.addEventListener("click", function () {
        track.scrollBy({ left: -getScrollStep(), behavior: "smooth" });
      });
    }

    if (rightBtn) {
      rightBtn.addEventListener("click", function () {
        track.scrollBy({ left: getScrollStep(), behavior: "smooth" });
      });
    }

    // Let vertical mouse-wheel motion scroll the carousel horizontally.
    // Snap is switched off while the wheel is actively moving and only
    // restored once scrolling settles, otherwise scroll-snap fights
    // every wheel tick and the motion looks choppy.
    var wheelSettleTimer = null;

    track.addEventListener(
      "wheel",
      function (e) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();

          track.style.scrollSnapType = "none";
          track.scrollLeft += e.deltaY;

          clearTimeout(wheelSettleTimer);
          wheelSettleTimer = setTimeout(function () {
            track.style.scrollSnapType = "";
          }, 150);
        }
      },
      { passive: false },
    );
  }

  // ---------- Report Prepared By ----------
  // Two jobs, guarded independently so this runs harmlessly on every page:
  //   1. Home page only: auto-save the Name/Position inputs (in the title
  //      row's "Welcome, ___!" greeting) to POST /api/preparer as the user
  //      types -- no Save button. Debounced on input, flushed immediately
  //      on blur so navigating away never drops the last keystrokes.
  //   2. IRC1a-IRC9 pages only: fetch GET /api/preparer and fill in the
  //      "Prepared by" name/position in base.html's report-signatory
  //      footer (see base.html, static/css/base.css).
  var preparerNameInput = document.getElementById("homePreparerName");
  var preparerPositionInput = document.getElementById("homePreparerPosition");
  var preparerSaveTimer = null;

  // Grows/shrinks an input to fit whatever's typed in it, by measuring the
  // text against a hidden same-font span. Keeps the visible box snug to a
  // long name instead of either truncating it or sitting at a fixed width
  // that's mostly empty for a short one.
  function autoSizeInput(input, minWidth, maxWidth) {
    if (!input) return;
    var sizer = document.createElement("span");
    sizer.style.position = "absolute";
    sizer.style.left = "-9999px";
    sizer.style.top = "0";
    sizer.style.visibility = "hidden";
    sizer.style.whiteSpace = "pre";
    sizer.style.font = window.getComputedStyle(input).font;
    document.body.appendChild(sizer);

    function resize() {
      sizer.textContent = input.value || input.placeholder || "";
      var width = sizer.getBoundingClientRect().width + 14; // caret + border room
      width = Math.max(minWidth, Math.min(width, maxWidth));
      input.style.width = width + "px";
    }

    input.addEventListener("input", resize);
    resize();
  }

  autoSizeInput(preparerNameInput, 150, 480);
  autoSizeInput(preparerPositionInput, 100, 380);

  function savePreparer() {
    fetch("/api/preparer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: preparerNameInput.value.trim(),
        position: preparerPositionInput.value.trim(),
      }),
    }).catch(() => {
      /* Best-effort, same convention as irc1b's manual-count autosave. */
    });
  }

  function schedulePreparerSave() {
    clearTimeout(preparerSaveTimer);
    preparerSaveTimer = setTimeout(savePreparer, 600);
  }

  function flushPreparerSave() {
    clearTimeout(preparerSaveTimer);
    savePreparer();
  }

  if (preparerNameInput && preparerPositionInput) {
    [preparerNameInput, preparerPositionInput].forEach(function (input) {
      input.addEventListener("input", schedulePreparerSave);
      input.addEventListener("blur", flushPreparerSave);
    });
  }

  var preparedByNameEl = document.getElementById("reportPreparedByName");
  var preparedByPositionEl = document.getElementById(
    "reportPreparedByPosition",
  );

  if (preparedByNameEl) {
    fetch("/api/preparer")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        preparedByNameEl.textContent = data.name || "\u00A0";
        preparedByPositionEl.textContent = data.position || "";
      })
      .catch(function () {
        preparedByNameEl.textContent = "\u00A0";
        preparedByPositionEl.textContent = "";
      });
  }

  // ---------- IRC8A: "Approving Authority" name (footer, IRC8A page only) ----------
  // Only present on the IRC8A page (see base.html's active_tab.id == 'irc8a'
  // check), so this whole block is a no-op everywhere else. Same debounce-
  // on-input / flush-on-blur convention as the Home page preparer fields
  // above, just saved to its own endpoint since this name is scoped to
  // IRC8A rather than shared across every report.
  var approvingAuthorityInput = document.getElementById(
    "irc8aApprovingAuthorityName",
  );

  if (approvingAuthorityInput) {
    var approvingAuthoritySaveTimer = null;

    function saveApprovingAuthority() {
      fetch("/api/irc8a/approving-authority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: approvingAuthorityInput.value.trim() }),
      }).catch(() => {
        /* Best-effort, same convention as the preparer autosave above. */
      });
    }

    function scheduleApprovingAuthoritySave() {
      clearTimeout(approvingAuthoritySaveTimer);
      approvingAuthoritySaveTimer = setTimeout(saveApprovingAuthority, 600);
    }

    function flushApprovingAuthoritySave() {
      clearTimeout(approvingAuthoritySaveTimer);
      saveApprovingAuthority();
    }

    approvingAuthorityInput.addEventListener(
      "input",
      scheduleApprovingAuthoritySave,
    );
    approvingAuthorityInput.addEventListener(
      "blur",
      flushApprovingAuthoritySave,
    );

    fetch("/api/irc8a/approving-authority")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        approvingAuthorityInput.value = data.name || "";
      })
      .catch(function () {
        /* leave the field blank on failure */
      });
  }
});
