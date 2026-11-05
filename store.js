// ------------------------------------------------------------
// Data layer. The pages only talk to "Store", never to a database.
//
//   Store.mode    "demo" (browser localStorage) or "firebase"
//   Store.createReport(data)            -> Promise<id>
//   Store.getReport(id)                 -> Promise<report | null>
//   Store.watchReport(id, cb)           -> unsubscribe()   cb(report | null)
//   Store.watchAll(cb, onError)         -> unsubscribe()   cb(reportsNewestFirst)
//   Store.updateReport(id, {status, remarkText, by})
//   Store.auth.onChange(cb)             -> unsubscribe()   cb(user | null, message?)
//   Store.auth.login(email, password) / Store.auth.logout()
// ------------------------------------------------------------
const Store = (function () {
  "use strict";

  /* ===================== DEMO (localStorage) ===================== */
  function demoBackend() {
    const KEY = "brs_demo_reports";
    const SESSION = "brs_demo_admin";
    const reportListeners = new Set();
    const authListeners = new Set();

    function read() {
      try {
        const v = JSON.parse(localStorage.getItem(KEY) || "[]");
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    }
    function write(list) {
      localStorage.setItem(KEY, JSON.stringify(list));
      notifyReports();
    }
    function notifyReports() { reportListeners.forEach((fn) => fn()); }
    function notifyAuth() { authListeners.forEach((fn) => fn()); }

    // Live updates between two tabs of the same browser
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) notifyReports();
    });

    function newest() {
      return read().slice().sort((a, b) => b.createdAt - a.createdAt);
    }
    function newId() {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      const bytes = new Uint8Array(20);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => chars[b % chars.length]).join("");
    }

    return {
      async createReport(data) {
        const now = Date.now();
        const id = newId();
        const list = read();
        list.push({ ...data, id, status: "Submitted", remarks: [], createdAt: now, updatedAt: now });
        write(list);
        return id;
      },
      async getReport(id) {
        return read().find((r) => r.id === id) || null;
      },
      watchReport(id, cb) {
        const fn = () => cb(read().find((r) => r.id === id) || null);
        reportListeners.add(fn);
        queueMicrotask(fn);
        return () => reportListeners.delete(fn);
      },
      watchAll(cb) {
        const fn = () => cb(newest());
        reportListeners.add(fn);
        queueMicrotask(fn);
        return () => reportListeners.delete(fn);
      },
      async updateReport(id, { status, remarkText, by }) {
        const list = read();
        const r = list.find((x) => x.id === id);
        if (!r) throw new Error("Report not found");
        const now = Date.now();
        r.status = status;
        r.updatedAt = now;
        if (remarkText) {
          r.remarks = Array.isArray(r.remarks) ? r.remarks : [];
          r.remarks.push({ text: remarkText, status, by, at: now });
        }
        write(list);
      },
      auth: {
        onChange(cb) {
          const fn = () => {
            const email = sessionStorage.getItem(SESSION);
            cb(email ? { email } : null);
          };
          authListeners.add(fn);
          queueMicrotask(fn);
          return () => authListeners.delete(fn);
        },
        async login(email, password) {
          const okEmail = String(email).trim().toLowerCase() === demoAdmin.email.toLowerCase();
          if (okEmail && password === demoAdmin.password) {
            sessionStorage.setItem(SESSION, demoAdmin.email);
            notifyAuth();
          } else {
            throw new Error("Invalid email or password.");
          }
        },
        async logout() {
          sessionStorage.removeItem(SESSION);
          notifyAuth();
        }
      }
    };
  }

  /* ========================= FIREBASE ============================ */
  function firebaseBackend() {
    let ready = null;
    // Firebase is loaded only when needed, so demo mode works offline.
    function fb() {
      if (!ready) {
        const base = "https://www.gstatic.com/firebasejs/10.12.2/";
        ready = Promise.all([
          import(base + "firebase-app.js"),
          import(base + "firebase-firestore.js"),
          import(base + "firebase-auth.js")
        ]).then(([appM, fs, au]) => {
          const app = appM.initializeApp(firebaseConfig);
          return { fs, au, db: fs.getFirestore(app), auth: au.getAuth(app) };
        });
      }
      return ready;
    }
    const shape = (snap) => ({ id: snap.id, ...snap.data({ serverTimestamps: "estimate" }) });

    return {
      async createReport(data) {
        const f = await fb();
        const ref = await f.fs.addDoc(f.fs.collection(f.db, "reports"), {
          ...data,
          status: "Submitted",
          remarks: [],
          createdAt: f.fs.serverTimestamp(),
          updatedAt: f.fs.serverTimestamp()
        });
        return ref.id;
      },
      async getReport(id) {
        const f = await fb();
        const snap = await f.fs.getDoc(f.fs.doc(f.db, "reports", id));
        return snap.exists() ? shape(snap) : null;
      },
      watchReport(id, cb) {
        let stop = () => {};
        let off = false;
        fb().then((f) => {
          if (off) return;
          stop = f.fs.onSnapshot(
            f.fs.doc(f.db, "reports", id),
            (snap) => cb(snap.exists() ? shape(snap) : null),
            (err) => console.error("Could not read report", id, err)
          );
        }).catch((e) => console.error(e));
        return () => { off = true; stop(); };
      },
      watchAll(cb, onError) {
        let stop = () => {};
        let off = false;
        fb().then((f) => {
          if (off) return;
          const q = f.fs.query(f.fs.collection(f.db, "reports"), f.fs.orderBy("createdAt", "desc"));
          stop = f.fs.onSnapshot(q, (snap) => cb(snap.docs.map(shape)), (err) => onError && onError(err));
        }).catch((e) => onError && onError(e));
        return () => { off = true; stop(); };
      },
      async updateReport(id, { status, remarkText, by }) {
        const f = await fb();
        const payload = { status, updatedAt: f.fs.serverTimestamp() };
        if (remarkText) {
          payload.remarks = f.fs.arrayUnion({ text: remarkText, status, by, at: Date.now() });
        }
        await f.fs.updateDoc(f.fs.doc(f.db, "reports", id), payload);
      },
      auth: {
        onChange(cb) {
          let stop = () => {};
          let off = false;
          fb().then((f) => {
            if (off) return;
            stop = f.au.onAuthStateChanged(f.auth, async (user) => {
              if (!user) { cb(null); return; }
              try {
                // Only users listed in the "admins" collection may enter.
                const adminDoc = await f.fs.getDoc(f.fs.doc(f.db, "admins", user.uid));
                if (!adminDoc.exists()) {
                  await f.au.signOut(f.auth);
                  cb(null, "This account is not authorized as a barangay admin.");
                  return;
                }
                cb({ email: user.email, uid: user.uid });
              } catch (err) {
                console.error(err);
                await f.au.signOut(f.auth);
                cb(null, "Could not verify admin access. Please contact the system administrator.");
              }
            });
          }).catch((e) => {
            console.error(e);
            cb(null, "Could not connect to Firebase. Check your internet connection and config.");
          });
          return () => { off = true; stop(); };
        },
        async login(email, password) {
          const f = await fb();
          try {
            await f.au.signInWithEmailAndPassword(f.auth, email, password);
          } catch (err) {
            const code = err && err.code;
            if (code === "auth/too-many-requests") throw new Error("Too many attempts. Please wait a few minutes and try again.");
            if (code === "auth/network-request-failed") throw new Error("Network error. Please check your connection.");
            throw new Error("Invalid email or password.");
          }
        },
        async logout() {
          const f = await fb();
          await f.au.signOut(f.auth);
        }
      }
    };
  }

  const mode = isConfigured ? "firebase" : "demo";
  const backend = mode === "firebase" ? firebaseBackend() : demoBackend();
  return { mode, demoAdmin, ...backend };
})();
