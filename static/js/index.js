document.addEventListener("DOMContentLoaded", function () {
  var toggleBtn = document.getElementById("navToggle");
  var navbar = document.getElementById("navbar");

  if (toggleBtn && navbar) {
    toggleBtn.addEventListener("click", function () {
      navbar.classList.toggle("navbar--open");
    });
  }

  // ---------- Home page card carousel ----------
  var track = document.getElementById("carouselTrack");
  var leftBtn = document.getElementById("carouselLeft");
  var rightBtn = document.getElementById("carouselRight");
  var SCROLL_STEP = 280;

  if (track) {
    if (leftBtn) {
      leftBtn.addEventListener("click", function () {
        track.scrollBy({ left: -SCROLL_STEP, behavior: "smooth" });
      });
    }

    if (rightBtn) {
      rightBtn.addEventListener("click", function () {
        track.scrollBy({ left: SCROLL_STEP, behavior: "smooth" });
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
});
