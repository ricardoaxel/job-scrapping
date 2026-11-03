/* global Chart */
(function () {
  "use strict";

  var AUTH_KEY = "auth_pikachu";
  var authOverlay = document.getElementById("auth-overlay");
  var authInput = document.getElementById("auth-input");
  var authBtn = document.getElementById("auth-btn");
  var authError = document.getElementById("auth-error");

  if (localStorage.getItem(AUTH_KEY)) authOverlay.classList.add("authed");

  function tryAuth() {
    if (authInput.value === "pikachu") {
      localStorage.setItem(AUTH_KEY, "1");
      authOverlay.classList.add("authed");
    } else {
      authError.textContent = "Contraseña incorrecta";
      authInput.value = "";
      authInput.focus();
    }
  }
  authBtn.addEventListener("click", tryAuth);
  authInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") tryAuth();
  });

  var WINDOWS = [
    { value: "7", label: "7 días", days: 7 },
    { value: "30", label: "30 días", days: 30 },
    { value: "90", label: "90 días", days: 90 },
    { value: "365", label: "12 meses", days: 365 },
    { value: "all", label: "Todo", days: null },
  ];

  var TYPE_LABELS = {
    tools: "Herramientas",
    methods: "Metodologías",
    experience: "Experiencia",
    soft: "Soft skills",
    languages: "Idiomas",
  };

  var MODALITY_LABELS = { remote: "Remote", hybrid: "Híbrido", onsite: "Presencial", other: "Otra" };
  var COLORS = {
    accent: "#2563eb",
    accentSoft: "#93c5fd",
    palette: ["#2563eb", "#0ea5e9", "#14b8a6", "#f59e0b", "#8b5cf6", "#ec4899", "#ef4444", "#84cc16"],
    muted: "#9ca3af",
    grid: "#eef0f3",
  };

  var state = {
    window: "90",
    category: "",
    modality: "",
    demandType: "tools",
    compare: false,
    periodSel: new Set(["0-7", "8-30", "31-90"]),
    excludedCompanies: new Set(),
    companyPanelOpen: false,
    companySearch: "",
    companyCapEnabled: false,
    companyCap: 10,
  };

  var DATA = null;
  var JOBS = [];
  var SKILLS = [];
  var SKILL_BY_INDEX = [];
  var SKILL_INDEX_BY_NAME = {};
  var CV_HAVE = new Set();
  var NOW = new Date();
  var CHARTS = {};

  var $ = function (id) { return document.getElementById(id); };

  function fmt(n) {
    return Number(n || 0).toLocaleString("es-MX");
  }
  function pct(part, total) {
    return total ? Math.round((part / total) * 1000) / 10 : 0;
  }
  function oneDec(n) {
    return Math.round(n * 10) / 10;
  }
  function median(values) {
    var arr = values.filter(function (v) { return typeof v === "number" && !isNaN(v); }).sort(function (a, b) { return a - b; });
    if (!arr.length) return null;
    var mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  }
  function stripAccents(text) {
    return (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function jobKey(job) {
    return stripAccents(job.t || "") + "|" + stripAccents(job.c || "");
  }
  function dedupe(jobs) {
    var seen = new Map();
    jobs.forEach(function (job) {
      var key = jobKey(job);
      if (!seen.has(key)) seen.set(key, job);
    });
    return Array.from(seen.values());
  }
  function daysOld(job) {
    var iso = job.sd || job.d;
    if (!iso) return Infinity;
    return (NOW.getTime() - new Date(iso).getTime()) / 86400000;
  }
  function inWindow(job, days) {
    return days == null || daysOld(job) <= days;
  }
  function cleanLocation(loc) {
    return (loc || "").replace(/\s*\((remote|hybrid|on-site|en remoto|híbrido|presencial)\)\s*$/i, "");
  }
  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function applyCompanyFilter(jobs) {
    if (!state.excludedCompanies.size) return jobs;
    return jobs.filter(function (j) { return !state.excludedCompanies.has(j.c); });
  }
  function applyCompanyCap(jobs) {
    if (!state.companyCapEnabled) return jobs;
    var cap = Math.max(1, Math.floor(Number(state.companyCap) || 10));
    var groups = new Map();
    jobs.forEach(function (j) {
      if (!groups.has(j.c)) groups.set(j.c, []);
      groups.get(j.c).push(j);
    });
    var out = [];
    groups.forEach(function (list) {
      var byTitle = new Map();
      list.forEach(function (j) {
        var key = stripAccents(j.t || "").trim();
        var prev = byTitle.get(key);
        if (!prev || (j.sd || "") > (prev.sd || "")) byTitle.set(key, j);
      });
      Array.from(byTitle.values())
        .sort(function (a, b) {
          return (b.sd || "").localeCompare(a.sd || "") || (a.t || "").localeCompare(b.t || "");
        })
        .slice(0, cap)
        .forEach(function (j) { out.push(j); });
    });
    return out;
  }
  function companiesAboveCap(cap) {
    var map = new Map();
    JOBS.forEach(function (j) {
      if (!map.has(j.c)) map.set(j.c, new Set());
      map.get(j.c).add(stripAccents(j.t || "").trim());
    });
    var count = 0;
    map.forEach(function (titles) { if (titles.size > cap) count++; });
    return count;
  }
  function companyCounts() {
    var map = new Map();
    JOBS.forEach(function (j) { map.set(j.c, (map.get(j.c) || 0) + 1); });
    return Array.from(map.entries()).map(function (entry) {
      return { name: entry[0], count: entry[1] };
    }).sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  }

  /* ─── Data scoping ─────────────────────────────────────────── */

  function filterJobs(days, opts) {
    opts = opts || {};
    var jobs = applyCompanyFilter(JOBS);
    if (!opts.ignoreCategory && state.category) jobs = jobs.filter(function (j) { return j.cat === state.category; });
    if (!opts.ignoreModality && state.modality) jobs = jobs.filter(function (j) { return j.mod === state.modality; });
    if (days != null) jobs = jobs.filter(function (j) { return inWindow(j, days); });
    return jobs;
  }
  function baseJobs() {
    return filterJobs(null);
  }
  function scopeJobs(days, opts) {
    return applyCompanyCap(filterJobs(days, opts));
  }
  function previousJobs(days) {
    if (days == null) return [];
    return applyCompanyCap(filterJobs(null).filter(function (j) {
      var age = daysOld(j);
      return age > days && age <= days * 2;
    }));
  }

  function aggregate(jobs) {
    var uniq = dedupe(jobs);
    var n = uniq.length;
    var counts = { remote: 0, hybrid: 0, onsite: 0, other: 0, english: 0, englishReq: 0, salary: 0, easy: 0, degree: 0, master: 0 };
    var years = [];
    var salaries = [];
    var companies = new Map();
    var locations = new Map();
    var months = new Map();
    var cats = {};
    var skillCounts = { tools: new Map(), methods: new Map(), soft: new Map(), languages: new Map() };

    uniq.forEach(function (j) {
      counts[j.mod] = (counts[j.mod] || 0) + 1;
      if (j.lang === "en") counts.english++;
      if (j.en) counts.englishReq++;
      if (j.sal != null) { counts.salary++; salaries.push(j.sal); }
      if (j.ea) counts.easy++;
      if (j.edu === "degree") counts.degree++;
      if (j.edu === "master") counts.master++;
      if (typeof j.yrs === "number") years.push(j.yrs);

      companies.set(j.c, (companies.get(j.c) || 0) + 1);
      var loc = cleanLocation(j.l);
      locations.set(loc, (locations.get(loc) || 0) + 1);

      var month = (j.sd || j.d || "").slice(0, 7);
      if (month) months.set(month, (months.get(month) || 0) + 1);

      if (!cats[j.cat]) cats[j.cat] = { count: 0, remote: 0, english: 0, salary: 0, easy: 0, years: [] };
      var cat = cats[j.cat];
      cat.count++;
      if (j.mod === "remote") cat.remote++;
      if (j.lang === "en") cat.english++;
      if (j.sal != null) cat.salary++;
      if (j.ea) cat.easy++;
      if (typeof j.yrs === "number") cat.years.push(j.yrs);

      (j.sk || []).forEach(function (idx) {
        var skill = SKILL_BY_INDEX[idx];
        if (!skill) return;
        if (!skillCounts[skill.t]) skillCounts[skill.t] = new Map();
        skillCounts[skill.t].set(skill.n, (skillCounts[skill.t].get(skill.n) || 0) + 1);
      });
    });

    var rankings = {};
    Object.keys(skillCounts).forEach(function (type) {
      rankings[type] = Array.from(skillCounts[type].entries())
        .map(function (entry) { return { name: entry[0], count: entry[1], pct: pct(entry[1], n) }; })
        .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
    });

    var yearBuckets = [
      { label: "Sin exp.", min: 0, max: 0, count: 0 },
      { label: "1 año", min: 1, max: 1, count: 0 },
      { label: "2 años", min: 2, max: 2, count: 0 },
      { label: "3–4 años", min: 3, max: 4, count: 0 },
      { label: "5+ años", min: 5, max: 99, count: 0 },
    ];
    years.forEach(function (y) {
      for (var i = 0; i < yearBuckets.length; i++) {
        if (y >= yearBuckets[i].min && y <= yearBuckets[i].max) { yearBuckets[i].count++; break; }
      }
    });

    return {
      n: n,
      raw: jobs.length,
      counts: counts,
      remotePct: pct(counts.remote, n),
      hybridPct: pct(counts.hybrid, n),
      onsitePct: pct(counts.onsite, n),
      englishPct: pct(counts.english, n),
      englishReqPct: pct(counts.englishReq, n),
      salaryPct: pct(counts.salary, n),
      easyPct: pct(counts.easy, n),
      degreePct: pct(counts.degree, n),
      masterPct: pct(counts.master, n),
      medianYears: median(years),
      medianSalary: median(salaries),
      salaryCount: salaries.length,
      yearBuckets: yearBuckets,
      companies: sortedEntries(companies, 8),
      locations: sortedEntries(locations, 10),
      months: months,
      categories: Object.keys(cats).map(function (name) {
        var c = cats[name];
        return {
          name: name,
          count: c.count,
          pct: pct(c.count, n),
          remotePct: pct(c.remote, c.count),
          englishPct: pct(c.english, c.count),
          salaryPct: pct(c.salary, c.count),
          easyPct: pct(c.easy, c.count),
          medianYears: median(c.years),
        };
      }).sort(function (a, b) { return b.count - a.count; }),
      rankings: rankings,
    };
  }

  function sortedEntries(map, limit) {
    return Array.from(map.entries())
      .map(function (e) { return { name: e[0], count: e[1] }; })
      .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); })
      .slice(0, limit);
  }

  /* ─── Charts ───────────────────────────────────────────────── */

  function destroyCharts() {
    Object.keys(CHARTS).forEach(function (id) {
      try { CHARTS[id].destroy(); } catch (e) { /* noop */ }
      delete CHARTS[id];
    });
  }

  function makeChart(id, config) {
    var el = $(id);
    if (!el) return;
    if (typeof Chart === "undefined") {
      var box = el.parentElement;
      if (box) box.innerHTML = '<div class="demand-empty">No se pudo cargar Chart.js (sin red).</div>';
      return;
    }
    if (CHARTS[id]) CHARTS[id].destroy();
    CHARTS[id] = new Chart(el, config);
  }

  function chartDefaults() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
    Chart.defaults.color = "#6b7280";
    Chart.defaults.borderColor = COLORS.grid;
  }

  function barConfig(labels, values, horizontal, color, tooltipLabel) {
    return {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: color || COLORS.accent,
          borderRadius: 5,
          borderSkipped: false,
          maxBarThickness: 26,
        }],
      },
      options: {
        indexAxis: horizontal ? "y" : "x",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return tooltipLabel ? tooltipLabel(ctx) : ctx.parsed[horizontal ? "x" : "y"] + "";
              },
            },
          },
        },
        scales: horizontal ? {
          x: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { precision: 0 } },
          y: { grid: { display: false }, ticks: { autoSkip: false } },
        } : {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { precision: 0 } },
        },
      },
    };
  }

  /* ─── Rendering ────────────────────────────────────────────── */

  function render() {
    var win = WINDOWS.filter(function (w) { return w.value === state.window; })[0] || WINDOWS[2];
    var days = win.days;
    var jobs = scopeJobs(days);
    var agg = aggregate(jobs);
    var prevAgg = state.compare && days != null ? aggregate(previousJobs(days)) : null;

    destroyCharts();
    chartDefaults();
    renderWindowPills();
    renderCompanyPanel();
    renderMeta(agg);
    renderKPIs(agg, prevAgg);
    renderCategories(agg);
    renderModality(agg);
    renderDemand(agg);
    renderProfile(agg);
    renderCV(agg);
    renderModalityLocations();
    renderCompensation();
    renderTrends();
    renderPeriodTable();
    renderComparison(agg, prevAgg);
    updateWindowNote(agg, win);
    syncURL();
  }

  function renderCompanyPanel() {
    var btn = $("company-filter-btn");
    var excluded = state.excludedCompanies.size;
    var cap = Math.max(1, Math.floor(Number(state.companyCap) || 10));
    var parts = [];
    if (excluded) parts.push(excluded + " excl.");
    if (state.companyCapEnabled) parts.push("cap " + cap);
    btn.textContent = "🏢 Empresas" + (parts.length ? " · " + parts.join(" · ") : "");
    btn.classList.toggle("active", excluded > 0 || state.companyCapEnabled);
    btn.setAttribute("aria-expanded", state.companyPanelOpen ? "true" : "false");
    $("company-panel").classList.toggle("hidden", !state.companyPanelOpen);
    if (!state.companyPanelOpen) return;

    $("cap-toggle").checked = state.companyCapEnabled;
    $("cap-value").value = cap;
    $("cap-presets").innerHTML = [5, 10, 25].map(function (value) {
      return '<button class="cap-preset' + (state.companyCapEnabled && cap === value ? " active" : "") +
        '" data-cap="' + value + '">' + value + "</button>";
    }).join("");
    $("cap-presets").querySelectorAll(".cap-preset").forEach(function (preset) {
      preset.addEventListener("click", function () {
        state.companyCap = Number(preset.dataset.cap);
        state.companyCapEnabled = true;
        render();
      });
    });
    var affected = companiesAboveCap(cap);
    $("cap-note").textContent = state.companyCapEnabled
      ? "Cap activo: máximo " + cap + " roles únicos por empresa · afecta a " + affected +
        " empresa" + (affected === 1 ? "" : "s") + " del histórico. Se aplica después de los filtros."
      : "Opcional. Actívalo para que ninguna empresa pese más de N roles en KPIs, rankings, tendencias y gap vs CV.";

    var all = companyCounts();
    $("company-presets").innerHTML = [10, 25, 50, 100].map(function (threshold) {
      var count = all.filter(function (c) { return c.count >= threshold; }).length;
      return '<button class="company-preset" data-threshold="' + threshold + '"' +
        (count ? "" : " disabled") + ">+" + threshold + " (" + count + ")</button>";
    }).join("");
    $("company-presets").querySelectorAll(".company-preset").forEach(function (preset) {
      preset.addEventListener("click", function () {
        var threshold = Number(preset.dataset.threshold);
        all.forEach(function (company) {
          if (company.count >= threshold) state.excludedCompanies.add(company.name);
        });
        render();
      });
    });

    $("company-search").value = state.companySearch;
    renderCompanyList();
    updateCompanyNote();
  }

  function renderCompanyList() {
    var query = stripAccents(state.companySearch.trim());
    var companies = companyCounts().filter(function (company) {
      return !query || stripAccents(company.name).indexOf(query) !== -1;
    }).slice(0, 80);

    $("company-list").innerHTML = companies.length ? companies.map(function (company) {
      var checked = state.excludedCompanies.has(company.name);
      return '<label class="company-item"><input type="checkbox" data-company="' +
        encodeURIComponent(company.name) + '"' + (checked ? " checked" : "") + '>' +
        '<span class="name" title="' + esc(company.name) + '">' + esc(company.name) + '</span>' +
        '<span class="count">' + fmt(company.count) + "</span></label>";
    }).join("") : '<p class="muted">Sin empresas que coincidan.</p>';

    $("company-list").querySelectorAll("input[data-company]").forEach(function (input) {
      input.addEventListener("change", function () {
        var name = decodeURIComponent(input.dataset.company);
        if (input.checked) state.excludedCompanies.add(name);
        else state.excludedCompanies.delete(name);
        render();
      });
    });
  }

  function updateCompanyNote() {
    var excluded = state.excludedCompanies.size;
    var postings = JOBS.filter(function (j) { return state.excludedCompanies.has(j.c); }).length;
    $("company-note").textContent = excluded
      ? "Excluyendo " + excluded + " empresa" + (excluded === 1 ? "" : "s") + " · " +
        fmt(postings) + " vacantes. Este filtro afecta KPIs, gráficos, tendencias, periodos y análisis vs CV."
      : "Sin empresas excluidas. Marca compañías o usa los presets para quitar empresas de alto volumen.";
  }

  function renderWindowPills() {
    var el = $("window-pills");
    el.innerHTML = WINDOWS.map(function (w) {
      return '<button class="pill' + (state.window === w.value ? " active" : "") + '" data-window="' + w.value + '">' + w.label + "</button>";
    }).join("");
    el.querySelectorAll(".pill").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.window = btn.dataset.window;
        render();
      });
    });
  }

  function renderMeta(agg) {
    var uniqueRoles = dedupe(JOBS).length;
    $("dataset-meta").innerHTML =
      "<strong>" + fmt(DATA.meta.total) + "</strong> vacantes · <strong>" + fmt(uniqueRoles) +
      "</strong> roles únicos<br>Actualizado " + formatDate(DATA.meta.maxScrapedAt);
  }

  function deltaHtml(current, previous, suffix) {
    if (previous == null) return "";
    var diff = current - previous;
    var isCount = suffix && suffix.indexOf("roles") !== -1;
    var shown = isCount ? Math.abs(Math.round(diff)) : Math.abs(oneDec(diff)).toFixed(1);
    var cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
    var arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "•";
    return '<div class="kpi-delta ' + cls + '">' + arrow + " " + shown + (suffix || " pp") + " vs anterior</div>";
  }

  function renderKPIs(agg, prev) {
    var kpis = [
      { value: fmt(agg.n), label: "Roles únicos analizados", delta: prev && prev.n ? deltaHtml(agg.n, prev.n, " roles") : "" },
      { value: agg.remotePct + "%", label: "Remote", delta: prev && prev.n ? deltaHtml(agg.remotePct, prev.remotePct) : "" },
      { value: agg.englishPct + "%", label: "Vacantes en inglés", delta: prev && prev.n ? deltaHtml(agg.englishPct, prev.englishPct) : "" },
      { value: agg.salaryPct + "%", label: "Con salario parseable", delta: prev && prev.n ? deltaHtml(agg.salaryPct, prev.salaryPct) : "" },
      { value: agg.easyPct + "%", label: "Easy Apply", delta: prev && prev.n ? deltaHtml(agg.easyPct, prev.easyPct) : "" },
      {
        value: agg.medianYears == null ? "—" : agg.medianYears + " años",
        label: "Experiencia mediana",
        delta: prev && prev.n && prev.medianYears != null && agg.medianYears != null ? deltaHtml(agg.medianYears, prev.medianYears, " años") : "",
      },
    ];
    $("kpis").innerHTML = kpis.map(function (k) {
      return '<div class="kpi"><div class="kpi-value">' + k.value + '</div><div class="kpi-label">' + k.label + "</div>" + k.delta + "</div>";
    }).join("");
  }

  function renderCategories(agg) {
    var scope = aggregate(scopeJobs(currentDays(), { ignoreCategory: true }));
    var cats = scope.categories;
    var labels = cats.map(function (c) { return c.name; });
    var values = cats.map(function (c) { return c.count; });
    var bg = cats.map(function (c) { return c.name === state.category ? COLORS.accent : COLORS.accentSoft; });
    makeChart("chart-categories", {
      type: "bar",
      data: { labels: labels, datasets: [{ data: values, backgroundColor: bg, borderRadius: 5, maxBarThickness: 24 }] },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        onClick: function (evt, elements) {
          if (!elements.length) return;
          var name = labels[elements[0].index];
          state.category = state.category === name ? "" : name;
          $("category-select").value = state.category;
          render();
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var cat = cats[ctx.dataIndex];
                return [
                  fmt(cat.count) + " roles (" + cat.pct + "%)",
                  cat.remotePct + "% remote · " + cat.englishPct + "% inglés",
                  cat.salaryPct + "% con salario · " + (cat.medianYears == null ? "sin dato" : cat.medianYears + " años exp."),
                ];
              },
            },
          },
        },
        scales: {
          x: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { precision: 0 } },
          y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } },
        },
      },
    });
  }

  function renderModality(agg) {
    var labels = ["Remote", "Híbrido", "Presencial", "Otra"];
    var values = [agg.counts.remote, agg.counts.hybrid, agg.counts.onsite, agg.counts.other];
    var colors = ["#14b8a6", "#8b5cf6", "#f59e0b", "#d1d5db"];
    makeChart("chart-modality", {
      type: "doughnut",
      data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        cutout: "62%",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      },
    });
    $("modality-legend").innerHTML = labels.map(function (label, i) {
      var p = pct(values[i], agg.n);
      return '<span><span class="dot" style="background:' + colors[i] + '"></span>' + label + " " + p + "%</span>";
    }).join("");
  }

  function renderDemand(agg) {
    var types = ["tools", "methods", "experience", "soft", "languages"];
    $("demand-tabs").innerHTML = types.map(function (type) {
      return '<button class="tab' + (state.demandType === type ? " active" : "") + '" data-type="' + type + '" role="tab">' + TYPE_LABELS[type] + "</button>";
    }).join("");
    $("demand-tabs").querySelectorAll(".tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.demandType = btn.dataset.type;
        renderDemand(agg);
      });
    });

    var ranking = (agg.rankings[state.demandType] || []).slice(0, 24);
    if (!ranking.length) {
      $("demand-list").innerHTML = '<p class="demand-empty">Sin datos para esta combinación de filtros.</p>';
      return;
    }
    var max = ranking[0].pct || 1;
    $("demand-list").innerHTML = ranking.map(function (item, i) {
      return '<div class="demand-row" data-skill="' + encodeURIComponent(item.name) + '" tabindex="0" role="button">' +
        '<span class="demand-rank">' + (i + 1) + '</span>' +
        '<span class="demand-name">' + esc(item.name) + '</span>' +
        '<span class="demand-bar"><i style="width:' + Math.max(2, (item.pct / max) * 100) + '%"></i></span>' +
        '<span class="demand-pct">' + item.pct + "%</span>" +
        "</div>";
    }).join("");
    $("demand-list").querySelectorAll(".demand-row").forEach(function (row) {
      function open() { openSkillModal(decodeURIComponent(row.dataset.skill)); }
      row.addEventListener("click", open);
      row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }

  function renderProfile(agg) {
    var title = state.category ? "Perfil: " + state.category : "Perfil: todas las categorías";
    $("profile-title").textContent = title;
    $("profile-subtitle").textContent = fmt(agg.n) + " roles únicos · " + currentLabel().toLowerCase();

    var tools = (agg.rankings.tools || []).slice(0, 10);
    var methods = (agg.rankings.methods || []).slice(0, 10);
    makeChart("chart-tools", barConfig(
      tools.map(function (t) { return t.name; }),
      tools.map(function (t) { return t.pct; }),
      true,
      "#2563eb",
      function (ctx) { return tools[ctx.dataIndex].pct + "% (" + tools[ctx.dataIndex].count + " roles)"; }
    ));
    makeChart("chart-methods", barConfig(
      methods.map(function (t) { return t.name; }),
      methods.map(function (t) { return t.pct; }),
      true,
      "#8b5cf6",
      function (ctx) { return methods[ctx.dataIndex].pct + "% (" + methods[ctx.dataIndex].count + " roles)"; }
    ));
    var experience = (agg.rankings.experience || []).slice(0, 10);
    makeChart("chart-experience", barConfig(
      experience.map(function (t) { return t.name; }),
      experience.map(function (t) { return t.pct; }),
      true,
      "#f59e0b",
      function (ctx) { return experience[ctx.dataIndex].pct + "% (" + experience[ctx.dataIndex].count + " roles)"; }
    ));
    makeChart("chart-years", barConfig(
      agg.yearBuckets.map(function (b) { return b.label; }),
      agg.yearBuckets.map(function (b) { return b.count; }),
      false,
      "#14b8a6",
      function (ctx) { return agg.yearBuckets[ctx.dataIndex].count + " roles"; }
    ));

    var companies = agg.companies.slice(0, 6);
    var locations = agg.locations.slice(0, 6);
    $("companies-locations").innerHTML =
      '<div><h4 class="mini-title">Empresas</h4><div class="rank-list">' +
      (companies.length ? companies.map(function (c) {
        return '<div class="rank-item"><span>' + esc(c.name) + '</span><span class="rank-count">' + fmt(c.count) + "</span></div>";
      }).join("") : '<span class="muted">Sin datos</span>') +
      '</div></div><div><h4 class="mini-title">Ubicaciones</h4><div class="rank-list">' +
      (locations.length ? locations.map(function (c) {
        return '<div class="rank-item"><span>' + esc(c.name) + '</span><span class="rank-count">' + fmt(c.count) + "</span></div>";
      }).join("") : '<span class="muted">Sin datos</span>') +
      "</div></div>";
  }

  function renderCV(agg) {
    function typed(items, type) {
      return (items || []).map(function (item) {
        return { name: item.name, count: item.count, pct: item.pct, type: type };
      });
    }
    var skillPool = typed(agg.rankings.tools, "Herramienta")
      .concat(typed(agg.rankings.methods, "Metodología"))
      .sort(function (a, b) { return b.pct - a.pct; })
      .slice(0, 17);
    var experiencePool = typed(agg.rankings.experience, "Experiencia")
      .sort(function (a, b) { return b.pct - a.pct; })
      .slice(0, 8);
    var pool = skillPool.concat(experiencePool);
    var seen = new Set();
    pool = pool.filter(function (item) {
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    }).sort(function (a, b) { return b.pct - a.pct; }).slice(0, 25);

    var totalDemand = pool.reduce(function (sum, item) { return sum + item.pct; }, 0) || 1;
    var coveredDemand = pool.reduce(function (sum, item) { return sum + (CV_HAVE.has(item.name) ? item.pct : 0); }, 0);
    var coverage = Math.round((coveredDemand / totalDemand) * 1000) / 10;

    var gaps = pool.filter(function (item) { return !CV_HAVE.has(item.name); }).slice(0, 8);
    var strengths = pool.filter(function (item) { return CV_HAVE.has(item.name); }).slice(0, 10);

    $("cv-coverage").textContent = coverage + "%";
    $("cv-ring").style.background = "conic-gradient(var(--accent) " + coverage + "%, var(--bg) " + coverage + "%)";
    $("cv-score-title").textContent = state.category ? "Cobertura en " + state.category : "Cobertura global";
    $("cv-score-note").textContent = "De las 25 skills más pedidas en " + currentLabel().toLowerCase() + ". Basado solo en base-cv.md.";

    var haveCount = pool.filter(function (item) { return CV_HAVE.has(item.name); }).length;
    $("cv-stats").innerHTML =
      '<div class="cv-stat"><strong>' + pool.length + "</strong><span>skills top</span></div>" +
      '<div class="cv-stat"><strong>' + haveCount + "</strong><span>ya en tu CV</span></div>" +
      '<div class="cv-stat"><strong>' + (pool.length - haveCount) + "</strong><span>por cubrir</span></div>";

    $("cv-gaps").innerHTML = gaps.length ? gaps.map(function (item) {
      return '<div class="gap-item" data-skill="' + encodeURIComponent(item.name) + '" role="button" tabindex="0"><strong>' +
        esc(item.name) + '</strong><small>' + esc(item.type) + ' · lo pide ' + item.pct + "% de las vacantes (" +
        fmt(item.count) + " roles)</small></div>";
    }).join("") : '<p class="muted">Sin gaps: dominas todas las skills más pedidas de este corte.</p>';
    $("cv-gaps").querySelectorAll(".gap-item").forEach(function (el) {
      function open() { openSkillModal(decodeURIComponent(el.dataset.skill)); }
      el.addEventListener("click", open);
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });

    $("cv-strengths").innerHTML = strengths.length ? strengths.map(function (item) {
      return '<span class="chip">' + esc(item.name) + " · " + item.pct + "%</span>";
    }).join("") : '<p class="muted">Sin coincidencias detectadas.</p>';
  }

  function renderModalityLocations() {
    var scope = aggregate(scopeJobs(currentDays(), { ignoreModality: true }));
    var cats = scope.categories.slice().sort(function (a, b) { return b.remotePct - a.remotePct; });
    makeChart("chart-remote-category", barConfig(
      cats.map(function (c) { return c.name; }),
      cats.map(function (c) { return c.remotePct; }),
      true,
      "#14b8a6",
      function (ctx) {
        var c = cats[ctx.dataIndex];
        return c.remotePct + "% remote (" + fmt(c.count) + " roles)";
      }
    ));

    var locs = aggregate(scopeJobs(currentDays())).locations;
    $("top-locations").innerHTML = locs.length ? locs.map(function (loc) {
      return '<div class="rank-item"><span>' + esc(loc.name) + '</span><span class="rank-count">' + fmt(loc.count) + "</span></div>";
    }).join("") : '<span class="muted">Sin datos</span>';
  }

  function renderCompensation() {
    var scope = aggregate(scopeJobs(currentDays(), { ignoreCategory: true }));
    var cats = scope.categories.slice().sort(function (a, b) { return b.salaryPct - a.salaryPct; });
    makeChart("chart-salary", barConfig(
      cats.map(function (c) { return c.name; }),
      cats.map(function (c) { return c.salaryPct; }),
      true,
      "#f59e0b",
      function (ctx) { return cats[ctx.dataIndex].salaryPct + "% con salario"; }
    ));

    var agg = aggregate(scopeJobs(currentDays()));
    var lines = [];
    lines.push("<div><strong>" + agg.salaryPct + "%</strong> de los roles muestran una cifra de salario.</div>");
    if (agg.medianSalary != null) {
      lines.push("<div><strong>Salario mediano detectado:</strong> $" + fmt(Math.round(agg.medianSalary)) + " MXN (n=" + agg.salaryCount + ").</div>");
    }
    lines.push('<div class="muted">Los montos mezclan monedas y periodicidades; úsalo como señal, no como benchmark.</div>');
    $("salary-insights").innerHTML = lines.join("");
  }

  function renderTrends() {
    var months = monthKeys();
    var byMonth = {};
    filterJobs(null).forEach(function (j) {
      var key = (j.sd || j.d || "").slice(0, 7);
      if (!key) return;
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(j);
    });
    Object.keys(byMonth).forEach(function (key) {
      byMonth[key] = applyCompanyCap(byMonth[key]);
    });
    var catCounts = {};
    Object.keys(byMonth).forEach(function (key) {
      byMonth[key].forEach(function (j) {
        if (!catCounts[j.cat]) catCounts[j.cat] = {};
        catCounts[j.cat][key] = (catCounts[j.cat][key] || 0) + 1;
      });
    });
    var cats = Object.keys(catCounts).map(function (name) {
      return { name: name, total: Object.values(catCounts[name]).reduce(function (a, b) { return a + b; }, 0) };
    }).sort(function (a, b) { return b.total - a.total; });

    var datasets = cats.slice(0, 6).map(function (cat, i) {
      return {
        label: cat.name,
        data: months.map(function (m) { return catCounts[cat.name][m] || 0; }),
        borderColor: COLORS.palette[i % COLORS.palette.length],
        backgroundColor: COLORS.palette[i % COLORS.palette.length] + "22",
        tension: 0.3,
        pointRadius: 3,
        borderWidth: 2,
        fill: false,
      };
    });

    makeChart("chart-trends", {
      type: "line",
      data: { labels: months.map(monthLabel), datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true } } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { precision: 0 } },
        },
      },
    });

    var first = DATA.meta.minScrapedAt ? formatDate(DATA.meta.minScrapedAt) : "—";
    var last = DATA.meta.maxScrapedAt ? formatDate(DATA.meta.maxScrapedAt) : "—";
    $("trend-note").textContent = "Historial disponible: " + first + " → " + last + " (" + months.length + " meses). Conteo de vacantes vistas por primera vez cada mes.";
  }

  function monthKeys() {
    var min = DATA.meta.minScrapedAt ? new Date(DATA.meta.minScrapedAt) : NOW;
    var max = DATA.meta.maxScrapedAt ? new Date(DATA.meta.maxScrapedAt) : NOW;
    var keys = [];
    var cursor = new Date(min.getFullYear(), min.getMonth(), 1);
    var end = new Date(max.getFullYear(), max.getMonth(), 1);
    while (cursor <= end) {
      keys.push(cursor.getFullYear() + "-" + String(cursor.getMonth() + 1).padStart(2, "0"));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys.slice(-12);
  }

  function monthLabel(key) {
    var parts = key.split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    return d.toLocaleDateString("es-MX", { month: "short", year: "numeric" });
  }

  function periodDefinitions() {
    return [
      { key: "0-7", label: "Últimos 7 días", min: 0, max: 7 },
      { key: "8-30", label: "8–30 días", min: 7, max: 30 },
      { key: "31-90", label: "31–90 días", min: 30, max: 90 },
      { key: "91-365", label: "91–365 días", min: 90, max: 365 },
      { key: "365+", label: "Más de 1 año", min: 365, max: Infinity },
    ];
  }

  function jobsForPeriod(base, period) {
    return base.filter(function (j) {
      var age = daysOld(j);
      return age >= period.min && age < period.max;
    });
  }

  function updatePeriodFooter(rows, total) {
    var union = [];
    rows.forEach(function (row) {
      if (state.periodSel.has(row.period.key)) union.push.apply(union, row.jobs);
    });
    var selectedJobs = applyCompanyCap(union);
    var selAgg = aggregate(selectedJobs);
    $("period-foot").innerHTML = '<tr><td></td><td>Suma seleccionada</td><td>' + fmt(selectedJobs.length) +
      "</td><td>" + pct(selectedJobs.length, total) + "%</td><td>" + selAgg.remotePct +
      "%</td><td>" + selAgg.englishPct + "%</td><td>" + selAgg.salaryPct + "%</td></tr>";
  }

  function renderPeriodTable() {
    var periods = periodDefinitions();
    var base = baseJobs();
    var rows = periods.map(function (period) {
      var jobs = applyCompanyCap(jobsForPeriod(base, period));
      return { period: period, jobs: jobs, agg: aggregate(jobs) };
    });
    var total = rows.reduce(function (sum, row) { return sum + row.jobs.length; }, 0) || 1;

    $("period-body").innerHTML = rows.map(function (row) {
      var period = row.period;
      var selected = state.periodSel.has(period.key);
      return '<tr data-key="' + period.key + '" class="' + (selected ? "selected" : "") + '">' +
        '<td><input type="checkbox" ' + (selected ? "checked" : "") + ' aria-label="Seleccionar ' + period.label + '"></td>' +
        "<td>" + period.label + "</td>" +
        "<td>" + fmt(row.jobs.length) + "</td>" +
        "<td>" + pct(row.jobs.length, total) + "%</td>" +
        "<td>" + row.agg.remotePct + "%</td>" +
        "<td>" + row.agg.englishPct + "%</td>" +
        "<td>" + row.agg.salaryPct + "%</td>" +
        "</tr>";
    }).join("");

    $("period-body").querySelectorAll("tr").forEach(function (row) {
      row.querySelector("input").addEventListener("change", function (e) {
        var key = row.dataset.key;
        if (e.target.checked) state.periodSel.add(key);
        else state.periodSel.delete(key);
        row.classList.toggle("selected", e.target.checked);
        updatePeriodFooter(rows, total);
      });
    });

    updatePeriodFooter(rows, total);
  }

  function renderComparison(agg, prev) {
    var card = $("comparison-table");
    if (!state.compare || !prev) {
      card.classList.add("hidden");
      return;
    }
    card.classList.remove("hidden");
    var metrics = [
      { label: "Roles únicos", cur: agg.n, prev: prev.n, suffix: "" },
      { label: "% Remote", cur: agg.remotePct, prev: prev.remotePct, suffix: " pp" },
      { label: "% Inglés", cur: agg.englishPct, prev: prev.englishPct, suffix: " pp" },
      { label: "% Salario", cur: agg.salaryPct, prev: prev.salaryPct, suffix: " pp" },
      { label: "% Easy Apply", cur: agg.easyPct, prev: prev.easyPct, suffix: " pp" },
      { label: "Experiencia mediana", cur: agg.medianYears, prev: prev.medianYears, suffix: " años" },
    ];
    var rows = metrics.map(function (m) {
      if (m.cur == null || m.prev == null) return "";
      var diff = oneDec(m.cur - m.prev);
      var cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
      return "<tr><td>" + m.label + "</td><td>" + m.cur + "</td><td>" + m.prev +
        '</td><td class="' + cls + '">' + (diff > 0 ? "+" : "") + diff + (m.suffix || "") + "</td></tr>";
    }).join("");

    if (!prev.n) {
      card.innerHTML = "<h3>Comparación vs periodo anterior</h3>" +
        '<p class="muted">No hay vacantes en el periodo anterior para esta combinación de filtros.</p>';
      return;
    }

    var catMap = {};
    agg.categories.forEach(function (c) { catMap[c.name] = c.pct; });
    var catPrev = {};
    prev.categories.forEach(function (c) { catPrev[c.name] = c.pct; });
    var catNames = Array.from(new Set(Object.keys(catMap).concat(Object.keys(catPrev))));
    var catRows = catNames.map(function (name) {
      var cur = catMap[name] != null ? catMap[name] : 0;
      var before = catPrev[name] != null ? catPrev[name] : 0;
      var diff = oneDec(cur - before);
      var row = '<tr><td>' + name + "</td><td>" + cur + "%</td><td>" + before + '%</td><td class="' +
        (diff > 0 ? "up" : diff < 0 ? "down" : "flat") + '">' + (diff > 0 ? "+" : "") + diff + " pp</td></tr>";
      return { row: row, cur: cur };
    }).sort(function (a, b) { return b.cur - a.cur; }).slice(0, 6).map(function (x) { return x.row; }).join("");

    card.innerHTML = "<h3>Comparación vs periodo anterior</h3>" +
      '<p class="muted">Misma duración, inmediatamente antes de la ventana actual.</p>' +
      '<div class="table-wrap"><table class="period-table"><thead><tr><th>Métrica</th><th>Actual</th><th>Anterior</th><th>Δ</th></tr></thead><tbody>' +
      rows + "</tbody></table></div>" +
      '<h3 style="margin-top:14px">Cambio de share por categoría</h3>' +
      '<div class="table-wrap"><table class="period-table"><thead><tr><th>Categoría</th><th>Actual</th><th>Anterior</th><th>Δ</th></tr></thead><tbody>' +
      (catRows || '<tr><td colspan="4" class="muted">Sin datos</td></tr>') + "</tbody></table></div>";
  }

  function updateWindowNote(agg, win) {
    var label = win.days == null ? "todo el histórico" : "los últimos " + win.days + " días";
    var excludedNote = state.excludedCompanies.size
      ? " · " + state.excludedCompanies.size + " empresa" + (state.excludedCompanies.size === 1 ? "" : "s") + " excluida" + (state.excludedCompanies.size === 1 ? "" : "s")
      : "";
    var body = state.companyCapEnabled
      ? "Mostrando " + fmt(agg.n) + " roles únicos (cap " + Math.max(1, Math.floor(Number(state.companyCap) || 10)) + "/empresa)"
      : "Mostrando " + fmt(agg.raw) + " postings (" + fmt(agg.n) + " roles únicos)";
    $("window-note").textContent = body + " vistos por el scraper en " + label + excludedNote +
      ". Fecha de corte: " + formatDate(DATA.meta.maxScrapedAt) + ".";
  }

  function currentDays() {
    var win = WINDOWS.filter(function (w) { return w.value === state.window; })[0] || WINDOWS[2];
    return win.days;
  }

  function currentLabel() {
    var win = WINDOWS.filter(function (w) { return w.value === state.window; })[0] || WINDOWS[2];
    return win.days == null ? "Todo el histórico" : "Últimos " + win.days + " días";
  }

  /* ─── Modal ────────────────────────────────────────────────── */

  function openSkillModal(skillName) {
    var idx = SKILL_INDEX_BY_NAME[skillName];
    if (idx == null) return;
    var jobs = dedupe(scopeJobs(currentDays())).filter(function (j) {
      return (j.sk || []).indexOf(idx) !== -1;
    }).sort(function (a, b) { return (b.sd || "").localeCompare(a.sd || ""); });

    $("modal-title").textContent = skillName;
    $("modal-subtitle").textContent = jobs.length + " vacantes únicas en " + currentLabel().toLowerCase() +
      (state.category ? " · " + state.category : "") + (state.modality ? " · " + MODALITY_LABELS[state.modality] : "");

    $("modal-jobs").innerHTML = jobs.length ? jobs.slice(0, 80).map(function (j) {
      return '<div class="modal-job">' +
        '<a href="' + esc(j.u) + '" target="_blank" rel="noopener">' + esc(j.t || "Sin título") + "</a>" +
        '<span class="job-meta">' + esc(j.c || "") + " · " + esc(cleanLocation(j.l)) + " · " + esc(j.cat || "") +
        " · " + MODALITY_LABELS[j.mod] + " · visto " + formatDate(j.sd) + "</span>" +
        "</div>";
    }).join("") : '<p class="muted">No hay vacantes con esta skill y filtros.</p>';

    $("modal").classList.remove("hidden");
  }

  function closeModal() {
    $("modal").classList.add("hidden");
  }

  $("modal-close").addEventListener("click", closeModal);
  $("modal-backdrop").addEventListener("click", closeModal);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  /* ─── Controls / URL ───────────────────────────────────────── */

  function setupControls() {
    var select = $("category-select");
    select.innerHTML = '<option value="">Todas las categorías</option>' + DATA.meta.categories.map(function (cat) {
      return '<option value="' + cat + '">' + cat + "</option>";
    }).join("");
    select.value = state.category;
    select.addEventListener("change", function () {
      state.category = select.value;
      render();
    });

    $("modality-select").value = state.modality;
    $("modality-select").addEventListener("change", function (e) {
      state.modality = e.target.value;
      render();
    });

    $("compare-toggle").checked = state.compare;
    $("compare-toggle").addEventListener("change", function (e) {
      state.compare = e.target.checked;
      render();
    });

    $("company-filter-btn").addEventListener("click", function () {
      state.companyPanelOpen = !state.companyPanelOpen;
      renderCompanyPanel();
    });

    $("company-search").addEventListener("input", function (e) {
      state.companySearch = e.target.value;
      renderCompanyList();
    });

    $("company-clear").addEventListener("click", function () {
      state.excludedCompanies.clear();
      state.companySearch = "";
      render();
    });

    $("cap-toggle").addEventListener("change", function (e) {
      state.companyCapEnabled = e.target.checked;
      render();
    });

    $("cap-value").addEventListener("change", function (e) {
      var value = parseInt(e.target.value, 10);
      state.companyCap = Math.max(1, Math.min(500, value || 10));
      state.companyCapEnabled = true;
      render();
    });

    $("reset-filters").addEventListener("click", function () {
      state.window = "90";
      state.category = "";
      state.modality = "";
      state.demandType = "tools";
      state.compare = false;
      state.excludedCompanies.clear();
      state.companySearch = "";
      state.companyPanelOpen = false;
      state.companyCapEnabled = false;
      state.companyCap = 10;
      $("category-select").value = "";
      $("modality-select").value = "";
      $("compare-toggle").checked = false;
      render();
    });
  }

  function syncURL() {
    var params = new URLSearchParams();
    if (state.window !== "90") params.set("window", state.window);
    if (state.category) params.set("cat", state.category);
    if (state.modality) params.set("mod", state.modality);
    if (state.demandType !== "tools") params.set("type", state.demandType);
    if (state.compare) params.set("compare", "1");
    if (state.excludedCompanies.size) {
      params.set("exclude", Array.from(state.excludedCompanies).map(encodeURIComponent).join("|"));
    }
    if (state.companyCapEnabled) params.set("cap", String(state.companyCap));
    var query = params.toString();
    var url = window.location.pathname + (query ? "?" + query : "");
    window.history.replaceState(null, "", url);
  }

  function readURL() {
    var params = new URLSearchParams(window.location.search);
    var win = params.get("window");
    if (win && WINDOWS.some(function (w) { return w.value === win; })) state.window = win;
    var cat = params.get("cat");
    if (cat && DATA.meta.categories.indexOf(cat) !== -1) state.category = cat;
    var mod = params.get("mod");
    if (mod && ["remote", "hybrid", "onsite"].indexOf(mod) !== -1) state.modality = mod;
    var type = params.get("type");
    if (type && TYPE_LABELS[type]) state.demandType = type;
    state.compare = params.get("compare") === "1";
    var exclude = params.get("exclude");
    if (exclude) {
      exclude.split("|").forEach(function (name) {
        try { state.excludedCompanies.add(decodeURIComponent(name)); } catch (e) { /* ignore */ }
      });
    }
    var cap = parseInt(params.get("cap"), 10);
    if (cap > 0) {
      state.companyCapEnabled = true;
      state.companyCap = Math.min(500, cap);
    }
  }

  /* ─── Init ─────────────────────────────────────────────────── */

  async function init() {
    try {
      var response = await fetch("data/insights.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("Error " + response.status);
      DATA = await response.json();
      JOBS = DATA.jobs || [];
      SKILLS = DATA.skills || [];
      SKILL_BY_INDEX = SKILLS;
      SKILLS.forEach(function (skill, index) {
        SKILL_INDEX_BY_NAME[skill.n] = index;
      });
      CV_HAVE = new Set((DATA.cv && DATA.cv.have || []).map(function (idx) {
        return SKILL_BY_INDEX[idx] ? SKILL_BY_INDEX[idx].n : null;
      }).filter(Boolean));
      NOW = new Date(DATA.meta.maxScrapedAt || Date.now());

      readURL();
      setupControls();
      render();
    } catch (err) {
      $("kpis").innerHTML = '<div class="card" style="grid-column:1/-1">No se pudo cargar <code>insights.json</code>: ' +
        (err.message || err) + ". Corre <code>python3 scripts/build_insights.py</code> y vuelve a intentar.</div>";
    }
  }

  init();
})();
