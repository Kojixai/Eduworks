/* Marketing page behaviour. No dependencies. Everything degrades: without this script the menu links are in the footer,
   the FAQ answers are shown, the statement is fully visible and the carousels still scroll by swipe or keyboard. */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("ip-js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Full-screen menu ---------- */
  var toggle = $("[data-menu-toggle]");
  var menu = $("#site-menu");
  if (toggle && menu) {
    var closeBtn = $("[data-menu-close]", menu);
    var open = function () {
      menu.classList.add("ip-is-open");
      toggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("ip-menu-open");
      var first = $("a", menu);
      if (first) first.focus();
    };
    var close = function (restore) {
      menu.classList.remove("ip-is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("ip-menu-open");
      if (restore) toggle.focus();
    };
    toggle.addEventListener("click", function () { menu.classList.contains("ip-is-open") ? close(true) : open(); });
    if (closeBtn) closeBtn.addEventListener("click", function () { close(true); });
    $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { close(false); }); });
    document.addEventListener("keydown", function (e) {
      if (!menu.classList.contains("ip-is-open")) return;
      if (e.key === "Escape") { close(true); return; }
      if (e.key === "Tab") { // keep focus inside the open menu
        var f = $$("a, button", menu).filter(function (n) { return n.offsetParent !== null || n === document.activeElement; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------- Carousels: the arrows scroll the track by one card ---------- */
  $$("[data-carousel]").forEach(function (c) {
    var track = $("[data-track]", c);
    var prev = $("[data-prev]", c), next = $("[data-next]", c);
    if (!track || !prev || !next) return;
    var step = function () {
      var li = $("li", track), list = li && li.parentNode;
      var cs = list ? getComputedStyle(list) : null;
      var gap = cs ? parseFloat(cs.columnGap || cs.gap) || 0 : 0;
      return li ? li.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
    };
    var sync = function () {
      var max = track.scrollWidth - track.clientWidth - 2;
      prev.setAttribute("aria-disabled", track.scrollLeft <= 2 ? "true" : "false");
      next.setAttribute("aria-disabled", track.scrollLeft >= max ? "true" : "false");
    };
    var go = function (dir) {
      if ((dir < 0 ? prev : next).getAttribute("aria-disabled") === "true") return;
      track.scrollBy({ left: dir * step(), behavior: reduce.matches ? "auto" : "smooth" });
    };
    prev.addEventListener("click", function () { go(-1); });
    next.addEventListener("click", function () { go(1); });
    track.addEventListener("scroll", function () { window.requestAnimationFrame(sync); }, { passive: true });
    window.addEventListener("resize", sync);
    sync();
  });

  /* ---------- FAQ accordion ---------- */
  $$(".ip-faq-item").forEach(function (item) {
    var btn = $(".ip-faq-question", item);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var isOpen = !item.classList.contains("ip-is-open");
      item.classList.toggle("ip-is-open", isOpen);
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  });

  /* ---------- Reveal on scroll ---------- */
  var statement = $("[data-statement]");
  var words = statement ? $$(".ip-w", statement) : [];
  var marquees = $$(".ip-ticker-title");
  var reveals = $$("[data-reveal]");

  if (reduce.matches || !("IntersectionObserver" in window)) {
    reveals.forEach(function (n) { n.classList.add("ip-is-in"); });
    words.forEach(function (w) { w.classList.add("ip-on"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("ip-is-in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (n) { io.observe(n); });

    var ticking = false;
    var update = function () {
      ticking = false;
      var vh = window.innerHeight;
      if (statement && words.length) {
        var r = statement.getBoundingClientRect();
        var p = (vh * 0.9 - r.top) / (vh * 0.6 + r.height * 0.6);
        p = Math.max(0, Math.min(1, p));
        var n = Math.round(p * words.length);
        for (var i = 0; i < words.length; i++) words[i].classList.toggle("ip-on", i < n);
      }
      marquees.forEach(function (m, idx) {
        var box = m.parentNode, r2 = box.getBoundingClientRect();
        if (r2.bottom < -50 || r2.top > vh + 50) return;
        var over = Math.max(0, m.scrollWidth - box.clientWidth);
        var q = Math.max(0, Math.min(1, (vh - r2.top) / (vh + r2.height)));
        var x = idx % 2 === 0 ? -q * over : -(1 - q) * over;
        m.style.transform = "translate3d(" + x.toFixed(1) + "px,0,0)";
      });
    };
    var request = function () { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } };
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    update();
  }
})();
