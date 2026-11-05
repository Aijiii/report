// ===================== Resident dashboard =====================
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "brs_my_reports";

  /* ---------- Setup ---------- */
  CONCERN_TYPES.forEach((t) => $("type").append(el("option", { value: t, text: t })));
  if (Store.mode === "demo") $("demo-banner").hidden = false;

  $("description").addEventListener("input", () => {
    $("desc-count").textContent = String($("description").value.length);
  });

  /* ---------- Tabs ---------- */
  function showTab(name) {
    const isSubmit = name === "submit";
    $("panel-submit").hidden = !isSubmit;
    $("panel-reports").hidden = isSubmit;
    $("tab-submit").classList.toggle("active", isSubmit);
    $("tab-reports").classList.toggle("active", !isSubmit);
    $("tab-submit").setAttribute("aria-selected", String(isSubmit));
    $("tab-reports").setAttribute("aria-selected", String(!isSubmit));
  }
  $("tab-submit").addEventListener("click", () => showTab("submit"));
  $("tab-reports").addEventListener("click", () => showTab("reports"));
  showTab(window.location.hash === "#reports" ? "reports" : "submit");

  /* ---------- Local list of this resident's report IDs ---------- */
  function getIds() {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  function setIds(ids) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
  }
  function addId(id) {
    const ids = getIds().filter((x) => x !== id);
    ids.unshift(id);
    setIds(ids);
  }
  function removeId(id) {
    setIds(getIds().filter((x) => x !== id));
  }

  /* ---------- Submit a report ---------- */
  function showConfirmation(ref) {
    $("form-wrap").hidden = true;
    $("confirmation").hidden = false;
    $("conf-ref").textContent = ref;
  }

  $("report-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const errorBox = $("form-error");
    errorBox.hidden = true;

    // Bots fill the hidden field. Pretend it worked, send nothing.
    if ($("website").value) {
      form.reset();
      showConfirmation("—");
      return;
    }

    const fullName = $("fullName").value.trim();
    const contact = $("contact").value.trim();
    const type = $("type").value;
    const locationText = $("location").value.trim();
    const description = $("description").value.trim();
    const checked = form.querySelector('input[name="priority"]:checked');
    const priority = checked && PRIORITIES.includes(checked.value) ? checked.value : "Normal";

    const problem =
      fullName.length < 2 ? "Please enter your full name." :
      !CONCERN_TYPES.includes(type) ? "Please select the type of concern." :
      !locationText ? "Please enter the location of the problem." :
      description.length < 10 ? "Please describe the problem (at least 10 characters)." :
      null;

    if (problem) {
      errorBox.textContent = problem;
      errorBox.hidden = false;
      return;
    }

    const btn = $("submit-btn");
    btn.disabled = true;
    btn.textContent = "Submitting...";

    try {
      const id = await Store.createReport({
        fullName, contact, type, location: locationText, description, priority
      });
      addId(id);
      watch(id);
      form.reset();
      $("desc-count").textContent = "0";
      showConfirmation(id);
    } catch (err) {
      console.error(err);
      errorBox.textContent = "Sorry, your report could not be submitted. Please check your connection and try again.";
      errorBox.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Submit Report";
    }
  });

  $("copy-ref-btn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("conf-ref").textContent);
      toast("Reference number copied", "success");
    } catch {
      toast("Could not copy. Please copy it manually.", "error");
    }
  });
  $("view-reports-btn").addEventListener("click", () => {
    showTab("reports");
    $("new-report-btn").click();
  });
  $("new-report-btn").addEventListener("click", () => {
    $("confirmation").hidden = true;
    $("form-wrap").hidden = false;
  });

  /* ---------- Live status of my reports ---------- */
  const reports = new Map();
  const unsubs = new Map();

  function watch(id) {
    if (unsubs.has(id)) return;
    const stop = Store.watchReport(id, (r) => {
      if (!r) {
        reports.delete(id);
        removeId(id);
        const u = unsubs.get(id);
        if (u) { u(); unsubs.delete(id); }
      } else {
        reports.set(id, r);
      }
      renderReports();
    });
    unsubs.set(id, stop);
  }

  function reportCard(r) {
    const current = Math.max(0, STATUSES.indexOf(r.status));
    const tracker = el(
      "ol",
      { class: "tracker", "aria-label": "Report progress" },
      STATUSES.map((s, i) =>
        el("li", { class: i < current ? "done" : i === current ? "current" : "", text: s })
      )
    );

    const remarks = Array.isArray(r.remarks) ? r.remarks.slice().reverse() : [];
    const timeline = el(
      "div",
      { class: "timeline" },
      el("h4", { text: "Updates from the barangay" }),
      remarks.length
        ? remarks.map((m) =>
            el(
              "div",
              { class: "remark" },
              el("div", { class: "remark-meta" }, statusBadge(m.status), el("span", { text: formatDate(m.at) })),
              el("div", { class: "remark-text", text: m.text || "" })
            )
          )
        : el("p", { class: "muted", text: "No updates yet. Please check back later." })
    );

    const urgent = priorityOf(r) === "Urgent";
    return el(
      "article",
      { class: "report-card" + (urgent ? " urgent" : "") },
      el(
        "div",
        { class: "report-top" },
        el("h3", { text: r.type }),
        el("div", { class: "badges" }, urgent ? priorityBadge(r) : null, statusBadge(r.status))
      ),
      el("div", { class: "report-ref", text: `Reference: ${r.id}` }),
      el(
        "div",
        { class: "report-meta" },
        el("span", {}, "Location: ", el("strong", { text: r.location })),
        el("span", {}, "Submitted: ", el("strong", { text: formatDate(r.createdAt) })),
        el("span", {}, "Last update: ", el("strong", { text: formatDate(r.updatedAt) }))
      ),
      el("p", { class: "report-desc", text: r.description }),
      tracker,
      timeline
    );
  }

  function renderReports() {
    const ids = getIds();
    $("my-count").textContent = String(ids.length);
    $("reports-empty").hidden = ids.length > 0;

    const list = $("reports-list");
    list.replaceChildren();
    ids.filter((id) => reports.has(id)).forEach((id) => list.append(reportCard(reports.get(id))));
  }

  /* ---------- Track by reference number ---------- */
  $("track-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorBox = $("track-error");
    errorBox.hidden = true;

    const id = $("track-ref").value.trim();
    if (!/^[A-Za-z0-9]{10,40}$/.test(id)) {
      errorBox.textContent = "Please enter a valid reference number.";
      errorBox.hidden = false;
      return;
    }

    try {
      const found = await Store.getReport(id);
      if (!found) {
        errorBox.textContent = "No report was found with that reference number.";
        errorBox.hidden = false;
        return;
      }
      addId(id);
      watch(id);
      renderReports();
      $("track-ref").value = "";
      toast("Report added to your list", "success");
    } catch (err) {
      console.error(err);
      errorBox.textContent = "Could not look up that report. Please try again.";
      errorBox.hidden = false;
    }
  });

  /* ---------- Start ---------- */
  renderReports();
  getIds().forEach(watch);
})();
