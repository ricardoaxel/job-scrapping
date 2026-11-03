(function () {
  var KEY = "valeos.v2.theme";
  function current() { return localStorage.getItem(KEY) || "system"; }
  function apply() {
    var t = current();
    var dark = t === "dark" || (t === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }
  function cycle() {
    var resolved = document.documentElement.getAttribute("data-theme");
    var next = resolved === "dark" ? "light" : "dark";
    localStorage.setItem(KEY, next);
    apply();
    window.dispatchEvent(new Event("themechange"));
  }
  apply();
  window.addEventListener("storage", function (e) { if (e.key === KEY) apply(); });
  document.addEventListener("click", function (e) {
    if (e.target.closest("#theme-btn")) cycle();
  });
  if (window.matchMedia) {
    try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply); } catch (e) {}
  }
})();
