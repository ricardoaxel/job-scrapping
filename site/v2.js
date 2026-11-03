(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };
  var STORE = "valeos.v2.";
  var DATA = null;
  var SKILLS = [];
  var CV = new Set();
  var NOW = new Date();
  var state = {
    route: "hoy",
    filters: { q: "", window: "90", family: "", seniority: "", modality: "", loc: "", language: "", salary: false, direct: true, relevant: true },
    sort: "match",
    limit: 24,
    tracker: read("tracker", {}),
    saved: read("saved", []),
    xp: read("xp", 0),
    streak: read("streak", { count: 0, last: "" }),
    badges: read("badges", []),
    theme: read("theme", "system"),
    pokemon: read("pokemon", []),
    migratedApps: read("migratedAppsV2", false),
    migratedPokemon: read("migratedPokemonV2", false),
    updatedAt: read("updatedAt", ""),
    prevVisit: read("lastVisit", ""),
    newCount: 0,
    companyQuery: "",
  };
  var modalJob = null;
  var FS_KEY = "AIzaSyANT112Y6OIzN-TUeldWFNQ9n9jniqhxXo";
  var FS_BASE = "https://firestore.googleapis.com/v1/projects/job-search-9d700/databases/(default)/documents/";
  var CLOUD_PATH = "tracked/valeos";
  var SYNC_KEYS = ["tracker", "saved", "xp", "streak", "badges", "pokemon", "theme", "migratedAppsV2", "migratedPokemonV2"];
  var suppressSync = false;
  var cloudTimer = null;
  var POKE_POOL = [
    { id: 25, name: "Pikachu" }, { id: 1, name: "Bulbasaur" }, { id: 4, name: "Charmander" },
    { id: 7, name: "Squirtle" }, { id: 133, name: "Eevee" }, { id: 39, name: "Jigglypuff" },
    { id: 52, name: "Meowth" }, { id: 54, name: "Psyduck" }, { id: 58, name: "Growlithe" },
    { id: 66, name: "Machop" }, { id: 74, name: "Geodude" }, { id: 92, name: "Gastly" },
    { id: 104, name: "Cubone" }, { id: 143, name: "Snorlax" }, { id: 147, name: "Dratini" },
    { id: 150, name: "Mewtwo" }, { id: 151, name: "Mew" }, { id: 16, name: "Pidgey" },
    { id: 18, name: "Pidgeot" }, { id: 21, name: "Spearow" }, { id: 65, name: "Alakazam" },
    { id: 99, name: "Kingler" },
  ];

  function read(key, fallback) {
    try { var v = localStorage.getItem(STORE + key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch (e) {}
    if (!suppressSync && SYNC_KEYS.indexOf(key) !== -1) scheduleCloudSync();
  }
  function setSync(kind) {
    var el = $("#sync-status");
    if (!el) return;
    el.className = "sync-status " + kind;
    el.textContent = kind === "saving" ? "↻" : kind === "saved" ? "☁️" : "⌁";
    el.title = kind === "saving" ? "Sincronizando con Firestore..." : kind === "saved" ? "Guardado en Firestore" : "Solo local (sin conexión)";
  }
  function markLocalChange() {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORE + "updatedAt", JSON.stringify(state.updatedAt)); } catch (e) {}
  }
  function cloudPayload() {
    return {
      tracker: state.tracker,
      saved: state.saved,
      xp: state.xp,
      streak: state.streak,
      badges: state.badges,
      pokemon: state.pokemon,
      theme: state.theme,
      migratedAppsV2: !!state.migratedApps,
      migratedPokemonV2: !!state.migratedPokemon,
      updatedAt: state.updatedAt || new Date().toISOString(),
    };
  }
  function cloudWrite() {
    if (!state.updatedAt) markLocalChange();
    var payload = cloudPayload();
    setSync("saving");
    return fetch(FS_BASE + CLOUD_PATH + "?key=" + FS_KEY, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          state: { stringValue: JSON.stringify(payload) },
          updatedAt: { timestampValue: payload.updatedAt },
        },
      }),
    }).then(function (r) {
      setSync(r.ok ? "saved" : "local");
      return r.ok;
    }).catch(function () {
      setSync("local");
      return false;
    });
  }
  function scheduleCloudSync() {
    if (suppressSync) return;
    markLocalChange();
    setSync("saving");
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(cloudWrite, 900);
  }
  function cloudRead() {
    return fetch(FS_BASE + CLOUD_PATH + "?key=" + FS_KEY)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.fields || !j.fields.state) return null;
        try { return JSON.parse(j.fields.state.stringValue); } catch (e) { return null; }
      })
      .catch(function () { return null; });
  }
  function adoptCloud(c) {
    suppressSync = true;
    if (c.tracker && typeof c.tracker === "object") { state.tracker = c.tracker; write("tracker", state.tracker); }
    if (Array.isArray(c.saved)) { state.saved = c.saved; write("saved", state.saved); }
    if (typeof c.xp === "number") { state.xp = c.xp; write("xp", state.xp); }
    if (c.streak && typeof c.streak === "object") { state.streak = c.streak; write("streak", state.streak); }
    if (Array.isArray(c.badges)) { state.badges = c.badges; write("badges", state.badges); }
    if (Array.isArray(c.pokemon)) { state.pokemon = c.pokemon; write("pokemon", state.pokemon); }
    if (c.theme) { state.theme = c.theme; write("theme", state.theme); applyTheme(); }
    state.migratedApps = !!c.migratedAppsV2;
    state.migratedPokemon = !!c.migratedPokemonV2;
    write("migratedAppsV2", state.migratedApps);
    write("migratedPokemonV2", state.migratedPokemon);
    state.updatedAt = c.updatedAt || new Date().toISOString();
    try { localStorage.setItem(STORE + "updatedAt", JSON.stringify(state.updatedAt)); } catch (e) {}
    suppressSync = false;
    setSync("saved");
  }
  function load() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "data/v2/jobs.json", false);
      xhr.send(null);
      if (xhr.status === 200) return JSON.parse(xhr.responseText);
    } catch (e) {}
    return null;
  }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) { return Number(n || 0).toLocaleString("es-MX"); }
  function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; }
  function strip(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function daysAgo(iso) {
    if (!iso) return 9999;
    return (NOW - new Date(iso)) / 86400000;
  }
  function dateLabel(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    var diff = (NOW - d) / 86400000;
    if (diff <= 1) return "hoy";
    if (diff <= 2) return "ayer";
    if (diff < 7) return "hace " + Math.floor(diff) + " días";
    if (diff < 30) return "hace " + Math.floor(diff / 7) + " sem";
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  }
  function daysLabel(j) {
    var d = daysAgo(j.sd);
    if (d <= 1) return "Nueva";
    if (d <= 7) return "Esta semana";
    if (d <= 30) return "Este mes";
    return "Más antigua";
  }
  function money(v) {
    if (v == null) return "";
    return "$" + fmt(Math.round(v)) + " MXN";
  }
  function toast(msg, kind) {
    var el = $("#toast");
    el.textContent = msg;
    el.className = "toast show" + (kind ? " " + kind : "");
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.className = "toast"; }, 2400);
  }

  /* ── Theme ── */
  function applyTheme() {
    var theme = state.theme;
    var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
    document.documentElement.setAttribute("data-theme", resolved);
  }
  function cycleTheme() {
    var resolved = document.documentElement.getAttribute("data-theme");
    state.theme = resolved === "dark" ? "light" : "dark";
    write("theme", state.theme);
    applyTheme();
    toast("Tema: " + (state.theme === "light" ? "claro" : "oscuro"));
    if (state.route === "ajustes") renderAjustes();
  }

  /* ── Gamification ── */
  function levelInfo() {
    var xp = state.xp || 0;
    var level = Math.floor(Math.sqrt(xp / 40)) + 1;
    var base = Math.pow(level - 1, 2) * 40;
    var next = Math.pow(level, 2) * 40;
    var p = Math.min(100, Math.round(((xp - base) / (next - base)) * 100));
    return { level: level, pct: p, xp: xp, next: next };
  }
  function addXp(n, reason) {
    state.xp += n;
    write("xp", state.xp);
    var info = levelInfo();
    $("#level-pill").textContent = "Lv " + info.level;
    toast("+" + n + " XP · " + reason);
    if (state.route === "hoy") renderHoy();
  }
  function touchStreak() {
    var today = new Date().toISOString().slice(0, 10);
    var s = state.streak || { count: 0, last: "" };
    if (s.last === today) return;
    var y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    s.count = s.last === y ? (s.count || 0) + 1 : 1;
    s.last = today;
    state.streak = s;
    write("streak", s);
    if (s.count >= 3) award("streak3", "Racha de 3 días");
  }
  function award(id, label) {
    if (state.badges.indexOf(id) !== -1) return;
    state.badges.push(id);
    write("badges", state.badges);
    toast("🏅 " + label);
  }
  function addBadgeSilent(id) {
    if (state.badges.indexOf(id) === -1) {
      state.badges.push(id);
      write("badges", state.badges);
    }
  }
  function badgeList() {
    return [
      { id: "first_save", label: "Primer guardado", icon: "🔖" },
      { id: "first_apply", label: "Primera aplicación", icon: "🚀" },
      { id: "save10", label: "10 guardadas", icon: "📚" },
      { id: "apply5", label: "5 aplicadas", icon: "🔥" },
      { id: "streak3", label: "Racha 3 días", icon: "⚡" },
      { id: "explorer", label: "Exploradora", icon: "🧭" },
    ];
  }

  /* ── Derived data ── */
  function familyOf(j) { return j.fam || "Otros"; }
  function skillNames(j) { return (j.sk || []).map(function (i) { return SKILLS[i] ? SKILLS[i].n : null; }).filter(Boolean); }
  function matchSkills(j) {
    return (j.sk || []).map(function (i) {
      var s = SKILLS[i];
      return s && s.t !== "soft" && s.t !== "languages" ? s.n : null;
    }).filter(Boolean);
  }
  function ageBin(j) {
    var d = daysAgo(j.sd);
    if (d <= 7) return "7";
    if (d <= 30) return "30";
    if (d <= 90) return "90";
    return "all";
  }
  function baseJobs() {
    return DATA.jobs.filter(function (j) {
      if (state.filters.relevant && (j.off || (j.rel < 50 && state.filters.family !== j.fam))) return false;
      if (state.filters.direct && j.agency) return false;
      if (state.filters.window !== "all" && ageBin(j) === "all") return false;
      if (state.filters.window !== "all") {
        var max = Number(state.filters.window);
        if (daysAgo(j.sd) > max) return false;
      }
      return true;
    });
  }
  function jobSkillsMatch(j) {
    var names = matchSkills(j);
    var hit = names.filter(function (s) { return CV.has(s); });
    return { hit: hit, total: names.length, names: names };
  }
  function matchScore(j) {
    var m = jobSkillsMatch(j);
    var skillPart = m.total ? Math.min(1, m.hit.length / Math.max(6, Math.min(12, m.total))) : 0.25;
    var order = { Intern: 0, Junior: 1, Mid: 2, Senior: 3, Manager: 4, Director: 5 };
    var target = 2;
    var senPart = Math.max(0, 1 - Math.abs((order[j.sen] == null ? 2 : order[j.sen]) - target) / 5);
    var langPart = j.lang === "en" ? 0.82 : 1;
    var extraPart = j.sal != null ? 1 : 0.72;
    var score = Math.round(100 * (0.65 * skillPart + 0.15 * senPart + 0.08 * langPart + 0.12 * extraPart));
    return { score: Math.max(0, Math.min(99, score)), skillPart: Math.round(skillPart * 100), senPart: Math.round(senPart * 100), langPart: Math.round(langPart * 100), extraPart: Math.round(extraPart * 100), hit: m.hit, total: m.total };
  }
  function applyFilters(list) {
    var f = state.filters;
    var q = strip(f.q);
    return list.filter(function (j) {
      if (f.family && familyOf(j) !== f.family) return false;
      if (f.seniority && j.sen !== f.seniority) return false;
      if (f.modality && j.mod !== f.modality) return false;
      if (f.loc && j.loc !== f.loc) return false;
      if (f.language && j.lang !== f.language) return false;
      if (f.salary && j.sal == null) return false;
      if (q) {
        var text = strip([j.t, j.c, j.l, j.fam, j.desc].concat(skillNames(j)).join(" "));
        if (text.indexOf(q) === -1) return false;
      }
      return true;
    });
  }
  function sortJobs(list) {
    var arr = list.slice();
    if (state.sort === "recent") arr.sort(function (a, b) { return String(b.sd).localeCompare(String(a.sd)); });
    else if (state.sort === "salary") arr.sort(function (a, b) { return (b.sal || 0) - (a.sal || 0) || String(b.sd).localeCompare(String(a.sd)); });
    else arr.sort(function (a, b) { return matchScore(b).score - matchScore(a).score || String(b.sd).localeCompare(String(a.sd)); });
    return arr;
  }
  function activeWindowJobs() { return baseJobs(); }
  function marketJobsRaw() {
    return DATA.jobs.filter(function (j) {
      if (state.filters.relevant && (j.off || (j.rel < 50 && state.filters.family !== j.fam))) return false;
      if (state.filters.window !== "all" && daysAgo(j.sd) > Number(state.filters.window)) return false;
      return true;
    });
  }

  function aggregateFamily(list) {
    var map = {};
    list.forEach(function (j) {
      var k = familyOf(j);
      if (!map[k]) map[k] = { name: k, count: 0, remote: 0, salary: 0, jobs: [] };
      map[k].count++;
      if (j.mod === "remote") map[k].remote++;
      if (j.sal != null) map[k].salary++;
      map[k].jobs.push(j);
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.count - a.count; });
  }
  function aggregateSkills(list, specific) {
    var map = {};
    list.forEach(function (j) {
      (j.sk || []).forEach(function (i) {
        var sk = SKILLS[i];
        if (!sk) return;
        if (specific === "hard" && (sk.t === "soft" || sk.t === "languages" || sk.t === "experience")) return;
        if (specific === true && (sk.t === "soft" || sk.t === "languages")) return;
        map[sk.n] = (map[sk.n] || 0) + 1;
      });
    });
    return Object.keys(map).map(function (k) { return { name: k, count: map[k], pct: pct(map[k], list.length) }; }).sort(function (a, b) { return b.count - a.count; });
  }
  function aggregateCompanies(list) {
    var map = {};
    list.forEach(function (j) {
      var k = j.c || "Sin empresa";
      if (!map[k]) map[k] = { name: k, count: 0, agency: false, remote: 0, family: {}, jobs: [] };
      map[k].count++;
      map[k].agency = map[k].agency || j.agency;
      if (j.mod === "remote") map[k].remote++;
      map[k].family[j.fam] = (map[k].family[j.fam] || 0) + 1;
      map[k].jobs.push(j);
    });
    return Object.keys(map).map(function (k) {
      var c = map[k];
      c.topFamily = Object.keys(c.family).sort(function (a, b) { return c.family[b] - c.family[a]; })[0] || "—";
      return c;
    }).sort(function (a, b) { return b.count - a.count; });
  }
  function stats(list) {
    var n = list.length;
    var remote = list.filter(function (j) { return j.mod === "remote"; }).length;
    var en = list.filter(function (j) { return j.lang === "en"; }).length;
    var sal = list.filter(function (j) { return j.sal != null; });
    var salValues = sal.map(function (j) { return j.sal; }).sort(function (a, b) { return a - b; });
    var median = salValues.length ? salValues[Math.floor(salValues.length / 2)] : null;
    return { n: n, remote: pct(remote, n), en: pct(en, n), salary: pct(sal.length, n), median: median };
  }
  function newSinceVisit(list) {
    if (!state.prevVisit) return list.filter(function (j) { return daysAgo(j.sd) <= 7; });
    return list.filter(function (j) { return j.sd > state.prevVisit; });
  }

  /* ── Router ── */
  var ROUTES = ["hoy", "vacantes", "mercado", "empresas", "aplicaciones", "cv", "recursos", "ajustes"];
  function go(route) {
    if (ROUTES.indexOf(route) === -1) route = "hoy";
    state.route = route;
    $$(".view").forEach(function (v) { v.classList.remove("active"); });
    var el = $("#view-" + route);
    if (el) el.classList.add("active");
    $$("[data-route]").forEach(function (a) { a.classList.toggle("active", a.dataset.route === route); });
    var fn = { hoy: renderHoy, vacantes: renderVacantes, mercado: renderMercado, empresas: renderEmpresas, aplicaciones: renderAplicaciones, cv: renderCV, recursos: renderRecursos, ajustes: renderAjustes }[route];
    if (fn) fn();
    if (route === "vacantes") award("explorer", "Exploradora");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function routeFromHash() {
    var h = (location.hash || "#/hoy").replace(/^#\/?/, "");
    go(h || "hoy");
  }

  /* ── Render helpers ── */
  function pageHead(eyebrow, title, desc, actions) {
    return '<div class="page-head"><div><div class="eyebrow">' + esc(eyebrow) + "</div><h1>" + esc(title) + "</h1>" +
      (desc ? '<p>' + esc(desc) + "</p>" : "") + "</div>" + (actions ? '<div class="toolbar">' + actions + "</div>" : "") + "</div>";
  }
  function statCard(label, value, sub) {
    return '<div class="card"><div class="k-label">' + esc(label) + '</div><div class="k-value">' + esc(value) + "</div>" +
      (sub ? '<div class="k-sub">' + esc(sub) + "</div>" : "") + "</div>";
  }
  function barRows(items, max, formatter) {
    if (!items.length) return '<div class="empty">Sin datos para este corte.</div>';
    return items.map(function (it) {
      var w = Math.max(2, Math.round((it.count / (max || items[0].count || 1)) * 100));
      return '<div class="bar-row"><span>' + esc(it.name) + '</span><span class="bar-track"><i style="width:' + w + '%"></i></span><span class="val">' + (formatter ? formatter(it) : fmt(it.count)) + "</span></div>";
    }).join("");
  }
  function jobCard(j) {
    var m = matchScore(j);
    var saved = isTracked(j, "saved");
    var applied = isTracked(j, "applied");
    var disliked = isTracked(j, "disliked");
    var tags = [];
    if (j.sal != null) tags.push('<span class="job-tag salary">' + esc(money(j.sal)) + "</span>");
    if (j.ea) tags.push('<span class="job-tag ea">Easy Apply</span>');
    if (j.agency) tags.push('<span class="job-tag agency">Agencia</span>');
    if (j.lang === "en") tags.push('<span class="job-tag">EN</span>');
    var skills = skillNames(j).slice(0, 4).map(function (s) { return '<span class="job-tag">' + esc(s) + "</span>"; }).join("");
    if (skillNames(j).length > 4) tags.push('<span class="job-tag">+' + (skillNames(j).length - 4) + "</span>");
    var matchClass = m.score >= 70 ? "" : m.score >= 40 ? "mid" : "low";
    var matchColor = m.score >= 70 ? "var(--accent)" : m.score >= 40 ? "var(--accent-2)" : "var(--muted)";
    return '<article class="job-card" data-job="' + esc(j.id) + '" tabindex="0" role="button" aria-label="' + esc(j.t) + ' en ' + esc(j.c) + '">' +
      (daysAgo(j.sd) <= 3 ? '<span class="new-badge">nueva</span>' : "") +
      '<div class="job-top"><div><div class="job-title">' + esc(j.t) + '</div><div class="job-company">' + esc(j.c) + '</div></div>' +
      '<div class="match ' + matchClass + '" style="background:conic-gradient(' + matchColor + ' ' + m.score + '%, var(--bg-2) ' + m.score + '%);" title="Match ' + m.score + '%"><span>' + m.score + '%</span></div></div>' +
      '<div class="job-meta">' + esc(j.l || "México") + " <i>·</i> " + esc(modalityLabel(j.mod)) + " <i>·</i> " + esc(dateLabel(j.sd)) + "</div>" +
      '<div class="job-tags">' + tags.join("") + '</div>' +
      '<div class="job-tags">' + skills + "</div>" +
      '<div class="job-bottom"><span class="small muted">' + esc(j.fam) + " · " + esc(j.sen) + "</span>" +
      '<div class="job-actions">' +
      '<button class="mini-btn ' + (saved ? "active" : "") + '" data-track="saved" data-id="' + esc(j.id) + '" aria-label="Guardar">🔖</button>' +
      '<button class="mini-btn ' + (applied ? "active" : "") + '" data-track="applied" data-id="' + esc(j.id) + '" aria-label="Aplicada">✓</button>' +
      '<button class="mini-btn ' + (disliked ? "active" : "") + '" data-track="disliked" data-id="' + esc(j.id) + '" aria-label="Descartar">✕</button>' +
      "</div></div></article>";
  }
  function modalityLabel(m) { return { remote: "Remote", hybrid: "Híbrido", onsite: "Presencial", other: "Otra" }[m] || "—"; }
  function locLabel(l) { return { cdmx: "CDMX", mexico_remote: "México remote", latam_remote: "LatAm remote", other_remote: "Remote", other_mx: "Otra ciudad" }[l] || "—"; }

  /* ── Dashboard ── */
  function renderHoy() {
    var list = sortJobs(applyFilters(baseJobs()));
    var active = baseJobs();
    var fresh = newSinceVisit(active);
    state.newCount = fresh.length;
    var s = stats(active);
    var level = levelInfo();
    var top = [];
    var seenFam = {};
    list.forEach(function (j) { if (!seenFam[j.fam] && top.length < 3) { top.push(j); seenFam[j.fam] = 1; } });
    var savedCount = Object.keys(state.tracker).filter(function (k) { return state.tracker[k].saved; }).length;
    var appliedCount = Object.keys(state.tracker).filter(function (k) { return state.tracker[k].applied; }).length;
    var fams = aggregateFamily(active);
    var topFam = fams[0];
    var greeting = new Date().getHours() < 12 ? "Buenos días" : new Date().getHours() < 19 ? "Buenas tardes" : "Buenas noches";
    $("#view-hoy").innerHTML =
      '<div class="hero">' +
        '<div class="hero-main"><div><div class="eyebrow" style="color:var(--yellow)">' + esc(greeting) + ", Vale</div>" +
        '<h1>Tu próximo movimiento empieza aquí.</h1>' +
        '<p class="muted" style="margin-top:10px;max-width:480px">' + (fresh.length ? "Hay <b>" + fresh.length + " vacantes nuevas</b> desde tu última visita. Tú eliges por dónde empezar." : "Todo al día. Buen momento para explorar el mercado o preparar tu siguiente CV.") + "</p></div>" +
        '<div class="hero-actions"><a class="btn primary" href="#/vacantes">Ver vacantes →</a><a class="btn" href="#/mercado" style="background:transparent;color:inherit;border-color:rgba(255,255,255,.25)">Ver mercado</a></div></div>' +
        '<div class="card level-card"><div class="level-top"><div><div class="k-label">Tu nivel</div><div class="level-big">Lv ' + level.level + "</div><div class=\"small muted\">" + fmt(state.xp) + " XP</div></div><div style=\"font-size:2.2rem\"><img class=\"poke-active\" id=\"active-poke\" alt=\"Pokémon activo\"><div class=\"tiny muted\" id=\"active-poke-name\"></div></div></div>" +
        '<div><div class="xp-bar"><i style="width:' + level.pct + '%"></i></div><div class="small muted" style="margin-top:6px">' + level.pct + "% para Lv " + (level.level + 1) + " · " + fmt(level.next - state.xp) + " XP</div></div>" +
        '<div class="streak-row"><span class="streak-pill ' + (state.streak.count >= 3 ? "hot" : "") + '">🔥 ' + (state.streak.count || 0) + " días</span><span class=\"streak-pill\">🏅 " + state.badges.length + " badges</span></div>" +
        '<div class="card-soft"><div class="k-label">Siguiente reto</div><div class="small">' + (savedCount < 5 ? "Guarda 5 vacantes (" + savedCount + "/5)" : appliedCount < 1 ? "Aplica a tu primer match" : "Haz 1 acción hoy para mantener la racha") + "</div></div></div>" +
      "</div>" +
      '<div class="bento" style="margin-bottom:14px">' +
        '<div class="span-3">' + statCard("Nuevas para ti", fmt(fresh.length), "desde tu última visita") + "</div>" +
        '<div class="span-3">' + statCard("Guardadas", fmt(savedCount), "en tu radar") + "</div>" +
        '<div class="span-3">' + statCard("Aplicadas", fmt(appliedCount), "en seguimiento") + "</div>" +
        '<div class="span-3">' + statCard("Mercado activo", fmt(active.length), "roles en tu ventana") + "</div>" +
      "</div>" +
      '<div class="bento">' +
        '<div class="span-8 card"><div class="page-head" style="margin-bottom:10px"><div><div class="eyebrow">Para ti</div><h2>Top matches</h2></div><a class="btn small" href="#/vacantes">Ver todas</a></div>' +
        (top.length ? '<div class="job-grid" style="grid-template-columns:1fr">' + top.map(jobCard).join("") + "</div>" : '<div class="empty">Ajusta tus filtros o vuelve cuando haya nuevas vacantes.</div>') + "</div>" +
        '<div class="span-4 card"><div class="k-label">Pulso del mercado</div><h2 style="margin:6px 0 12px">' + esc(topFam ? topFam.name : "—") + "</h2>" +
        '<div class="bar-row"><span>Remote</span><span class="bar-track"><i style="width:' + s.remote + '%"></i></span><span class="val">' + s.remote + "%</span></div>" +
        '<div class="bar-row"><span>Inglés</span><span class="bar-track"><i style="width:' + s.en + '%"></i></span><span class="val">' + s.en + "%</span></div>" +
        '<div class="bar-row"><span>Salario</span><span class="bar-track"><i style="width:' + s.salary + '%"></i></span><span class="val">' + s.salary + "%</span></div>" +
        '<p class="small muted" style="margin-top:12px">Mediana publicada: <b>' + (s.median ? money(s.median) : "sin datos") + "</b></p>" +
        '<div class="k-label" style="margin-top:14px">Skills top</div><div class="chips" style="margin-top:6px">' + aggregateSkills(active, "hard").slice(0, 3).map(function (x) { return '<span class="chip">' + esc(x.name) + "</span>"; }).join("") + "</div>" +
        '<div class="k-label" style="margin-top:14px">Familias top</div>' + (function () { var fs = aggregateFamily(active); return barRows(fs.slice(0, 3), fs[0] ? fs[0].count : 1); })() +
        '<a class="btn small" href="#/mercado" style="margin-top:12px">Explorar mercado</a></div>' +
      "</div>" +
      '<div class="bento" style="margin-top:14px">' +
        '<div class="span-6 card"><div class="k-label">Tus búsquedas</div><h2 style="margin:6px 0 10px">Guardadas</h2>' +
        (state.saved.length ? '<div class="list">' + state.saved.map(function (s, i) { return '<div class="list-row"><div class="list-main"><div class="list-title">' + esc(s.name) + '</div><div class="list-sub">' + esc(filterSummary(s.filters)) + '</div></div><button class="btn small" data-apply-saved="' + i + '">Abrir</button></div>'; }).join("") + "</div>" : '<p class="small muted">Guarda una búsqueda desde Vacantes para volver a ella en un clic.</p>') + "</div>" +
        '<div class="span-6 card"><div class="k-label">Constancia</div><h2 style="margin:6px 0 10px">Badges</h2><div class="chips">' +
        badgeList().map(function (b) { return '<span class="chip ' + (state.badges.indexOf(b.id) !== -1 ? "active" : "") + '" title="' + esc(b.label) + '">' + b.icon + " " + esc(b.label) + "</span>"; }).join("") + "</div>" +
        '<p class="small muted" style="margin-top:12px">Gana XP guardando, aplicando y manteniendo la racha.</p></div>' +
        '<div class="span-12 card"><div class="k-label">Pokédex</div><h2 style="margin:6px 0 10px">Tus Pokémon</h2>' + pokedexHtml(true) + "</div>" +
        '<div class="span-12 card"><div class="k-label">Explorar</div><div class="chips" style="margin-top:8px"><a class="chip" href="#/empresas">Empresas</a><a class="chip" href="#/recursos">Recursos</a><a class="chip" href="#/ajustes">Ajustes</a><a class="chip" href="insights.html">Análisis completo ↗</a></div></div>' +
      "</div>";
    bindJobs($("#view-hoy"));
    setActivePoke();
    $$("[data-apply-saved]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var saved = state.saved[Number(btn.dataset.applySaved)];
        if (!saved) return;
        state.filters = JSON.parse(JSON.stringify(saved.filters));
        state.limit = 24;
        location.hash = "#/vacantes";
      });
    });
  }
  function filterSummary(f) {
    var bits = [];
    if (f.window && f.window !== "90") bits.push(f.window === "all" ? "todo" : f.window + "d");
    if (f.family) bits.push(f.family);
    if (f.seniority) bits.push(f.seniority);
    if (f.modality) bits.push(modalityLabel(f.modality));
    if (f.q) bits.push('"' + f.q + '"');
    return bits.join(" · ") || "tu ventana por defecto";
  }

  /* ── Vacantes ── */
  function renderVacantes() {
    var list = applyFilters(baseJobs());
    var total = list.length;
    var sorted = sortJobs(list);
    var shown = sorted.slice(0, state.limit);
    var f = state.filters;
    var fams = DATA.families;
    $("#view-vacantes").innerHTML =
      pageHead("Explora", "Vacantes", "Filtra sin ruido: relevancia, empleador directo y frescura por defecto.", '<a class="btn small" href="#/hoy">← Hoy</a>') +
      '<div class="card" style="margin-bottom:14px"><div class="toolbar">' +
        '<input class="input grow" id="f-q" placeholder="Buscar rol, empresa, skill..." value="' + esc(f.q) + '" autocomplete="off">' +
        '<select class="input" id="f-family" style="width:auto"><option value="">Toda familia</option>' + fams.map(function (x) { return '<option ' + (f.family === x ? "selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select>" +
        '<select class="input" id="f-seniority" style="width:auto"><option value="">Todo nivel</option>' + DATA.seniorities.map(function (x) { return '<option ' + (f.seniority === x ? "selected" : "") + ">" + esc(x) + "</option>"; }).join("") + "</select>" +
        '<select class="input" id="f-sort" style="width:auto"><option value="match" ' + (state.sort === "match" ? "selected" : "") + '>Mejor match</option><option value="recent" ' + (state.sort === "recent" ? "selected" : "") + '>Más recientes</option><option value="salary" ' + (state.sort === "salary" ? "selected" : "") + '>Mejor salario</option></select>' +
        '<button class="btn small" id="save-search">Guardar búsqueda</button>' +
      "</div>" +
      '<div class="chips" style="margin-top:10px">' +
        ["7", "30", "90", "all"].map(function (w) { return '<button class="chip ' + (f.window === w ? "active" : "") + '" data-window="' + w + '">' + (w === "all" ? "Todo" : w + " días") + "</button>"; }).join("") +
        '<button class="chip ' + (f.modality === "remote" ? "active" : "") + '" data-mod="remote">Remote</button>' +
        '<button class="chip ' + (f.modality === "hybrid" ? "active" : "") + '" data-mod="hybrid">Híbrido</button>' +
        '<button class="chip ' + (f.modality === "onsite" ? "active" : "") + '" data-mod="onsite">Presencial</button>' +
        '<button class="chip ' + (f.loc === "cdmx" ? "active" : "") + '" data-loc="cdmx">CDMX</button>' +
        '<button class="chip ' + (f.language === "es" ? "active" : "") + '" data-lang="es">ES</button>' +
        '<button class="chip ' + (f.salary ? "active" : "") + '" data-toggle="salary">Con salario</button>' +
        '<button class="chip ' + (f.direct ? "active" : "") + '" data-toggle="direct">Solo directos</button>' +
        '<button class="chip ' + (f.relevant ? "active" : "") + '" data-toggle="relevant">Solo relevantes</button>' +
        '<button class="chip" data-clear="1">Limpiar</button>' +
      "</div></div>" +
      '<div class="toolbar" style="justify-content:space-between;margin-bottom:4px"><span class="small muted"><b>' + fmt(total) + "</b> vacantes · mostrando " + fmt(shown.length) + "</span>" +
      (state.saved.length ? '<span class="small muted">' + state.saved.length + " búsquedas guardadas</span>" : "") + "</div>" +
      (shown.length ? '<div class="job-grid">' + shown.map(jobCard).join("") + "</div>" : '<div class="empty">No hay vacantes con esos filtros. Prueba ampliar la ventana o quitar “solo directos”.</div>') +
      (shown.length < sorted.length ? '<div class="load-more"><button class="btn" id="load-more">Cargar más (' + fmt(sorted.length - shown.length) + ")</button></div>" : "");

    bindFilterControls();
    bindJobs($("#view-vacantes"));
    var more = $("#load-more");
    if (more) more.addEventListener("click", function () { state.limit += 24; renderVacantes(); });
    var save = $("#save-search");
    if (save) save.addEventListener("click", function () {
      var name = prompt("Nombre de la búsqueda", filterSummary(f) || "Mi búsqueda");
      if (!name) return;
      state.saved.push({ name: name, filters: JSON.parse(JSON.stringify(f)) });
      write("saved", state.saved);
      toast("Búsqueda guardada");
      renderVacantes();
    });
  }
  function bindFilterControls() {
    var q = $("#f-q");
    if (q) q.addEventListener("input", function (e) {
      state.filters.q = e.target.value; state.limit = 24; renderVacantes();
      var again = $("#f-q"); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    });
    var fam = $("#f-family");
    if (fam) fam.addEventListener("change", function (e) { state.filters.family = e.target.value; state.limit = 24; renderVacantes(); });
    var sen = $("#f-seniority");
    if (sen) sen.addEventListener("change", function (e) { state.filters.seniority = e.target.value; state.limit = 24; renderVacantes(); });
    var sort = $("#f-sort");
    if (sort) sort.addEventListener("change", function (e) { state.sort = e.target.value; renderVacantes(); });
    $$("[data-window]").forEach(function (b) { b.addEventListener("click", function () { state.filters.window = b.dataset.window; state.limit = 24; renderVacantes(); }); });
    $$("[data-mod]").forEach(function (b) { b.addEventListener("click", function () { state.filters.modality = state.filters.modality === b.dataset.mod ? "" : b.dataset.mod; renderVacantes(); }); });
    $$("[data-loc]").forEach(function (b) { b.addEventListener("click", function () { state.filters.loc = state.filters.loc === b.dataset.loc ? "" : b.dataset.loc; renderVacantes(); }); });
    $$("[data-lang]").forEach(function (b) { b.addEventListener("click", function () { state.filters.language = state.filters.language === b.dataset.lang ? "" : b.dataset.lang; renderVacantes(); }); });
    $$("[data-toggle]").forEach(function (b) { b.addEventListener("click", function () { var k = b.dataset.toggle; state.filters[k] = !state.filters[k]; renderVacantes(); }); });
    var clear = $("[data-clear]");
    if (clear) clear.addEventListener("click", function () {
      state.filters = { q: "", window: "90", family: "", seniority: "", modality: "", loc: "", language: "", salary: false, direct: true, relevant: true };
      state.limit = 24; renderVacantes();
    });
  }
  function bindJobs(root) {
    $$(".job-card", root).forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest("[data-track]")) return;
        openJob(card.dataset.job);
      });
      card.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openJob(card.dataset.job); } });
    });
    $$("[data-track]", root).forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        track(btn.dataset.id, btn.dataset.track);
        if (state.route === "vacantes") renderVacantes(); else if (state.route === "hoy") renderHoy();
      });
    });
  }
  function isTracked(j, key) { return !!(state.tracker[j.id] && state.tracker[j.id][key]); }
  function track(id, key) {
    var t = state.tracker[id] || {};
    t[key] = !t[key];
    if (t[key] && key === "saved") award("first_save", "Primer guardado");
    if (t[key] && key === "applied") { award("first_apply", "Primera aplicación"); t.stage = t.stage || "Aplicada"; }
    t.updatedAt = new Date().toISOString();
    state.tracker[id] = t;
    write("tracker", state.tracker);
    touchStreak();
    if (t[key]) {
      addXp(key === "saved" ? 5 : key === "applied" ? 20 : 2, key === "saved" ? "Guardaste una vacante" : key === "applied" ? "Aplicaste" : "Descartaste");
    }
    var saved = Object.keys(state.tracker).filter(function (k) { return state.tracker[k].saved; }).length;
    var applied = Object.keys(state.tracker).filter(function (k) { return state.tracker[k].applied; }).length;
    if (saved >= 10) award("save10", "10 guardadas");
    if (applied >= 5) award("apply5", "5 aplicadas");
    ensurePokemonUnlocks();
  }

  /* ── Job modal ── */
  function openJob(id) {
    var j = DATA.jobs.filter(function (x) { return x.id === id; })[0];
    if (!j) return;
    modalJob = j;
    var m = matchScore(j);
    var t = state.tracker[id] || {};
    var skills = skillNames(j);
    $("#job-modal-body").innerHTML =
      '<div class="modal-head"><div><div class="eyebrow">' + esc(j.fam) + " · " + esc(j.sen) + '</div><h2 class="modal-title" id="job-modal-title">' + esc(j.t) + "</h2>" +
      '<div class="modal-meta">' + esc(j.c) + " · " + esc(j.l) + " · " + esc(modalityLabel(j.mod)) + " · " + esc(dateLabel(j.sd)) + "</div></div>" +
      '<div class="match ' + (m.score >= 70 ? "" : m.score >= 40 ? "mid" : "low") + '" style="background:conic-gradient(var(--accent) ' + m.score + '%, var(--bg-2) ' + m.score + '%)"><span>' + m.score + "%</span></div></div>" +
      '<div class="job-tags" style="margin-bottom:12px">' +
        (j.sal != null ? '<span class="job-tag salary">' + esc(money(j.sal)) + "</span>" : '<span class="job-tag">Salario no publicado</span>') +
        (j.ea ? '<span class="job-tag ea">Easy Apply</span>' : "") +
        '<span class="job-tag">' + esc(j.lang === "en" ? "Inglés" : "Español") + "</span>" +
        (j.agency ? '<span class="job-tag agency">Agencia / intermediario</span>' : '<span class="job-tag">Empleador directo</span>') +
      "</div>" +
      '<div class="card-soft"><div class="k-label">Por qué este match</div><div class="match-breakdown" style="margin-top:8px">' +
        '<div class="match-item"><span>Skills que ya tienes</span><span>' + m.hit.length + "/" + m.total + "</span></div>" +
        '<div class="match-item"><span>Afinidad de nivel</span><span>' + m.senPart + "%</span></div>" +
        '<div class="match-item"><span>Idioma</span><span>' + m.langPart + "%</span></div>" +
        '<div class="match-item"><span>Señales extra</span><span>' + m.extraPart + "%</span></div>" +
      "</div>" + (m.hit.length ? '<p class="small muted" style="margin-top:8px">Coincides en: ' + m.hit.slice(0, 8).map(esc).join(", ") + "</p>" : "") + "</div>" +
      '<div class="modal-section"><h4>Descripción</h4><p class="desc">' + esc(j.desc || "Sin descripción disponible.") + '</p><a class="btn small" href="' + esc(j.u) + '" target="_blank" rel="noopener" style="margin-top:10px">Ver completa en LinkedIn ↗</a></div>' +
      '<div class="modal-section"><h4>Skills detectadas</h4><div class="chips">' + skills.map(function (s) { return '<span class="chip ' + (CV.has(s) ? "active" : "") + '">' + esc(s) + "</span>"; }).join("") + "</div></div>" +
      (t.applied ? '<div class="modal-section"><h4>Etapa del proceso</h4><select class="input" id="job-stage">' + ["Aplicada", "Screening", "Entrevista", "Oferta", "Rechazada"].map(function (s) { return '<option ' + (t.stage === s ? "selected" : "") + ">" + s + "</option>"; }).join("") + "</select></div>" : "") +
      '<div class="modal-section"><h4>Notas</h4><textarea class="input" id="job-note" rows="3" placeholder="Contacto, entrevista, por qué te interesa...">' + esc(t.note || "") + "</textarea></div>" +
      '<div class="modal-actions">' +
        '<button class="btn ' + (t.saved ? "primary" : "") + '" data-modal-track="saved">🔖 ' + (t.saved ? "Guardada" : "Guardar") + "</button>" +
        '<button class="btn ' + (t.applied ? "primary" : "") + '" data-modal-track="applied">✓ ' + (t.applied ? "Aplicada" : "Marcar aplicada") + "</button>" +
        '<button class="btn" data-modal-track="disliked">✕ Descartar</button>' +
        '<a class="btn dark-btn" href="' + esc(j.u) + '" target="_blank" rel="noopener">Ir a LinkedIn ↗</a>' +
      "</div>";
    $("#job-modal").classList.remove("hidden");
    $$("[data-modal-track]", $("#job-modal-body")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        track(modalJob.id, btn.dataset.modalTrack);
        openJob(modalJob.id);
      });
    });
    var stage = $("#job-stage");
    if (stage) stage.addEventListener("change", function (e) {
      state.tracker[modalJob.id].stage = e.target.value;
      write("tracker", state.tracker);
      addXp(10, "Actualizaste tu proceso");
    });
    var note = $("#job-note");
    if (note) note.addEventListener("change", function (e) {
      state.tracker[modalJob.id] = state.tracker[modalJob.id] || {};
      state.tracker[modalJob.id].note = e.target.value;
      write("tracker", state.tracker);
      addXp(5, "Nota guardada");
    });
    if (state.route === "vacantes") renderVacantes(); else if (state.route === "hoy") renderHoy();
  }
  function closeJob() { $("#job-modal").classList.add("hidden"); modalJob = null; }

  /* ── Mercado ── */
  function renderMercado() {
    var list = activeWindowJobs();
    var s = stats(list);
    var fams = aggregateFamily(list);
    var skills = aggregateSkills(list, "hard").slice(0, 12);
    var remoteFams = fams.slice().sort(function (a, b) { return pct(b.remote, b.count) - pct(a.remote, a.count); }).slice(0, 8);
    $("#view-mercado").innerHTML =
      pageHead("Data", "Mercado", "Lo que está pidiendo el mercado en tu ventana activa, sin agencias y sin ruido.", '<a class="btn small" href="insights.html">Análisis completo →</a>') +
      '<div class="grid g4" style="margin-bottom:14px">' +
        statCard("Roles activos", fmt(s.n), "ventana actual") +
        statCard("Remote", s.remote + "%", "de los roles") +
        statCard("Inglés", s.en + "%", "vacantes en inglés") +
        statCard("Salario publicado", s.salary + "%", s.median ? "mediana " + money(s.median) : "sin mediana") +
      "</div>" +
      '<div class="grid g2">' +
        '<div class="card"><div class="k-label">Demanda</div><h2 style="margin:6px 0 10px">Familias de rol</h2>' + barRows(fams.slice(0, 10), fams[0] ? fams[0].count : 1) + "</div>" +
        '<div class="card"><div class="k-label">Skills</div><h2 style="margin:6px 0 10px">Lo más pedido</h2>' + barRows(skills, skills[0] ? skills[0].count : 1) + "</div>" +
      "</div>" +
      '<div class="grid g2" style="margin-top:14px">' +
        '<div class="card"><div class="k-label">Modalidad</div><h2 style="margin:6px 0 10px">% remote por familia</h2>' +
        barRows(remoteFams.map(function (f) { return { name: f.name, count: pct(f.remote, f.count) }; }), 100, function (x) { return x.count + "%"; }) + "</div>" +
        '<div class="card"><div class="k-label">Compensación</div><h2 style="margin:6px 0 10px">Salario publicado</h2>' +
        '<p class="small muted">Solo mostramos cifras publicadas, no estimaciones. La mediana de tu ventana es <b>' + (s.median ? money(s.median) : "sin datos suficientes") + "</b>.</p>" +
        '<div class="table" style="margin-top:12px"><table class="table"><thead><tr><th>Referencia</th><th>Mediana</th></tr></thead><tbody>' +
        '<tr><td>Marketing general (MX)</td><td>$33,125</td></tr><tr><td>CDMX</td><td>$54,250</td></tr><tr><td>Junior</td><td>$19,500</td></tr><tr><td>Mid</td><td>$44,500</td></tr><tr><td>Senior</td><td>$82,750</td></tr></tbody></table></div>' +
        '<p class="tiny muted" style="margin-top:8px">Benchmarks externos: Talentosy, Buk, Michael Page (2026). Úsalos como referencia, no como promesa.</p></div>' +
      "</div>";
  }

  /* ── Empresas ── */
  function renderEmpresas() {
    var companies = aggregateCompanies(marketJobsRaw());
    var q = strip(state.companyQuery);
    var rows = companies.filter(function (c) { return !q || strip(c.name).indexOf(q) !== -1; }).slice(0, 60);
    $("#view-empresas").innerHTML =
      pageHead("Quién contrata", "Empresas", "Empleadores directos y agencias, separados para que el mercado no te engañe.", '<input class="input" id="company-q" placeholder="Buscar empresa..." value="' + esc(state.companyQuery) + '" style="width:220px">') +
      '<div class="list">' + rows.map(function (c) {
        return '<div class="list-row"><div class="list-main"><div class="list-title">' + esc(c.name) + (c.agency ? ' <span class="chip agency" style="font-size:.58rem">agencia</span>' : "") + '</div><div class="list-sub">' + esc(c.topFamily) + " · " + pct(c.remote, c.count) + "% remote</div></div>" +
          '<div class="list-side"><div class="list-title">' + fmt(c.count) + '</div><button class="btn small" data-company="' + esc(c.name) + '">Ver vacantes</button></div></div>';
      }).join("") + "</div>";
    var input = $("#company-q");
    if (input) input.addEventListener("input", function (e) {
      state.companyQuery = e.target.value;
      var q2 = strip(state.companyQuery);
      $$("#view-empresas .list-row").forEach(function (row) {
        row.style.display = !q2 || strip(row.innerText).indexOf(q2) !== -1 ? "" : "none";
      });
    });
    $$("[data-company]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.filters.q = b.dataset.company;
        state.filters.family = "";
        state.filters.direct = b.dataset.agency === "1" ? false : state.filters.direct;
        state.limit = 24;
        location.hash = "#/vacantes";
      });
    });
  }

  /* ── Aplicaciones ── */
  function renderAplicaciones() {
    var stages = ["Guardada", "Aplicada", "Screening", "Entrevista", "Oferta", "Rechazada"];
    var items = Object.keys(state.tracker).map(function (id) {
      var j = DATA.jobs.filter(function (x) { return x.id === id; })[0];
      if (!j) return null;
      return { job: j, t: state.tracker[id] };
    }).filter(Boolean);
    var saved = items.filter(function (x) { return x.t.saved && !x.t.applied; });
    var cols = {
      Guardada: saved,
      Aplicada: items.filter(function (x) { return x.t.applied && (x.t.stage || "Aplicada") === "Aplicada"; }),
      Screening: items.filter(function (x) { return x.t.applied && x.t.stage === "Screening"; }),
      Entrevista: items.filter(function (x) { return x.t.applied && x.t.stage === "Entrevista"; }),
      Oferta: items.filter(function (x) { return x.t.applied && x.t.stage === "Oferta"; }),
      Rechazada: items.filter(function (x) { return x.t.applied && x.t.stage === "Rechazada"; }),
    };
    $("#view-aplicaciones").innerHTML =
      pageHead("Tu proceso", "Aplicaciones", "Todo lo que estás moviendo, en un solo lugar.", '<a class="btn small" href="#/vacantes">+ Agregar vacante</a>') +
      '<div class="pipeline">' + stages.map(function (s) {
        return '<div class="pipe-col"><h4>' + s + " (" + cols[s].length + ")</h4>" +
          (cols[s].length ? cols[s].map(function (x) {
            return '<div class="pipe-item" data-job="' + esc(x.job.id) + '"><b>' + esc(x.job.t) + '</b><span class="muted">' + esc(x.job.c) + "</span></div>";
          }).join("") : '<div class="pipe-empty">—</div>') + "</div>";
      }).join("") + "</div>" +
      (items.length ? "" : '<div class="empty" style="margin-top:14px">Aún no has guardado ni aplicado a nada. Empieza por <a href="#/vacantes" style="color:var(--accent);font-weight:800">Vacantes</a>.</div>');
    $$("[data-job]").forEach(function (el) { el.addEventListener("click", function () { openJob(el.dataset.job); }); });
  }

  /* ── CV ── */
  function renderCV() {
    var list = activeWindowJobs();
    var demand = aggregateSkills(list, true).slice(0, 25);
    var have = demand.filter(function (s) { return CV.has(s.name); });
    var gaps = demand.filter(function (s) { return !CV.has(s.name); }).slice(0, 8);
    var total = demand.reduce(function (a, b) { return a + b.pct; }, 0) || 1;
    var covered = have.reduce(function (a, b) { return a + b.pct; }, 0);
    var coverage = Math.round((covered / total) * 100);
    var cvs = DATA.cvs || [];
    $("#view-cv").innerHTML =
      pageHead("CV Studio", "Tu CV vs el mercado", "Cobertura sobre las skills más pedidas en tu ventana activa.", '<a class="btn small" href="insights.html">Análisis completo →</a>') +
      '<div class="grid g3">' +
        '<div class="card" style="text-align:center"><div class="k-label">Cobertura</div><div class="level-big" style="margin:8px 0">' + coverage + '%</div><div class="xp-bar"><i style="width:' + coverage + '%"></i></div><p class="small muted" style="margin-top:10px">' + have.length + " de " + demand.length + " skills top ya están en tu CV.</p></div>" +
        '<div class="card"><div class="k-label">Prioriza aprender</div><div class="list" style="margin-top:8px">' + gaps.map(function (g) { return '<div class="list-row"><div class="list-main"><div class="list-title">' + esc(g.name) + '</div><div class="list-sub">Lo pide ' + g.pct + "% de los roles</div></div></div>"; }).join("") + "</div></div>" +
        '<div class="card"><div class="k-label">Ya tienes ventaja</div><div class="chips" style="margin-top:8px">' + have.slice(0, 12).map(function (s) { return '<span class="chip active">' + esc(s.name) + "</span>"; }).join("") + "</div></div>" +
      "</div>" +
      '<div class="card" style="margin-top:14px"><div class="k-label">Descargas</div><h2 style="margin:6px 0 10px">CVs por categoría</h2><div class="cv-grid">' +
      (function () {
        var groups = {};
        cvs.forEach(function (c) { (groups[c.category] = groups[c.category] || []).push(c); });
        var keys = Object.keys(groups);
        return keys.length ? keys.map(function (k) {
          return '<div class="cv-card"><div class="t">' + esc(k) + '</div><div class="chips">' +
            groups[k].map(function (c) {
              return '<a class="chip" href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.type + " " + c.lang) + "</a>";
            }).join("") + "</div></div>";
        }).join("") : '<p class="small muted">No se encontraron CVs generados.</p>';
      })() +
      "</div></div>";
  }

  /* ── Recursos ── */
  function renderRecursos() {
    $("#view-recursos").innerHTML =
      pageHead("Aprende", "Recursos", "Guías cortas para moverte mejor: salario, roles, entrevistas y método.", "") +
      '<div class="grid g2">' +
        '<div class="card"><div class="k-label">Salario</div><h2 style="margin:6px 0 10px">Benchmark México 2026</h2><table class="table"><thead><tr><th>Rol / nivel</th><th>Mediana mensual</th></tr></thead><tbody>' +
        '<tr><td>Community manager junior</td><td>$17,000</td></tr><tr><td>Marketing coordinator junior</td><td>$20,250</td></tr><tr><td>SEO specialist junior</td><td>$25,500</td></tr><tr><td>Marketing analyst junior</td><td>$26,125</td></tr><tr><td>Marketing specialist mid</td><td>$47,750</td></tr><tr><td>SEO/SEM mid</td><td>$50,125</td></tr><tr><td>Marketing manager senior</td><td>$81,625</td></tr><tr><td>Growth manager senior</td><td>$92,750</td></tr></tbody></table><p class="tiny muted" style="margin-top:8px">Talentosy Salary Index 2026. Referencia, no promesa.</p></div>' +
        '<div class="card"><div class="k-label">Roles</div><h2 style="margin:6px 0 10px">Qué mirar antes de aplicar</h2><div class="list">' +
        [["Performance / Paid Media", "Google Ads, Meta Ads, medición, ROAS, presupuesto."], ["CRM / Lifecycle", "HubSpot, Klaviyo, automatización, retención."], ["Analytics", "GA4, SQL, dashboards, experimentos."], ["Content / Copy", "SEO, storytelling, edición, distribución."], ["Brand / Product", "posicionamiento, lanzamientos, research."]].map(function (r) { return '<div class="list-row"><div class="list-main"><div class="list-title">' + r[0] + '</div><div class="list-sub">' + r[1] + "</div></div></div>"; }).join("") + "</div></div>" +
      "</div>" +
      '<div class="grid g2" style="margin-top:14px">' +
        '<div class="card"><div class="k-label">Entrevistas</div><h2 style="margin:6px 0 10px">Checklist</h2><div class="chips"><span class="chip">Investiga la empresa</span><span class="chip">Prepara 3 casos con números</span><span class="chip">Pregunta por el equipo</span><span class="chip">Ten tu CV a la mano</span><span class="chip">Define tu rango salarial</span></div></div>' +
        '<div class="card"><div class="k-label">Método</div><h2 style="margin:6px 0 10px">Cómo leer el sitio</h2><p class="small muted">Filtramos por defecto roles relevantes, empleadores directos y una ventana de 90 días. El match se calcula con tus skills, nivel, idioma y señales del puesto. El cap y los benchmarks viven en <a href="insights.html" style="color:var(--accent);font-weight:800">Mercado</a>.</p></div>' +
      "</div>";
  }

  /* ── Ajustes ── */
  function renderAjustes() {
    $("#view-ajustes").innerHTML =
      pageHead("Configuración", "Ajustes", "Tema, respaldo y datos. Todo vive en tu navegador.", "") +
      '<div class="grid g2">' +
        '<div class="card"><div class="k-label">Tema</div><h2 style="margin:6px 0 10px">Apariencia</h2><div class="chips">' +
        ["system", "light", "dark"].map(function (t) { return '<button class="chip ' + (state.theme === t ? "active" : "") + '" data-theme="' + t + '">' + ({ system: "Sistema", light: "Claro", dark: "Oscuro" })[t] + "</button>"; }).join("") + "</div></div>" +
        '<div class="card"><div class="k-label">Datos</div><h2 style="margin:6px 0 10px">Respaldo</h2><div class="toolbar"><button class="btn" id="sync-now">☁️ Sincronizar ahora</button><button class="btn" id="export">Exportar JSON</button><label class="btn" for="import">Importar<input type="file" id="import" accept="application/json" class="sr-only"></label><button class="btn" id="reset" style="color:var(--danger);border-color:color-mix(in srgb,var(--danger) 35%,var(--border))">Reset</button></div><p class="small muted" style="margin-top:10px">Incluye tracker, búsquedas, XP, racha y tema. Sin servidor: si borras el navegador, se borra todo.</p></div>' +
      "</div>" +
      '<div class="card" style="margin-top:14px"><div class="k-label">Info</div><h2 style="margin:6px 0 8px">Dataset</h2><p class="small muted">' + fmt(DATA.total) + " vacantes · actualizado " + esc(new Date(DATA.updatedAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })) + " · fuente LinkedIn. Los CVs son públicos en este sitio.</p></div>" +
      '<div class="card" style="margin-top:14px"><div class="k-label">Pokédex</div><h2 style="margin:6px 0 10px">Tus Pokémon</h2>' + pokedexHtml(false) + "</div>";
    $$("button[data-theme]").forEach(function (b) { b.addEventListener("click", function () { state.theme = b.dataset.theme; write("theme", state.theme); applyTheme(); renderAjustes(); }); });
    var exp = $("#export");
    if (exp) exp.addEventListener("click", function () {
      var payload = { tracker: state.tracker, saved: state.saved, xp: state.xp, streak: state.streak, badges: state.badges, theme: state.theme, pokemon: state.pokemon };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "valeos-backup.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    var imp = $("#import");
    if (imp) imp.addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          ["tracker", "saved", "xp", "streak", "badges", "theme", "pokemon"].forEach(function (k) { if (data[k] != null) { state[k] = data[k]; write(k, state[k]); } });
          applyTheme();
          markLocalChange();
          cloudWrite();
          toast("Respaldo importado");
          go("hoy");
        } catch (err) { toast("Archivo inválido"); }
      };
      reader.readAsText(file);
    });
    var syncNow = $("#sync-now");
    if (syncNow) syncNow.addEventListener("click", function () { markLocalChange(); cloudWrite(); });
    var reset = $("#reset");
    if (reset) reset.addEventListener("click", function () {
      if (!confirm("¿Borrar tracker, búsquedas, XP, Pokémon y la copia en la nube?")) return;
      ["tracker", "saved", "xp", "streak", "badges", "theme", "lastVisit", "pokemon", "updatedAt"].forEach(function (k) { localStorage.removeItem(STORE + k); });
      fetch(FS_BASE + CLOUD_PATH + "?key=" + FS_KEY, { method: "DELETE" }).catch(function () {}).then(function () { location.reload(); });
    });
  }


  /* ── Pokédex + migración del sitio anterior ── */
  function pokeInfo(id) {
    var found = POKE_POOL.filter(function (p) { return p.id === Number(id); })[0];
    return found || { id: Number(id), name: "Pokémon #" + id };
  }
  function pokeSprite(id) {
    return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/" + Number(id) + ".png";
  }
  function appliedCount() {
    return Object.keys(state.tracker).filter(function (k) { return state.tracker[k].applied; }).length;
  }
  function activePokemon() {
    var sorted = state.pokemon.slice().sort(function (a, b) { return (b.unlockedAt || 0) - (a.unlockedAt || 0); });
    return sorted[0] || { index: 25, unlockedAt: Date.now() };
  }
  function setActivePoke() {
    var el = $("#active-poke");
    if (el) el.src = pokeSprite(activePokemon().index);
    var name = $("#active-poke-name");
    if (name) name.textContent = pokeInfo(activePokemon().index).name;
  }
  function ensurePokemonUnlocks() {
    var earned = Math.floor(appliedCount() / 5);
    if (!state.pokemon.length) state.pokemon.push({ index: 25, unlockedAt: Date.now() });
    var owned = new Set(state.pokemon.map(function (p) { return Number(p.index); }));
    var changed = false;
    while (state.pokemon.length < earned) {
      var available = POKE_POOL.filter(function (p) { return !owned.has(p.id); });
      if (!available.length) break;
      var pick = available[Math.floor(Math.random() * available.length)];
      state.pokemon.push({ index: pick.id, unlockedAt: Date.now() });
      owned.add(pick.id);
      changed = true;
      revealPokemon(pick);
    }
    if (changed) write("pokemon", state.pokemon);
  }
  function pokedexHtml(compact) {
    var list = state.pokemon.slice().sort(function (a, b) { return (a.unlockedAt || 0) - (b.unlockedAt || 0); });
    var next = Math.max(0, Math.ceil(appliedCount() / 5) * 5 - appliedCount());
    return '<div class="pokedex ' + (compact ? "compact" : "") + '">' +
      list.map(function (p) {
        var info = pokeInfo(p.index);
        return '<div class="poke-slot" title="' + esc(info.name) + '"><img src="' + pokeSprite(p.index) + '" alt="' + esc(info.name) + '" loading="lazy"><span>' + esc(info.name) + "</span></div>";
      }).join("") +
      (list.length ? "" : '<div class="poke-empty">Aún sin Pokémon. Aplica para desbloquear el primero.</div>') +
      "</div>" +
      '<p class="small muted" style="margin-top:8px">' + (next ? "Próximo Pokémon en " + next + " aplicación" + (next === 1 ? "" : "es") + " más." : "¡Pokédex completa por ahora!") + "</p>";
  }
  function revealPokemon(p) {
    var el = document.createElement("div");
    el.className = "poke-reveal";
    el.innerHTML = '<div class="poke-reveal-card"><div class="k-label">¡Nuevo Pokémon!</div><img src="' + pokeSprite(p.id) + '" alt="' + esc(p.name) + '"><h3>' + esc(p.name) + '</h3><p class="small muted">Desbloqueado por tus aplicaciones</p></div>';
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add("show"); }, 20);
    setTimeout(function () { el.classList.remove("show"); setTimeout(function () { el.remove(); }, 300); }, 2600);
  }
  function fsValue(v) {
    if (!v) return null;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.booleanValue !== undefined) return v.booleanValue;
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.mapValue) {
      var obj = {};
      var fields = v.mapValue.fields || {};
      Object.keys(fields).forEach(function (k) { obj[k] = fsValue(fields[k]); });
      return obj;
    }
    if (v.arrayValue) return (v.arrayValue.values || []).map(fsValue);
    return null;
  }
  function fsDoc(path) {
    return fetch("https://firestore.googleapis.com/v1/projects/job-search-9d700/databases/(default)/documents/" + path + "?key=" + FS_KEY)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.fields) return null;
        var obj = {};
        Object.keys(j.fields).forEach(function (k) { obj[k] = fsValue(j.fields[k]); });
        return obj;
      })
      .catch(function () { return null; });
  }
  function jobIndex() {
    var byId = {}, byTc = {};
    DATA.jobs.forEach(function (j) {
      byId[j.id] = j;
      byTc[strip(j.t + j.c)] = j;
    });
    return { byId: byId, byTc: byTc };
  }
  function oldKeyToJob(key, index) {
    var m = String(key).match(/jobs\/view\/(\d+)/);
    if (m && index.byId[m[1]]) return index.byId[m[1]];
    var k = strip(key);
    if (index.byTc[k]) return index.byTc[k];
    return null;
  }
  function mergeOldEntry(id, old) {
    var stage = old.stage === "Enviada" ? "Aplicada" : old.stage;
    var entry = {
      saved: !!old.interested,
      applied: !!old.applied,
      disliked: !!old.disliked,
      stage: stage || (old.applied ? "Aplicada" : ""),
      note: old.note || old.dislikeReason || "",
      updatedAt: old.trackedAt || new Date().toISOString(),
    };
    var current = state.tracker[id];
    if (!current) { state.tracker[id] = entry; return 1; }
    var changed = 0;
    ["saved", "applied", "disliked"].forEach(function (k) {
      if (entry[k] && !current[k]) { current[k] = true; changed = 1; }
    });
    if (entry.stage && !current.stage) { current.stage = entry.stage; changed = 1; }
    if (entry.note && !current.note) { current.note = entry.note; changed = 1; }
    return changed;
  }
  async function migrateLegacyData() {
    setSync("saving");
    var cloud = await cloudRead();
    if (cloud && cloud.tracker) {
      var cloudTime = cloud.updatedAt || "";
      if (!state.updatedAt || cloudTime >= state.updatedAt) {
        adoptCloud(cloud);
        ensurePokemonUnlocks();
        setActivePoke();
        go(state.route);
        return;
      }
    }
    suppressSync = true;
    var migrated = 0;
    if (!state.migratedApps) {
      var index = jobIndex();
      var local = {};
      try { local = JSON.parse(localStorage.getItem("tracked_jobs") || "{}"); } catch (e) {}
      var remote = await fsDoc("tracked/jobs");
      var remoteData = remote && remote.data ? remote.data : {};
      var merged = Object.assign({}, local, remoteData);
      Object.keys(merged).forEach(function (key) {
        var job = oldKeyToJob(key, index);
        if (job) migrated += mergeOldEntry(job.id, merged[key]);
      });
      if (remote !== null || Object.keys(local).length) {
        write("tracker", state.tracker);
        write("migratedAppsV2", true);
        state.migratedApps = true;
      }
    }
    if (!state.migratedPokemon) {
      var oldPoke = [];
      try { oldPoke = JSON.parse(localStorage.getItem("pokemon_collection") || "[]"); } catch (e) {}
      var doc = await fsDoc("tracked/pokemon");
      var remotePoke = doc && Array.isArray(doc.collection) ? doc.collection : [];
      var byIndex = {};
      [].concat(oldPoke, remotePoke).forEach(function (p) {
        if (!p || p.index == null) return;
        byIndex[Number(p.index)] = { index: Number(p.index), unlockedAt: p.unlockedAt || Date.now() };
      });
      state.pokemon = Object.keys(byIndex).map(function (k) { return byIndex[k]; });
      if (!state.pokemon.length) state.pokemon = [{ index: 25, unlockedAt: Date.now() }];
      if (doc !== null || oldPoke.length) {
        write("pokemon", state.pokemon);
        write("migratedPokemonV2", true);
        state.migratedPokemon = true;
      }
    }
    ensurePokemonUnlocks();
    var appliedNow = appliedCount();
    var savedNow = Object.keys(state.tracker).filter(function (k) { return state.tracker[k].saved; }).length;
    if (appliedNow >= 1) addBadgeSilent("first_apply");
    if (appliedNow >= 5) addBadgeSilent("apply5");
    if (savedNow >= 10) addBadgeSilent("save10");
    if (state.pokemon.length) addBadgeSilent("explorer");
    if (!state.xp && appliedNow) {
      state.xp = appliedNow * 20 + savedNow * 5;
      write("xp", state.xp);
    }
    suppressSync = false;
    await cloudWrite();
    var lp = $("#level-pill"); if (lp) lp.textContent = "Lv " + levelInfo().level;
    if (migrated) {
      toast("Migradas " + migrated + " aplicaciones de tu sitio anterior");
      setTimeout(function () { go(state.route); }, 500);
    } else {
      setActivePoke();
      if (state.route === "hoy") renderHoy();
    }
  }

  /* ── Init ── */
  function bindGlobal() {
    $("#theme-btn").addEventListener("click", cycleTheme);
    $("#settings-btn").addEventListener("click", function () { location.hash = "#/ajustes"; });
    $$("[data-close-modal]").forEach(function (el) { el.addEventListener("click", closeJob); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeJob(); });
    window.addEventListener("hashchange", routeFromHash);
    window.addEventListener("online", function () { if (state.updatedAt) cloudWrite(); else migrateLegacyData(); });
    window.addEventListener("offline", function () { setSync("local"); });
    if (window.matchMedia) {
      try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme); } catch (e) {}
    }
  }
  function init() {
    applyTheme();
    var data = load();
    if (!data) {
      $("#app").innerHTML = '<div class="card" style="margin-top:20px"><h2>No se pudo cargar el dataset v2</h2><p class="small muted">Corre <code>python3 scripts/build_v2.py</code> y recarga.</p></div>';
      return;
    }
    DATA = data;
    SKILLS = DATA.skills || [];
    CV = new Set((DATA.cvHave || []).map(function (i) { return SKILLS[i] ? SKILLS[i].n : null; }).filter(Boolean));
    NOW = new Date(DATA.updatedAt || Date.now());
    $("#level-pill").textContent = "Lv " + levelInfo().level;
    setSync("local");
    $("#data-stamp").textContent = fmt(DATA.total) + " vacantes · actualizado " + new Date(DATA.updatedAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
    bindGlobal();
    if (!location.hash) history.replaceState(null, "", "#/hoy");
    routeFromHash();
    if (state.route === "vacantes") award("explorer", "Exploradora");
    write("lastVisit", new Date().toISOString());
    migrateLegacyData();
  }
  init();
})();
