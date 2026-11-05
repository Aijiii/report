// ---------- Hotline strip + dark mode ----------
(function () {
  "use strict";
  document.getElementById("hotline-text").textContent = HOTLINE.text;
  const link = document.getElementById("hotline-link");
  link.textContent = HOTLINE.label;
  link.setAttribute("href", "tel:" + HOTLINE.tel);

  const btn = document.getElementById("theme-btn");
  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    btn.textContent = theme === "dark" ? "☀️" : "🌙";
  }
  let saved = null;
  try { saved = localStorage.getItem("brs_theme"); } catch { /* storage unavailable */ }
  apply(saved || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  btn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    apply(next);
    try { localStorage.setItem("brs_theme", next); } catch { /* storage unavailable */ }
  });
})();
