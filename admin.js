// ===================== Admin dashboard =====================
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const DAY = 24 * 60 * 60 * 1000;

  let reports = [];
  let stopReports = null;
  let currentId = null;
  let currentUser = null;

  /* ---------- Setup ---------- */
  STATUSES.forEach((s) => {
    $("filter-status").append(el("option", { value: s, text: s }));
    $("dlg-status").append(el("option", { value: s, text: s }));
  });
  CONCERN_TYPES.forEach((t) => $("filter-type").append(el("option", { value: t, text: t })));

  if (Store.mode === "demo") {
    $("demo-banner").hidden = false;
    $("demo-hint").hidden = false;
    $("demo-hint-email").textContent = Store.demoAdmin.email;
    $("demo-hint-pass").textContent = Store.demoAdmin.password;
  }

  function showLogin() {
    $("dashboard-view").hidden = true;
    $("login-view").hidden = false;
  }
  function showLoginError(message) {
    $("login-error").textContent = message;
    $("login-error").hidden = false;
  }

  /* ---------- Auth ---------- */
  Store.auth.onChange((user, message) => {
    if (message) showLoginError(message);
    if (!user) {
      currentUser = null;
      stopListening();
      showLogin();
      return;
    }
    if (currentUser && currentUser.email === user.email) return;
    currentUser = user;
    showDashboard(user);
  });

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("login-error").hidden = true;
    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    if (!email || !password) {
      showLoginError("Please enter your email and password.");
      return;
    }
    const btn = $("login-btn");
    btn.disabled = true;
    btn.textContent = "Signing in...";
    try {
      await Store.auth.login(email, password);
      $("login-password").value = "";
    } catch (err) {
      showLoginError(err.message || "Invalid email or password.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Log in";
    }
  });

  $("logout-btn").addEventListener("click", () => Store.auth.logout());

  /* ---------- Dashboard ---------- */
  function showDashboard(user) {
    $("login-error").hidden = true;
    $("login-view").hidden = true;
    $("dashboard-view").hidden = false;
    $("admin-email").textContent = user.email || "admin";
    startListening();
  }

  function startListening() {
    stopListening();
    stopReports = Store.watchAll(
      (list) => {
        reports = list;
        renderAll();
      },
      (err) => {
        console.error(err);
        toast("Could not load reports. Check your Firestore rules.", "error");
      }
    );
  }

  function stopListening() {
    if (stopReports) stopReports();
    stopReports = null;
    reports = [];
    $("reports-body").replaceChildren();
  }

  function renderAll() {
    renderStats();
    renderRecent();
    renderBars();
    renderTable();
  }

  function renderStats() {
    const count = (s) => reports.filter((r) => r.status === s).length;
    $("stat-total").textContent = reports.length;
    $("stat-submitted").textContent = count("Submitted");
    $("stat-review").textContent = count("Under Review");
    $("stat-progress").textContent = count("In Progress");
    $("stat-resolved").textContent = count("Resolved");

    const urgent = reports.filter((r) => priorityOf(r) === "Urgent" && r.status !== "Resolved").length;
    $("urgent-num").textContent = urgent;
    $("urgent-card").classList.toggle("calm", urgent === 0);
    $("urgent-btn").hidden = urgent === 0;
    $("urgent-card").querySelector(".label").textContent =
      urgent === 0 ? "No urgent reports waiting. Good work!" : "Urgent and still open";
  }

  function renderRecent() {
    const list = $("recent-list");
    list.replaceChildren();
    const recent = reports.slice().sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)).slice(0, 5);
    $("recent-empty").hidden = recent.length > 0;
    recent.forEach((r) => {
      list.append(
        el(
          "li",
          {},
          el(
            "div",
            { class: "r-main" },
            el("div", { class: "r-title" }, el("span", { text: r.type }), priorityOf(r) === "Urgent" ? priorityBadge(r) : null),
            el("div", { class: "r-sub", text: `${r.location} · ${formatDate(r.createdAt)}` })
          ),
          el(
            "div",
            { class: "badges" },
            statusBadge(r.status),
            el("button", { type: "button", class: "btn small", text: "Review", onclick: () => openReview(r.id) })
          )
        )
      );
    });
  }

  function barRow(label, value, max, cls) {
    return el(
      "div",
      { class: "bar-row" },
      el("span", { class: "bar-label", text: label, title: label }),
      el("span", { class: "bar-val", text: String(value) }),
      el(
        "div",
        { class: "bar-track" },
        el("div", { class: "bar-fill" + (cls ? " " + cls : ""), style: `width:${Math.max(4, Math.round((value / max) * 100))}%` })
      )
    );
  }

  function renderBars() {
    // Hotspots: most reported locations in the last 30 days
    const since = Date.now() - 30 * DAY;
    const places = new Map();
    reports.forEach((r) => {
      if (toMillis(r.createdAt) < since) return;
      const key = String(r.location || "").trim().toLowerCase();
      if (!key) return;
      const entry = places.get(key) || { label: String(r.location).trim(), n: 0 };
      entry.n += 1;
      places.set(key, entry);
    });
    const top = [...places.values()].sort((a, b) => b.n - a.n).slice(0, 5);
    const hot = $("hotspots");
    hot.replaceChildren();
    $("hotspots-empty").hidden = top.length > 0;
    top.forEach((p) => hot.append(barRow(p.label, p.n, top[0].n, p.n >= 3 ? "hot" : "gold")));

    // By type
    const types = new Map();
    reports.forEach((r) => types.set(r.type, (types.get(r.type) || 0) + 1));
    const ordered = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const box = $("by-type");
    box.replaceChildren();
    $("by-type-empty").hidden = ordered.length > 0;
    ordered.forEach(([t, n]) => box.append(barRow(t, n, ordered[0][1])));
  }

  /* ---------- Table with filters ---------- */
  function filteredRows() {
    const term = $("search-input").value.trim().toLowerCase();
    const status = $("filter-status").value;
    const priority = $("filter-priority").value;
    const type = $("filter-type").value;
    const sort = $("sort-by").value;

    const rows = reports.filter((r) => {
      if (status && r.status !== status) return false;
      if (priority && priorityOf(r) !== priority) return false;
      if (type && r.type !== type) return false;
      if (!term) return true;
      return [r.fullName, r.type, r.location, r.description, r.contact, r.id]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });

    rows.sort((a, b) => {
      const diff = toMillis(b.createdAt) - toMillis(a.createdAt);
      if (sort === "oldest") return -diff;
      if (sort === "urgent") {
        const u = (priorityOf(b) === "Urgent") - (priorityOf(a) === "Urgent");
        return u || diff;
      }
      return diff;
    });
    return rows;
  }

  function renderTable() {
    const rows = filteredRows();
    const body = $("reports-body");
    body.replaceChildren();
    $("empty-state").hidden = rows.length > 0;
    $("result-count").textContent = reports.length ? `(${rows.length})` : "";

    rows.forEach((r) => {
      body.append(
        el(
          "tr",
          { class: priorityOf(r) === "Urgent" && r.status !== "Resolved" ? "urgent-row" : "" },
          el("td", { "data-label": "Date", text: formatDate(r.createdAt) }),
          el("td", { "data-label": "Resident", text: r.fullName }),
          el("td", { "data-label": "Type", text: r.type }),
          el("td", { "data-label": "Location", text: r.location }),
          el("td", { class: "desc", "data-label": "Description", text: truncate(r.description) }),
          el("td", { "data-label": "Priority" }, priorityBadge(r)),
          el("td", { "data-label": "Status" }, statusBadge(r.status)),
          el(
            "td",
            { class: "action" },
            el("button", { type: "button", class: "btn small primary", onclick: () => openReview(r.id), text: "Review" })
          )
        )
      );
    });
  }

  ["input", "change"].forEach((evt) => {
    $("search-input").addEventListener(evt, renderTable);
  });
  ["filter-status", "filter-priority", "filter-type", "sort-by"].forEach((id) =>
    $(id).addEventListener("change", renderTable)
  );

  $("urgent-btn").addEventListener("click", () => {
    $("filter-priority").value = "Urgent";
    $("filter-status").value = "";
    $("sort-by").value = "urgent";
    renderTable();
    $("reports-body").closest(".card").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---------- Export CSV ---------- */
  function csvCell(value) {
    let s = String(value == null ? "" : value).replace(/\r?\n/g, " ");
    // Stop spreadsheet apps from running text that starts like a formula
    if (/^[=+\-@\t]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  $("export-btn").addEventListener("click", () => {
    const rows = filteredRows();
    if (!rows.length) {
      toast("There are no reports to export.", "error");
      return;
    }
    const head = ["Reference", "Date Submitted", "Resident", "Contact", "Type", "Location", "Priority", "Status", "Description"];
    const lines = [head.map(csvCell).join(",")];
    rows.forEach((r) => {
      lines.push(
        [r.id, formatDate(r.createdAt), r.fullName, r.contact, r.type, r.location, priorityOf(r), r.status, r.description]
          .map(csvCell)
          .join(",")
      );
    });
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `barangay-reports-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported ${rows.length} report(s)`, "success");
  });

  /* ---------- Review dialog ---------- */
  const dialog = $("review-dialog");

  function detailRow(label, value) {
    return [el("div", { class: "k", text: label }), el("div", { class: "v", text: value || "—" })];
  }

  function openReview(id) {
    const r = reports.find((x) => x.id === id);
    if (!r) return;
    currentId = id;

    $("dlg-details").replaceChildren(
      ...detailRow("Reference no.", r.id),
      ...detailRow("Priority", priorityOf(r)),
      ...detailRow("Date submitted", formatDate(r.createdAt)),
      ...detailRow("Last updated", formatDate(r.updatedAt)),
      ...detailRow("Resident", r.fullName),
      ...detailRow("Contact", r.contact),
      ...detailRow("Type of concern", r.type),
      ...detailRow("Location", r.location),
      ...detailRow("Description", r.description)
    );

    const history = $("dlg-history");
    history.replaceChildren();
    const remarks = Array.isArray(r.remarks) ? r.remarks.slice().reverse() : [];
    if (!remarks.length) {
      history.append(el("p", { class: "none", text: "No remarks yet." }));
    } else {
      remarks.forEach((m) =>
        history.append(
          el(
            "div",
            { class: "remark" },
            el(
              "div",
              { class: "remark-meta" },
              statusBadge(m.status),
              el("span", { text: formatDate(m.at) }),
              el("span", { text: m.by ? `by ${m.by}` : "" })
            ),
            el("div", { class: "remark-text", text: m.text || "" })
          )
        )
      );
    }

    $("dlg-status").value = r.status;
    $("dlg-remark").value = "";
    $("dlg-error").hidden = true;
    dialog.showModal();
  }

  function closeDialog() {
    dialog.close();
    currentId = null;
  }

  $("dlg-close").addEventListener("click", closeDialog);
  $("dlg-cancel").addEventListener("click", closeDialog);
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeDialog(); // click on the dark backdrop
  });

  $("review-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorBox = $("dlg-error");
    errorBox.hidden = true;

    const r = reports.find((x) => x.id === currentId);
    if (!r) return;

    const status = $("dlg-status").value;
    const remark = $("dlg-remark").value.trim();

    if (status === r.status && !remark) {
      errorBox.textContent = "Change the status or add a remark before saving.";
      errorBox.hidden = false;
      return;
    }

    const remarkText = remark || (status !== r.status ? `Status changed to ${status}.` : "");

    const btn = $("dlg-save");
    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
      await Store.updateReport(currentId, {
        status,
        remarkText,
        by: currentUser ? currentUser.email : "admin"
      });
      toast("Report updated", "success");
      closeDialog();
    } catch (err) {
      console.error(err);
      errorBox.textContent = "Could not save the update. You may not have permission.";
      errorBox.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Update";
    }
  });
})();
