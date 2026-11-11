/* Theme toggle and mobile navigation. */
(function () {
  "use strict";

  var root = document.documentElement;
  var KEY = "ferrocore-theme";
  var mql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function stored() {
    try {
      var v = window.localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch (e) { return null; }
  }

  function resolved() {
    var s = root.getAttribute("data-theme");
    if (s === "light" || s === "dark") return s;
    return mql && mql.matches ? "dark" : "light";
  }

  var toggle = document.querySelector(".theme-toggle");

  function sync() {
    var r = resolved();
    root.setAttribute("data-theme-resolved", r);
    if (toggle) {
      var next = r === "dark" ? "light" : "dark";
      toggle.setAttribute("aria-label", "Switch to " + next + " theme");
      toggle.setAttribute("title", "Switch to " + next + " theme");
    }
    document.dispatchEvent(new CustomEvent("ferrocore:themechange", { detail: { theme: r } }));
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = resolved() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { window.localStorage.setItem(KEY, next); } catch (e) { /* storage unavailable */ }
      sync();
    });
  }

  if (mql) {
    var onScheme = function () { if (!stored()) { root.removeAttribute("data-theme"); sync(); } };
    if (mql.addEventListener) mql.addEventListener("change", onScheme);
    else if (mql.addListener) mql.addListener(onScheme);
  }
  sync();

  /* Mobile navigation */
  var navBtn = document.querySelector(".nav-toggle");
  var navList = document.getElementById("nav-list");
  if (navBtn && navList) {
    var setOpen = function (open) {
      navBtn.setAttribute("aria-expanded", open ? "true" : "false");
      navList.classList.toggle("is-open", open);
    };
    navBtn.addEventListener("click", function () {
      setOpen(navBtn.getAttribute("aria-expanded") !== "true");
    });
    navList.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && navBtn.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        navBtn.focus();
      }
    });
    document.addEventListener("click", function (e) {
      if (navBtn.getAttribute("aria-expanded") === "true" &&
          !navList.contains(e.target) && !navBtn.contains(e.target)) setOpen(false);
    });
  }
})();
