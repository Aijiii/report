// Shared helpers used by both the resident and admin pages.

const STATUSES = ["Submitted", "Under Review", "In Progress", "Resolved"];
const PRIORITIES = ["Normal", "Urgent"];

const STATUS_CLASS = {
  "Submitted": "s-submitted",
  "Under Review": "s-review",
  "In Progress": "s-progress",
  "Resolved": "s-resolved"
};

// Keep this list identical to the list in firestore.rules
const CONCERN_TYPES = [
  "Peace and Order",
  "Noise Complaint",
  "Garbage and Sanitation",
  "Road and Infrastructure",
  "Streetlight and Electricity",
  "Water Supply and Drainage",
  "Health and Safety",
  "Neighbor Dispute",
  "Others"
];

/** Small DOM builder. Text is always set as text (never HTML), so user input is safe. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Firestore Timestamp or millisecond number -> milliseconds (0 if unknown). */
function toMillis(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return value;
  return 0;
}

function formatDate(value) {
  const ms = toMillis(value);
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function priorityOf(r) {
  return r && r.priority === "Urgent" ? "Urgent" : "Normal";
}

function statusBadge(status) {
  return el("span", { class: `badge ${STATUS_CLASS[status] || ""}`, text: status || "Unknown" });
}

function priorityBadge(r) {
  const urgent = priorityOf(r) === "Urgent";
  return el("span", { class: `badge ${urgent ? "p-urgent" : "p-normal"}`, text: urgent ? "Urgent" : "Normal" });
}

function toast(message, kind = "info") {
  let box = document.getElementById("toasts");
  if (!box) {
    box = el("div", { id: "toasts", class: "toasts", "aria-live": "polite" });
    document.body.append(box);
  }
  const item = el("div", { class: `toast ${kind}`, text: message });
  box.append(item);
  setTimeout(() => item.remove(), 4000);
}

function truncate(text, max = 90) {
  const t = String(text || "");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
