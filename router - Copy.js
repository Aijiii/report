// ---------- Switch between the Resident view and the Admin view ----------
(function () {
  "use strict";
  function route() {
    const admin = window.location.hash === "#admin";
    document.getElementById("area-resident").hidden = admin;
    document.getElementById("area-admin").hidden = !admin;
    document.getElementById("nav-resident").classList.toggle("active", !admin);
    document.getElementById("nav-admin").classList.toggle("active", admin);
    document.getElementById("brand-sub").textContent = admin ? "Barangay Official Dashboard" : "Resident Portal";
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  route();
})();
