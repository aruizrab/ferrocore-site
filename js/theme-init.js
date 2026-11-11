/* Runs before first paint: apply a stored theme choice, if any, so the page
   does not flash the wrong colours. Without a stored choice the page follows
   prefers-color-scheme. */
(function () {
  var root = document.documentElement;
  var stored = null;
  try { stored = window.localStorage.getItem("ferrocore-theme"); } catch (e) { stored = null; }
  if (stored === "light" || stored === "dark") root.setAttribute("data-theme", stored);
  var dark = stored ? stored === "dark"
    : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.setAttribute("data-theme-resolved", dark ? "dark" : "light");
})();
