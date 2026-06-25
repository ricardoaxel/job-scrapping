(function () {
  const BASE = (window.location.pathname.replace(/\/$/, '') || '');
  let allJobs = [];
  let skillData = {};
  let filtered = [];
  let currentPage = 1;
  const PER_PAGE = 20;
  let activeCategory = '';

  const profileData = {
    'Nombre completo': 'Valeria Páez',
    'Nombre(s)': 'Valeria',
    'Ap. Paterno': 'Páez',
    'Ap. Materno': 'Reyes',
    'Correo': 'valppaezreyes@gmail.com',
    'LinkedIn': 'https://linkedin.com/in/valeria-paez-reyes',
    'Ubicación': 'Ciudad de México, México',
    'Educación máxima': 'Licenciatura en Marketing',
    'Inglés': 'B2',
    'Años de experiencia': '2'
  };

  const searchInput = document.getElementById('search');
  const categoryFilters = document.getElementById('category-filters');
  const statsEl = document.getElementById('stats');
  const jobList = document.getElementById('job-list');
  const paginationEl = document.getElementById('pagination');
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  const modalClose = document.getElementById('modal-close');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const refCvBtn = document.getElementById('ref-cv-btn');
  const timeFilters = document.getElementById('time-filters');
  const progressBadge = document.createElement('div');
  progressBadge.id = 'progress-badge';
  document.body.appendChild(progressBadge);

  const pokemonContainer = document.createElement('div');
  pokemonContainer.id = 'pokemon-container';
  document.querySelector('header').appendChild(pokemonContainer);

  let activeTimeFilter = '';
  let prevAppliedCount = 0;
  let lastMilestone = 0;
  let customDateFrom = '';
  let customDateTo = '';
  let trackedJobs = JSON.parse(localStorage.getItem('tracked_jobs') || '{}');

  function relativeDate(dateStr) {
    if (!dateStr) return 'Fecha no disponible';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Fecha no disponible';
    const now = new Date();
    const diff = now - d;
    const hours = Math.floor(diff / 3600000);
    if (diff < 0) return 'Recién publicado';
    if (hours < 1) {
      const mins = Math.floor(diff / 60000);
      return `Hace ${mins} ${mins === 1 ? 'minuto' : 'minutos'}`;
    }
    if (hours < 24) return `Hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    const days = Math.floor(diff / 86400000);
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} días`;
    if (days < 30) {
      const w = Math.floor(days / 7);
      return `Hace ${w} ${w === 1 ? 'semana' : 'semanas'}`;
    }
    const m = Math.floor(days / 30);
    if (m < 12) return `Hace ${m} ${m === 1 ? 'mes' : 'meses'}`;
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function cvBasePath(category) {
    const folder = category;
    const file = category.replace(/ /g, '_');
    return `${BASE}/cvs/${folder}/CV_Valeria_Paez_Reyes_${file}`;
  }

  function getCvLinks(category, lang) {
    const suffix = lang === 'es' ? '_es' : '';
    const base = cvBasePath(category) + suffix;
    return [
      { label: `CV Simple (PDF)`, url: base + '_simple.pdf', icon: '📄' },
      { label: `CV Styled (PDF)`, url: base + '_styled.pdf', icon: '🎨' },
      { label: `CV (DOCX)`, url: base + '.docx', icon: '📝' },
    ];
  }

  function getCategoryCounts() {
    const counts = {};
    allJobs.forEach(j => {
      const c = j.category || 'Sin categoría';
      counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  }

  function renderPills() {
    const counts = getCategoryCounts();
    const categories = Object.keys(counts).sort();
    let html = '<span class="pill' + (activeCategory === '' ? ' active' : '') + '" data-cat="">Todas</span>';
    categories.forEach(c => {
      const active = activeCategory === c ? ' active' : '';
      html += `<span class="pill${active}" data-cat="${c.replace(/"/g, '&quot;')}">${c} (${counts[c]})</span>`;
    });
    categoryFilters.innerHTML = html;
    categoryFilters.querySelectorAll('.pill').forEach(el => {
      el.addEventListener('click', () => {
        activeCategory = el.dataset.cat;
        currentPage = 1;
        renderPills();
        applyFilters();
      });
    });
  }

  function renderTimeFilters() {
    const presets = [
      { key: '', label: 'Todas' },
      { key: '24h', label: '24 h' },
      { key: '3d', label: '3 días' },
      { key: '7d', label: '7 días' },
    ];
    let html = '<div class="pills-row">';
    presets.forEach(p => {
      const active = activeTimeFilter === p.key ? ' active' : '';
      html += `<span class="pill${active}" data-time="${p.key}">${p.label}</span>`;
    });
    const active = activeTimeFilter === 'custom' ? ' active' : '';
    html += `<span class="pill${active}" data-time="custom">Personalizado</span>`;
    html += '</div>';

    if (activeTimeFilter === 'custom') {
      html += '<div class="date-range">';
      html += `<label>Desde <input type="date" id="date-from" value="${customDateFrom}"></label>`;
      html += `<label>Hasta <input type="date" id="date-to" value="${customDateTo}"></label>`;
      html += '</div>';
    }

    timeFilters.innerHTML = html;
    timeFilters.querySelectorAll('.pill').forEach(el => {
      el.addEventListener('click', () => {
        activeTimeFilter = el.dataset.time;
        customDateFrom = '';
        customDateTo = '';
        currentPage = 1;
        renderTimeFilters();
        applyFilters();
      });
    });

    if (activeTimeFilter === 'custom') {
      const fromInput = document.getElementById('date-from');
      const toInput = document.getElementById('date-to');
      if (fromInput) {
        fromInput.addEventListener('change', () => {
          customDateFrom = fromInput.value;
          currentPage = 1;
          applyFilters();
        });
      }
      if (toInput) {
        toInput.addEventListener('change', () => {
          customDateTo = toInput.value;
          currentPage = 1;
          applyFilters();
        });
      }
    }
  }

  function truncateText(text, max) {
    if (!text || text.length <= max) return text || '';
    return text.substring(0, max) + '...';
  }

  function langBadge(lang) {
    if (lang === 'es') return '<span class="lang-badge lang-es">ES</span>';
    return '<span class="lang-badge lang-en">EN</span>';
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function formatInline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\|/g, '<span class="cv-sep">|</span>');
  }

  function renderMarkdown(md) {
    const lines = md.split('\n');
    let html = '';
    let inList = false;
    lines.forEach(line => {
      const t = line.trim();
      if (t.startsWith('# ') && !t.startsWith('## ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h1>${formatInline(t.slice(2))}</h1>`;
        return;
      }
      if (t.startsWith('## ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h2>${formatInline(t.slice(3))}</h2>`;
        return;
      }
      if (t.startsWith('### ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h3>${formatInline(t.slice(4))}</h3>`;
        return;
      }
      if (t.startsWith('- ')) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${formatInline(t.slice(2))}</li>`;
        return;
      }
      if (t === '---') {
        if (inList) { html += '</ul>'; inList = false; }
        html += '<hr>';
        return;
      }
      if (t === '') {
        if (inList) { html += '</ul>'; inList = false; }
        return;
      }
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${formatInline(t)}</p>`;
    });
    if (inList) html += '</ul>';
    return html;
  }

  async function openRefCv() {
    try {
      const res = await fetch(`${BASE}/data/base-cv.md`);
      if (!res.ok) throw new Error('No encontrado');
      const md = await res.text();
      const content = renderMarkdown(md);
      modalBody.innerHTML = `
        <div class="cv-viewer">
          <div class="cv-viewer-header">
            <h2>CV base de referencia</h2>
            <span class="cv-viewer-desc">Información fuente para generar todos los CVs por categoría</span>
          </div>
          <div class="cv-viewer-content">${content}</div>
        </div>
      `;
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } catch (err) {
      modalBody.innerHTML = `<div class="cv-viewer"><p style="color:var(--text-secondary);text-align:center;">Error al cargar CV base: ${err.message}</p></div>`;
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  /* ─── Tracking ─── */

  let showInterested = false;
  let showApplied = false;
  let showDisliked = false;
  let statsViewVisible = false;

  const firebaseConfig = {
    apiKey: "AIzaSyANT112Y6OIzN-TUeldWFNQ9n9jniqhxXo",
    authDomain: "job-search-9d700.firebaseapp.com",
    projectId: "job-search-9d700",
    storageBucket: "job-search-9d700.firebasestorage.app",
    messagingSenderId: "159264431826",
    appId: "1:159264431826:web:896b0c8b8484d860c2570b",
    measurementId: "G-LMKTVF7TCE"
  };
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();

  /* ─── Auth ─── */
  const AUTH_KEY = 'auth_pikachu';
  const authOverlay = document.getElementById('auth-overlay');
  const authInput = document.getElementById('auth-input');
  const authBtn = document.getElementById('auth-btn');
  const authError = document.getElementById('auth-error');

  if (localStorage.getItem(AUTH_KEY)) {
    authOverlay.classList.add('authed');
  }

  authBtn.addEventListener('click', () => {
    if (authInput.value === 'pikachu') {
      localStorage.setItem(AUTH_KEY, '1');
      authOverlay.classList.add('authed');
    } else {
      authError.textContent = 'Contraseña incorrecta';
      authInput.value = '';
      authInput.focus();
    }
  });
  authInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authBtn.click();
  });

  /* ─── Notes ─── */
  let notes = [];
  const notesBtn = document.getElementById('notes-btn');
  const notesPanel = document.getElementById('notes-panel');
  const notesList = document.getElementById('notes-list');
  const notesInput = document.getElementById('notes-input');
  const notesAddBtn = document.getElementById('notes-add-btn');
  const NOTES_DOC = db.collection('notes').doc('data');

  notesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notesPanel.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (notesPanel.classList.contains('hidden')) return;
    if (notesPanel.contains(e.target) || notesBtn.contains(e.target)) return;
    notesPanel.classList.add('hidden');
  });

  if (window.location.search.includes('reset=1')) {
    trackedJobs = {};
    notes = [];
    localStorage.removeItem('tracked_jobs');
    localStorage.removeItem('notes_data');
    db.collection('tracked').doc('jobs').delete().catch(() => {});
    db.collection('notes').doc('data').delete().catch(() => {});
    window.history.replaceState(null, '', window.location.pathname);
  }

  const statsBtn = document.getElementById('stats-btn');
  statsBtn.addEventListener('click', () => {
    if (statsViewVisible) {
      showMainView();
    } else {
      showStatsView();
    }
  });

  function showMainView() {
    statsViewVisible = false;
    document.querySelector('main').style.display = '';
    document.getElementById('stats-view').classList.add('hidden');
    statsBtn.textContent = '📊 Stats';
    applyFilters();
  }

  function showStatsView() {
    statsViewVisible = true;
    document.querySelector('main').style.display = 'none';
    document.getElementById('stats-view').classList.remove('hidden');
    statsBtn.textContent = '💼 Vacantes';
    renderStats();
  }

  function findJobByKey(key) {
    return allJobs.find(j => getJobKey(j) === key) || null;
  }

  function renderStats() {
    const container = document.getElementById('stats-content');
    if (!allJobs.length) {
      container.innerHTML = '<div class="stats-empty">Cargando datos...</div>';
      return;
    }
    // Collect applied jobs with their trackedAt dates
    const applied = [];
    Object.entries(trackedJobs).forEach(([key, entry]) => {
      if (entry.applied && entry.trackedAt) {
        const job = findJobByKey(key);
        if (job) applied.push({ job, appliedAt: entry.trackedAt });
      }
    });
    applied.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));

    const total = applied.length;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const todayCount = applied.filter(a => a.appliedAt.slice(0, 10) === today).length;

    // This week (Mon-Sun)
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    weekStart.setHours(0,0,0,0);
    const weekCount = applied.filter(a => new Date(a.appliedAt) >= weekStart).length;
    const totalDisliked = Object.values(trackedJobs).filter(e => e.disliked).length;

    // Streak — allows today to be 0, counts consecutive days before today
    let streak = 0;
    const check = new Date(now);
    const todayDs = now.toISOString().slice(0, 10);
    while (true) {
      const ds = check.toISOString().slice(0, 10);
      if (applied.some(a => a.appliedAt.slice(0, 10) === ds)) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else if (ds === todayDs && streak === 0) {
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }

    // 3-month calendar heatmap
    const calStart = new Date(now);
    calStart.setMonth(now.getMonth() - 3);
    calStart.setDate(1);
    calStart.setHours(0, 0, 0, 0);
    const calCells = [];
    const cell = new Date(calStart);
    while (cell <= now) {
      const ds = cell.toISOString().slice(0, 10);
      const c = applied.filter(a => a.appliedAt.slice(0, 10) === ds).length;
      calCells.push({ date: ds, count: c });
      cell.setDate(cell.getDate() + 1);
    }
    const maxC = Math.max(...calCells.map(c => c.count), 1);
    const monthLabels = [];
    let lastMonth = -1;
    calCells.forEach((c, i) => {
      const m = new Date(c.date + 'T12:00:00').getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ index: i, label: new Date(c.date + 'T12:00:00').toLocaleDateString('es-MX', { month: 'short' }) });
        lastMonth = m;
      }
    });
    const calHtml = monthLabels.map(m => `<span class="cal-month-label">${m.label}</span>`).join('');
    const cellHtml = calCells.map(c => {
      const pct = maxC > 0 ? Math.round((c.count / maxC) * 4) : 0;
      const level = c.count === 0 ? 0 : Math.min(pct + 1, 4);
      const dateObj = new Date(c.date + 'T12:00:00');
      const label = dateObj.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return `<span class="cal-cell cal-l${level}" title="${c.count} ${c.count === 1 ? 'aplicación' : 'aplicaciones'} el ${label}"></span>`;
    }).join('');
    const todayIndex = calCells.findIndex(c => c.date === today);

    // Per-day history
    const dayGroups = {};
    applied.forEach(a => {
      const d = a.appliedAt.slice(0, 10);
      if (!dayGroups[d]) dayGroups[d] = [];
      dayGroups[d].push(a.job);
    });
    const jobKeyToData = {};
    Object.entries(trackedJobs).forEach(([k]) => {
      const j = findJobByKey(k);
      if (j) jobKeyToData[k] = j;
    });


    let historyHtml = '';
    Object.entries(dayGroups).sort().reverse().forEach(([date, jobs]) => {
      const d = new Date(date + 'T12:00:00');
      const dateLabel = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const isToday = date === today;
      historyHtml += `<div class="stat-day-header${isToday ? ' stat-today' : ''}">${isToday ? 'Hoy' : dateLabel} (${jobs.length})</div>`;
      jobs.forEach(j => {
        const key = getJobKey(j);
        const applyLabel = j.easyApply ? 'Postulación rápida' : 'Sitio externo';
        historyHtml += `<div class="stat-job-row" data-jobkey="${escHtml(key)}" role="button" tabindex="0">
          <span class="stat-job-title">${escHtml(j.title || 'Sin título')}</span>
          <span class="stat-job-company">${escHtml(j.company || '')}</span>
          <span class="stat-job-meta">${escHtml(j.category || '')} &middot; ${applyLabel}</span>
          ${j.url ? `<a href="${j.url}" target="_blank" class="stat-job-link" onclick="event.stopPropagation()">🔗</a>` : ''}
        </div>`;
      });
    });

    // Pie chart data (filtered by date range)
    const pieFrom = localStorage.getItem('stats_pie_from') || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const pieTo = localStorage.getItem('stats_pie_to') || new Date().toISOString().slice(0, 10);
    let pieApplied = 0, pieDisliked = 0;
    Object.entries(trackedJobs).forEach(([, entry]) => {
      if (!entry.trackedAt) return;
      const d = entry.trackedAt.slice(0, 10);
      if (d < pieFrom || d > pieTo) return;
      if (entry.applied) pieApplied++;
      if (entry.disliked) pieDisliked++;
    });
    const pieTotal = allJobs.filter(j => {
      const d = j.postedDate || j.scrapedAt;
      return d && d.slice(0, 10) >= pieFrom && d.slice(0, 10) <= pieTo;
    }).length;
    const piePending = Math.max(0, pieTotal - pieApplied - pieDisliked);
    const totalPie = pieApplied + pieDisliked + piePending || 1;
    const aPct = (pieApplied / totalPie * 100).toFixed(1);
    const dPct = (pieDisliked / totalPie * 100).toFixed(1);
    const pPct = (piePending / totalPie * 100).toFixed(1);
    const gradient = `conic-gradient(#86efac 0% ${aPct}%, #fca5a5 ${aPct}% ${+aPct + +dPct}%, #e5e7eb ${+aPct + +dPct}% 100%)`;

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-card-num">${total}</div><div class="stat-card-label">Total aplicadas</div></div>
        <div class="stat-card"><div class="stat-card-num">${todayCount}</div><div class="stat-card-label">Hoy</div></div>
        <div class="stat-card"><div class="stat-card-num">${weekCount}</div><div class="stat-card-label">Esta semana</div></div>
        <div class="stat-card"><div class="stat-card-num">${streak}${streak > 0 ? ' 🔥' : ''}</div><div class="stat-card-label">Racha (días)</div></div>
        <div class="stat-card"><div class="stat-card-num">${totalDisliked}</div><div class="stat-card-label">Descartadas</div></div>
      </div>
      <div class="stat-section">
        <div class="stat-section-title">Salud de las vacantes</div>
        <div class="pie-range">
          <label>Desde <input type="date" class="pie-date-from" value="${pieFrom}"></label>
          <label>Hasta <input type="date" class="pie-date-to" value="${pieTo}"></label>
        </div>
        <div class="pie-row">
          <div class="pie-chart" style="background:${gradient}"></div>
          <div class="pie-legend">
            <div><span class="pie-dot" style="background:#86efac"></span> Aplicadas: ${pieApplied}</div>
            <div><span class="pie-dot" style="background:#fca5a5"></span> Descartadas: ${pieDisliked}</div>
            <div><span class="pie-dot" style="background:#e5e7eb"></span> Pendientes: ${piePending}</div>
          </div>
        </div>
      </div>
      <div class="stat-section">
        <div class="stat-section-title">Calendario de actividad</div>
        <div class="cal-months">${calHtml}</div>
        <div class="cal-grid">${cellHtml}</div>
        <div class="cal-legend">
          <span>Menos</span>
          <span class="cal-cell cal-l0"></span>
          <span class="cal-cell cal-l1"></span>
          <span class="cal-cell cal-l2"></span>
          <span class="cal-cell cal-l3"></span>
          <span class="cal-cell cal-l4"></span>
          <span>Más</span>
        </div>
      </div>
      <div class="stat-section">
        <div class="stat-section-title">Historial por día</div>
        ${historyHtml || '<div class="stats-empty">Sin aplicaciones aún</div>'}
      </div>`;
    container.querySelectorAll('.stat-job-row').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.stat-job-link')) return;
        const key = el.dataset.jobkey;
        const job = jobKeyToData[key];
        if (job) openModal(job);
      });
    });
    container.querySelector('.pie-date-from')?.addEventListener('change', (e) => {
      localStorage.setItem('stats_pie_from', e.target.value);
      renderStats();
    });
    container.querySelector('.pie-date-to')?.addEventListener('change', (e) => {
      localStorage.setItem('stats_pie_to', e.target.value);
      renderStats();
    });
  }

  async function loadNotes() {
    const local = localStorage.getItem('notes_data');
    if (local) {
      try { notes = JSON.parse(local); } catch(e) {}
    }
    try {
      const snap = await NOTES_DOC.get();
      if (snap.exists) {
        notes = snap.data().notes || [];
        localStorage.setItem('notes_data', JSON.stringify(notes));
      }
    } catch (e) { console.warn('Firestore notes load failed:', e); }
    renderNotes();
  }

  function renderNotes() {
    if (!notes.length) {
      notesList.innerHTML = '<div style="color:var(--text-tertiary);font-size:0.8rem;padding:4px 0;">Sin notas aún</div>';
      return;
    }
    let html = '';
    notes.slice().reverse().forEach(n => {
      const d = new Date(n.createdAt);
      const dateStr = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      html += `
        <div class="notes-item${n.resolved ? ' resolved' : ''}" data-id="${n.id}">
          <input type="checkbox" class="notes-check"${n.resolved ? ' checked' : ''}>
          <span class="notes-text">${escHtml(n.text)}</span>
          <span class="notes-date">${dateStr}</span>
          <button class="notes-delete" title="Eliminar nota">&times;</button>
        </div>
      `;
    });
    notesList.innerHTML = html;
    notesList.querySelectorAll('.notes-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.closest('.notes-item').dataset.id;
        const note = notes.find(n => n.id === id);
        if (note) {
          note.resolved = cb.checked;
          saveNotes();
          renderNotes();
        }
      });
    });
    notesList.querySelectorAll('.notes-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.notes-item').dataset.id;
        notes = notes.filter(n => n.id !== id);
        saveNotes();
        renderNotes();
      });
    });
  }

  async function saveNotes() {
    localStorage.setItem('notes_data', JSON.stringify(notes));
    try {
      await NOTES_DOC.set({ notes });
    } catch (e) { console.warn('Firestore notes save failed:', e); }
  }

  notesAddBtn.addEventListener('click', () => {
    const text = notesInput.value.trim();
    if (!text) return;
    notes.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text,
      resolved: false,
      createdAt: new Date().toISOString()
    });
    notesInput.value = '';
    saveNotes();
    renderNotes();
  });

  function getJobKey(job) {
    return job.url || (job.title + job.company);
  }

  function saveTrackedJobs() {
    localStorage.setItem('tracked_jobs', JSON.stringify(trackedJobs));
    db.collection('tracked').doc('jobs').set({ data: trackedJobs, updatedAt: new Date().toISOString() })
      .catch(() => {});
  }

  async function loadTrackedJobs() {
    const local = localStorage.getItem('tracked_jobs');
    if (local) trackedJobs = JSON.parse(local);
    try {
      const snap = await db.collection('tracked').doc('jobs').get();
      if (snap.exists) {
        const remote = snap.data().data;
        if (remote && typeof remote === 'object') {
          trackedJobs = remote;
          localStorage.setItem('tracked_jobs', JSON.stringify(trackedJobs));
        }
      }
    } catch (e) {}
  }

  function showDislikeDialog(onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'dislike-overlay';
    overlay.innerHTML = `
      <div class="dislike-dialog">
        <p>¿Por qué no te gusta esta vacante?</p>
        <textarea placeholder="Motivo (opcional)" rows="2"></textarea>
        <div class="dislike-dialog-actions">
          <button class="btn" id="dislike-skip">Omitir</button>
          <button class="btn btn-primary" id="dislike-save">Guardar motivo</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    function close(reason) {
      overlay.remove();
      onSave(reason);
    }

    overlay.querySelector('#dislike-skip').addEventListener('click', () => close(''));
    overlay.querySelector('#dislike-save').addEventListener('click', () => {
      close(overlay.querySelector('textarea').value.trim());
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('');
    });
    setTimeout(() => overlay.querySelector('textarea').focus(), 100);
  }

  function updateCardUI(job) {
    const st = getTrackStatus(job);
    const key = getJobKey(job);
    const borderClass = getCardBorderClass(job);
    const cards = jobList.querySelectorAll('.job-card');
    for (const card of cards) {
      const idx = parseInt(card.dataset.idx);
      const cardJob = filtered[idx];
      if (!cardJob || getJobKey(cardJob) !== getJobKey(job)) continue;
      card.className = 'job-card' + (borderClass ? ' ' + borderClass : '');
      // Re-add data-idx attribute since className reset it
      card.dataset.idx = idx;
      card.querySelectorAll('.track-btn').forEach(btn => {
        const a = btn.dataset.action;
        btn.classList.toggle('active',
          (a === 'interested' && st.interested) ||
          (a === 'applied' && st.applied) ||
          (a === 'disliked' && st.disliked)
        );
      });
      const t = trackedJobs[key];
      const existing = card.querySelector('.dislike-reason');
      if (t?.disliked && t?.dislikeReason) {
        if (existing) existing.textContent = '👎 ' + escHtml(t.dislikeReason);
        else card.insertAdjacentHTML('beforeend', `<div class="dislike-reason">👎 ${escHtml(t.dislikeReason)}</div>`);
      } else if (existing) {
        existing.remove();
      }
      // Update stage badge
      const existingStage = card.querySelector('.stage-badge');
      if (t?.stage) {
        if (existingStage) {
          existingStage.textContent = t.stage;
          existingStage.className = 'stage-badge stage-' + t.stage.toLowerCase();
        } else {
          card.querySelector('.job-card-company')?.insertAdjacentHTML('beforeend', ` <span class="stage-badge stage-${t.stage.toLowerCase()}">${escHtml(t.stage)}</span>`);
        }
      } else if (existingStage) {
        existingStage.remove();
      }
      // Update note icon
      const existingNoteIcon = card.querySelector('.card-note-icon');
      if (t?.note) {
        if (!existingNoteIcon) {
          card.querySelector('.job-card-title')?.insertAdjacentHTML('beforeend', '<span class="card-note-icon" title="Tiene nota">📝</span>');
        }
      } else if (existingNoteIcon) {
        existingNoteIcon.remove();
      }
      break;
    }
  }

  function toggleTrack(job, status) {
    const key = getJobKey(job);
    const existing = trackedJobs[key] || {};
    if (status === 'interested') {
      if (existing.interested) {
        delete existing.interested;
      } else {
        delete existing.disliked;
        delete existing.dislikeReason;
        existing.interested = true;
      }
    } else if (status === 'applied') {
      if (existing.applied) {
        delete existing.applied;
        delete existing.stage;
      } else {
        delete existing.disliked;
        delete existing.dislikeReason;
        existing.applied = true;
        existing.stage = 'Enviada';
      }
    } else if (status === 'disliked') {
      if (existing.disliked) {
        delete existing.disliked;
        delete existing.dislikeReason;
      } else {
        delete existing.interested;
        delete existing.applied;
        showDislikeDialog((reason) => {
          const entry = trackedJobs[key] || {};
          entry.disliked = true;
          entry.dislikeReason = reason || '';
          entry.trackedAt = new Date().toISOString();
          trackedJobs[key] = entry;
          saveTrackedJobs();
          updateCardUI(job);
          updateProgressBadge(false);
          checkPokemonUnlock();
          renderTrackingFilters();
          applyFilters();
          if (statsViewVisible) renderStats();
        });
        return;
      }
    }
    existing.trackedAt = new Date().toISOString();
    if (!existing.interested && !existing.applied && !existing.disliked) {
      delete trackedJobs[key];
    } else {
      trackedJobs[key] = existing;
    }
    saveTrackedJobs();
    updateCardUI(job);
    const newCount = getTodayAppliedCount();
    updateProgressBadge(newCount > prevAppliedCount);
    prevAppliedCount = newCount;
    checkPokemonUnlock();
    renderTrackingFilters();
    applyFilters();
    if (statsViewVisible) renderStats();
  }

  function getTrackStatus(job) {
    const key = getJobKey(job);
    const t = trackedJobs[key];
    return { interested: !!t?.interested, applied: !!t?.applied, disliked: !!t?.disliked };
  }

  function trackBtnHtml(job) {
    const st = getTrackStatus(job);
    const intClass = st.interested ? ' active' : '';
    const appClass = st.applied ? ' active' : '';
    const disClass = st.disliked ? ' active' : '';
    return `<button class="track-btn track-interested${intClass}" data-action="interested" title="Me interesa">♡</button><button class="track-btn track-applied${appClass}" data-action="applied" title="Aplicada">✓</button><button class="track-btn track-disliked${disClass}" data-action="disliked" title="No me gusta">👎</button>`;
  }

  function getCardBorderClass(job) {
    const t = trackedJobs[getJobKey(job)];
    if (!t || !(t.interested || t.applied || t.disliked)) return '';
    if (t.disliked) return 'card-disliked';
    if (t.applied) return 'card-applied';
    return 'card-interested';
  }

  function getTotalAppliedCount() {
    let count = 0;
    Object.values(trackedJobs).forEach(entry => {
      if (entry.applied) count++;
    });
    return count;
  }

  function getTodayAppliedCount() {
    const today = new Date().toISOString().slice(0, 10);
    let count = 0;
    Object.values(trackedJobs).forEach(entry => {
      if (entry.applied && entry.trackedAt && entry.trackedAt.slice(0, 10) === today) {
        count++;
      }
    });
    return count;
  }

  function getAutoGoal() {
    const now = new Date();
    return allJobs.filter(j => {
      const d = j.postedDate || j.scrapedAt;
      if (!d) return false;
      const diff = now - new Date(d);
      if (diff < 0 || diff > 24 * 3600000) return false;
      const t = trackedJobs[getJobKey(j)];
      return !(t?.disliked);
    }).length;
  }

  const TYPE_COLORS = {
    fire: '#f08030', water: '#6890f0', grass: '#78c850', electric: '#f8d030',
    ice: '#98d8d8', fighting: '#c03028', poison: '#a040a0', ground: '#e0c068',
    flying: '#a890f0', psychic: '#f85888', bug: '#a8b820', rock: '#b8a038',
    ghost: '#705898', dragon: '#7038f8', dark: '#705848', steel: '#b8b8d0',
    fairy: '#f0b6bc', normal: '#a8a878'
  };
  let pokemonData = JSON.parse(localStorage.getItem('pokemon_data') || 'null');
  // clear old-format cache
  if (pokemonData && pokemonData[0] && typeof pokemonData[0].name === 'string' && !pokemonData[0].sprite) {
    localStorage.removeItem('pokemon_data');
    localStorage.removeItem('pokemon_collection');
    pokemonData = null;
  }

  async function fetchPokemonList() {
    if (pokemonData && pokemonData.length >= 151) return;
    try {
      const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=151&offset=0');
      const json = await res.json();
      pokemonData = json.results.map((p, i) => ({
        id: i + 1,
        name: p.name.charAt(0).toUpperCase() + p.name.slice(1),
        sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${i + 1}.png`,
        color: null
      }));
      localStorage.setItem('pokemon_data', JSON.stringify(pokemonData));
      checkPokemonUnlock();
      renderPokemon();
      fetchPokemonTypes();
    } catch (e) {
      pokemonData = null;
    }
  }

  async function fetchPokemonTypes() {
    for (const p of pokemonData) {
      if (!p.color) {
        try {
          const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${p.id}`);
          const data = await res.json();
          const typeName = data.types[0]?.type?.name;
          p.color = TYPE_COLORS[typeName] || '#a8a8a8';
          localStorage.setItem('pokemon_data', JSON.stringify(pokemonData));
        } catch (e) {}
      }
    }
  }

  function checkPokemonUnlock() {
    const total = getTotalAppliedCount();
    const collection = JSON.parse(localStorage.getItem('pokemon_collection') || '[]');
    const earned = Math.floor(total / 5);
    if (!pokemonData || !pokemonData.length) return;
    let changed = false;
    let hadNew = false;
    // remove excess (if total went down)
    while (collection.length > Math.min(earned, pokemonData.length)) {
      collection.pop();
      changed = true;
    }
    // add new
    while (collection.length < Math.min(earned, pokemonData.length)) {
      const available = [];
      pokemonData.forEach((p, i) => {
        if (!collection.some(c => c.index === i)) available.push(i);
      });
      if (!available.length) break;
      const pick = available[Math.floor(Math.random() * available.length)];
      collection.push({ index: pick, unlockedAt: Date.now() });
      changed = true;
      hadNew = true;
    }
    if (changed) {
      localStorage.setItem('pokemon_collection', JSON.stringify(collection));
      if (hadNew) {
        const newest = collection.slice().sort((a, b) => b.unlockedAt - a.unlockedAt)[0];
        const p = newest ? pokemonData[newest.index] : null;
        if (p) showPokemonReveal(p, () => renderPokemon());
        else renderPokemon();
      } else {
        renderPokemon();
      }
    }
  }

  function renderPokemon() {
    const container = document.getElementById('pokemon-container');
    if (!container) return;
    const collection = JSON.parse(localStorage.getItem('pokemon_collection') || '[]');
    if (!pokemonData || !collection.length) {
      container.style.display = 'none';
      return;
    }
    const sorted = collection.slice().sort((a, b) => b.unlockedAt - a.unlockedAt);
    let html = '';
    let first = true;
    sorted.forEach(c => {
      const p = pokemonData[c.index];
      if (!p) return;
      const cls = first ? ' pokemon-badge-new' : '';
      first = false;
      html += `<span class="pokemon-badge${cls}" title="${p.name}"><img src="${p.sprite}" alt="${p.name}" loading="lazy"></span>`;
    });
    container.style.display = '';
    container.innerHTML = html;
    const newBadge = container.querySelector('.pokemon-badge-new');
    if (newBadge) {
      setTimeout(() => newBadge.classList.remove('pokemon-badge-new'), 800);
    }
  }

  function showToast(text, emoji, duration) {
    duration = duration || 2800;
    const container = document.getElementById('toast-container') || (() => {
      const el = document.createElement('div');
      el.id = 'toast-container';
      document.body.appendChild(el);
      return el;
    })();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = (emoji ? emoji + ' ' : '') + text;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
      toast.classList.remove('toast-show');
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function getProgressEmoji(pct) {
    if (pct === 0) return '🌅';
    if (pct < 25) return '🌱';
    if (pct < 50) return '🔥';
    if (pct < 75) return '🚀';
    if (pct < 100) return '🎯';
    return '🏆';
  }

  function showPokemonReveal(pokemon, onDone) {
    const overlay = document.createElement('div');
    overlay.className = 'pokemon-reveal';
    overlay.innerHTML = `
      <div class="pokemon-reveal-bg"></div>
      <div class="pokemon-reveal-content">
        <div class="pokemon-reveal-label">¡Nuevo pokemon conseguido! 🎉</div>
        <div class="pokemon-reveal-sprite">
          <img src="${pokemon.sprite}" alt="${pokemon.name}">
        </div>
        <div class="pokemon-reveal-name">${pokemon.name}</div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('pokemon-reveal-show'));
    setTimeout(() => {
      overlay.classList.remove('pokemon-reveal-show');
      overlay.classList.add('pokemon-reveal-hide');
      setTimeout(() => {
        overlay.remove();
        if (onDone) onDone();
      }, 400);
    }, 1500);
  }

  function showGoalCelebration(count, goal) {
    const overlay = document.createElement('div');
    overlay.className = 'goal-celebration';
    overlay.innerHTML = `
      <div class="goal-celebration-bg"></div>
      <div class="goal-celebration-content">
        <div class="goal-celebration-emoji">🏆</div>
        <div class="goal-celebration-title">¡Meta cumplida!</div>
        <div class="goal-celebration-sub">✓ ${count} de ${goal} aplicadas hoy</div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('goal-celebration-show'));
    setTimeout(() => {
      overlay.classList.remove('goal-celebration-show');
      overlay.classList.add('goal-celebration-hide');
      setTimeout(() => overlay.remove(), 400);
    }, 2500);
  }

  function updateProgressBadge(animate) {
    const count = getTodayAppliedCount();
    const autoGoal = getAutoGoal();
    const customGoal = parseInt(localStorage.getItem('daily_goal'));
    const isManual = customGoal > 0;
    const goal = isManual ? customGoal : autoGoal;
    const el = document.getElementById('progress-badge');
    if (!el) return;
    const pct = goal > 0 ? Math.min(Math.round((count / goal) * 100), 100) : 0;
    const emoji = getProgressEmoji(pct);
    const milestoneTexts = { 25: 'Wuju, ya llevas buen progreso 🎉', 50: 'Ya vamos por la mitad 💪', 75: 'Te falta nada 🔥' };
    Object.keys(milestoneTexts).forEach(m => {
      const threshold = parseInt(m);
      if (pct >= threshold && lastMilestone < threshold) {
        showToast(milestoneTexts[m], '', 2200);
        lastMilestone = threshold;
      }
    });
    if (pct >= 100 && lastMilestone < 100) {
      showGoalCelebration(count, goal);
      lastMilestone = 100;
    }
    if (pct < 25) lastMilestone = 0;
    const infoText = isManual
      ? 'Meta manual: valor fijo definido por ti, ignora dislikes'
      : 'Meta automática: vacantes nuevas del día (24h) sin dislikes';
    el.innerHTML = `
      <div class="progress-emoji">${emoji}</div>
      <div class="progress-info">
        <div class="progress-count">✓ ${count}/<span class="progress-goal">${goal}</span> aplicadas hoy</div>
        <div class="progress-mode-row">
          <span class="progress-mode-label">${isManual ? 'Meta manual' : 'Meta a nuevas vacantes del día'}</span>
          <span class="progress-mode-info" data-tooltip="${infoText}">ℹ️</span>
          <label class="toggle-wrap" title="${isManual ? 'Cambiar a automática' : 'Cambiar a manual'}">
            <input type="checkbox" class="toggle-input"${isManual ? ' checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>`;
    el.querySelector('.progress-goal')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isManual) {
        localStorage.setItem('daily_goal', goal);
      }
      const input = prompt(`Nueva meta diaria${isManual ? '' : ' (vacantes del día: ' + autoGoal + ')'}:`, goal);
      if (input === null) {
        if (!isManual) localStorage.removeItem('daily_goal');
        return;
      }
      const val = parseInt(input);
      if (val > 0) {
        localStorage.setItem('daily_goal', val);
      } else {
        localStorage.removeItem('daily_goal');
      }
      updateProgressBadge(false);
    });
    el.querySelector('.toggle-input')?.addEventListener('change', (e) => {
      e.stopPropagation();
      if (e.target.checked) {
        const input = prompt(`Meta manual (vacantes del día: ${autoGoal}):`, autoGoal);
        const val = parseInt(input);
        if (val > 0) {
          localStorage.setItem('daily_goal', val);
        }
      } else {
        localStorage.removeItem('daily_goal');
      }
      updateProgressBadge(false);
    });
    el.querySelector('.progress-mode-info')?.addEventListener('click', (e) => e.stopPropagation());
    if (animate && count > 0) {
      el.classList.remove('progress-animate');
      void el.offsetWidth;
      el.classList.add('progress-animate');
    }
  }

  function renderJobCards(jobs, startIdx) {
    if (jobs.length === 0) {
      jobList.innerHTML = '<div class="job-card" style="text-align:center;color:var(--text-secondary);">No se encontraron vacantes</div>';
      return;
    }
    let html = '';
    jobs.forEach((j, idx) => {
      const realIdx = (startIdx || 0) + idx;
      const dateStr = relativeDate(j.postedDate || j.scrapedAt);
      const descPreview = truncateText((j.description || '').replace(/^About the job\s*/i, ''), 120);
      const applyLabel = j.easyApply ? 'Postulación rápida' : 'Sitio externo';
      const applyClass = j.easyApply ? 'apply-easy' : 'apply-external';
      const borderClass = getCardBorderClass(j);
      const skills = j.skills && j.skills.length ? j.skills : [];
      let skillsHtml = '';
      if (skills.length > 0) {
        const shown = skills.slice(0, 3);
        const extra = skills.length - 3;
        skillsHtml = '<div class="skill-pills">';
        shown.forEach(s => {
          skillsHtml += `<span class="skill-pill">${s}</span>`;
        });
        if (extra > 0) skillsHtml += `<span class="skill-pill skill-pill-extra">+${extra}</span>`;
        skillsHtml += '</div>';
      }

      const tData = trackedJobs[getJobKey(j)];
      html += `
        <div class="job-card${borderClass ? ' ' + borderClass : ''}" data-idx="${realIdx}">
          <div class="job-card-header">
            <div class="job-card-title">${j.title || 'Sin título'} ${langBadge(j.language)}${tData?.note ? '<span class="card-note-icon" title="Tiene nota">📝</span>' : ''}</div>
            <div class="card-actions">
              ${trackBtnHtml(j)}
              ${j.url ? `<a href="${j.url}" target="_blank" class="card-link" title="Ver en LinkedIn">🔗</a>` : ''}
            </div>
          </div>
          <div class="job-card-company">${j.company || ''}${j.location ? ' &middot; ' + j.location : ''}${tData?.stage ? `<span class="stage-badge stage-${escHtml(tData.stage).toLowerCase()}">${escHtml(tData.stage)}</span>` : ''}</div>
          <div class="job-card-meta">
            <span>${dateStr}</span>
            ${j.category ? `<span class="job-card-tag">${j.category}</span>` : ''}
            ${`<span class="apply-badge ${applyClass}">${applyLabel}</span>`}
          </div>
          ${skillsHtml}
          ${descPreview ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-top:6px;line-height:1.4;">${descPreview}</div>` : ''}
          ${(() => { const t = trackedJobs[getJobKey(j)]; return t?.disliked && t?.dislikeReason ? `<div class="dislike-reason">👎 ${escHtml(t.dislikeReason)}</div>` : ''; })()}
        </div>
      `;
    });
    jobList.innerHTML = html;
    jobList.querySelectorAll('.job-card').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.card-link') || e.target.closest('.track-btn')) return;
        const idx = parseInt(el.dataset.idx);
        openModal(filtered[idx]);
      });
    });
    jobList.querySelectorAll('.track-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.classList.remove('track-btn-animate');
        void btn.offsetWidth;
        btn.classList.add('track-btn-animate');
        const card = btn.closest('.job-card');
        const idx = parseInt(card.dataset.idx);
        toggleTrack(filtered[idx], btn.dataset.action);
      });
    });
  }

  function renderPagination(total) {
    const pages = Math.ceil(total / PER_PAGE);
    if (pages <= 1) {
      paginationEl.innerHTML = '';
      return;
    }
    let html = '';
    html += `<button class="page-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>&laquo; Anterior</button>`;
    html += `<span class="page-info">Página ${currentPage} de ${pages}</span>`;
    html += `<button class="page-btn" data-page="${currentPage + 1}" ${currentPage >= pages ? 'disabled' : ''}>Siguiente &raquo;</button>`;
    paginationEl.innerHTML = html;
    paginationEl.querySelectorAll('.page-btn:not(:disabled)').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page);
        applyFilters();
      });
    });
  }

  function isWithinTime(job) {
    const dateStr = job.postedDate || job.scrapedAt;
    if (!dateStr) return activeTimeFilter === '';
    const jobDate = new Date(dateStr);
    if (isNaN(jobDate.getTime())) return activeTimeFilter === '';
    const now = new Date();

    if (activeTimeFilter === '24h') {
      return (now - jobDate) <= 24 * 3600000;
    }
    if (activeTimeFilter === '3d') {
      return (now - jobDate) <= 3 * 24 * 3600000;
    }
    if (activeTimeFilter === '7d') {
      return (now - jobDate) <= 7 * 24 * 3600000;
    }
    if (activeTimeFilter === 'custom') {
      if (customDateFrom && jobDate < new Date(customDateFrom + 'T00:00:00')) return false;
      if (customDateTo && jobDate > new Date(customDateTo + 'T23:59:59')) return false;
    }
    return true;
  }

  function renderTrackingFilters() {
    const counts = { interested: 0, applied: 0, disliked: 0 };
    allJobs.forEach(j => {
      const st = getTrackStatus(j);
      if (st.interested) counts.interested++;
      if (st.applied) counts.applied++;
      if (st.disliked) counts.disliked++;
    });
    if (!counts.interested) showInterested = false;
    if (!counts.applied) showApplied = false;
    if (!counts.disliked) showDisliked = false;
    const pills = [
      { key: 'interested', label: '♡', count: counts.interested, active: showInterested },
      { key: 'showapplied', label: '✓', count: counts.applied, active: showApplied },
      { key: 'showdisliked', label: '👎', count: counts.disliked, active: showDisliked },
    ];
    let html = '';
    pills.forEach(p => {
      const activeClass = p.active ? ' active' : '';
      const disabledClass = p.count === 0 ? ' pill-disabled' : '';
      html += `<span class="pill${activeClass}${disabledClass}" data-filter="${p.key}">${p.label} ${p.count}</span>`;
    });
    const el = document.getElementById('tracking-filters');
    if (!el) return;
    el.innerHTML = html;
    el.querySelectorAll('.pill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('pill-disabled')) return;
        const f = btn.dataset.filter;
        if (f === 'interested') { showInterested = !showInterested; showDisliked = false; }
        if (f === 'showapplied') { showApplied = !showApplied; showDisliked = false; }
        if (f === 'showdisliked') { showDisliked = !showDisliked; showInterested = false; showApplied = false; }
        currentPage = 1;
        renderTrackingFilters();
        applyFilters();
      });
    });
  }

  function applyFilters() {
    const query = searchInput.value.toLowerCase().trim();
    filtered = allJobs.filter(j => {
      if (activeCategory && (j.category || '') !== activeCategory) return false;
      if (query) {
        const searchText = (j.title + ' ' + j.company + ' ' + (j.category || '') + ' ' + (j.description || '')).toLowerCase();
        if (!searchText.includes(query)) return false;
      }
      if (!isWithinTime(j)) return false;
      const st = getTrackStatus(j);
      if (showInterested && !st.interested) return false;
      if (showApplied && !st.applied) return false;
      if (showDisliked && !st.disliked) return false;
      // Default hiding when NO filter is active
      const hasActiveFilter = showInterested || showApplied || showDisliked;
      if (!hasActiveFilter) {
        if (st.applied) return false;
        if (st.disliked) return false;
      }
      return true;
    });
    filtered.sort((a, b) => {
      const da = a.postedDate || a.scrapedAt || '';
      const db = b.postedDate || b.scrapedAt || '';
      return db.localeCompare(da);
    });
    const total = filtered.length;
    const start = (currentPage - 1) * PER_PAGE;
    const page = filtered.slice(start, start + PER_PAGE);
    statsEl.textContent = total + ' vacante' + (total !== 1 ? 's' : '') + (query ? ' encontradas' : ' disponibles');
    renderJobCards(page, start);
    renderPagination(total);
  }

  function openModal(job) {
    if (!job) return;
    const dateStr = relativeDate(job.postedDate || job.scrapedAt);
    const desc = (job.description || '').replace(/^About the job\s*/i, '').trim();
    const cat = job.category || '';
    const jobLang = job.language || 'en';

    const applyLabel = job.easyApply ? 'Postulación rápida' : 'Sitio externo';
    const applyClass = job.easyApply ? 'apply-easy' : 'apply-external';

    let html = `
      <h2>${job.title || 'Sin título'} ${langBadge(jobLang)}</h2>
      <div class="company-line">${job.company || ''}${job.location ? ' &middot; ' + job.location : ''}</div>
      <div class="modal-header-row">
        <div class="meta-line">
        <span>📅 ${dateStr}</span>
        ${cat ? `<span class="tag">${cat}</span>` : ''}
        ${`<span class="apply-badge ${applyClass}">${applyLabel}</span>`}
      </div>
        <div class="actions">
        <div class="actions-track-group">${trackBtnHtml(job)}</div>
        ${job.url ? `<a href="${job.url}" target="_blank" class="btn btn-linkedin">🔗 Ver en LinkedIn</a>` : ''}
      </div>
      </div>
    `;

    const cvLinks = getCvLinks(cat, jobLang);

    if (cat && cvLinks.length > 0) {
      html += `
        <div class="cv-section">
          <h3>CV recomendado para esta vacante</h3>
          <div class="cv-links">
      `;
      cvLinks.forEach(l => {
        html += `<a href="${l.url}" class="btn" target="_blank">${l.icon} ${l.label}</a>`;
      });
      html += `</div></div>`;
    }

    if (desc) {
      if (desc.length > 500) {
        html += `<div class="description" data-full="${escHtml(desc)}">${desc.slice(0, 500)}... <button class="desc-more-btn">Ver más</button></div>`;
      } else {
        html += `<div class="description">${desc}</div>`;
      }
    }

    const skills = job.skills && job.skills.length ? job.skills : [];
    if (skills.length > 0) {
      html += '<div class="modal-skills"><h3>Skills requeridos</h3><ul>';
      skills.forEach(s => {
        html += `<li>${s}</li>`;
      });
      html += '</ul></div>';
    }

    // Form data section
    let dataHtml = '<div class="form-data-section"><h3>Datos para formularios</h3><div class="form-data-grid">';
    Object.entries(profileData).forEach(([label, value]) => {
      const escaped = value.replace(/"/g, '&quot;');
      dataHtml += `<button class="form-data-pill" data-value="${escaped}" data-label="${label}"><span class="pill-label">${label}</span><span class="pill-value">${escaped}</span></button>`;
    });
    dataHtml += '</div></div>';
    html += dataHtml;

    // Stage + Note section
    const key = getJobKey(job);
    const entry = trackedJobs[key] || {};
    const STAGES = ['Enviada', 'Screening', 'Entrevista', 'Oferta', 'Rechazada'];
    if (entry?.applied) {
      html += `<div class="form-data-section"><h3>Etapa del proceso</h3><div class="stage-pills">`;
      STAGES.forEach(s => {
        const active = entry.stage === s ? ' active' : '';
        html += `<span class="pill stage-pill${active}" data-stage="${s}">${s}</span>`;
      });
      html += `</div></div>`;
    }
    html += `<div class="form-data-section"><h3>Notas sobre la vacante <span class="hint-icon" title="Agrega cualquier dato extra sobre esta vacante o proceso que quieras registrar (ej. contacto, fecha de entrevista, resultado, etc.)">ℹ️</span></h3><textarea class="job-note-textarea" rows="3" placeholder="Ej: mandé CV personalizado, contacté a reclutador...">${escHtml(entry?.note || '')}</textarea></div>`;

    modalBody.innerHTML = html;

    modalBody.querySelector('.desc-more-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const el = e.target.closest('.description');
      el.innerHTML = el.dataset.full;
    });

    modalBody.querySelectorAll('.form-data-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.value;
        navigator.clipboard.writeText(value).then(() => {
          btn.classList.add('copied');
          setTimeout(() => btn.classList.remove('copied'), 1500);
        }).catch(() => {
          btn.classList.add('copied');
          btn.querySelector('.pill-label').textContent = 'Error';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.querySelector('.pill-label').textContent = btn.dataset.label;
          }, 1500);
        });
      });
    });

    modalBody.querySelectorAll('.track-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.classList.remove('track-btn-animate');
        void btn.offsetWidth;
        btn.classList.add('track-btn-animate');
        toggleTrack(job, btn.dataset.action);
        modalBody.querySelectorAll('.track-btn').forEach(b => {
          const a = b.dataset.action;
          const st = getTrackStatus(job);
          b.classList.toggle('active',
            (a === 'interested' && st.interested) ||
            (a === 'applied' && st.applied) ||
            (a === 'disliked' && st.disliked)
          );
        });
        const mc = document.querySelector('.modal-content');
        mc.classList.remove('modal-border-interested', 'modal-border-applied', 'modal-border-disliked');
        const newSt = getTrackStatus(job);
        if (newSt.disliked) mc.classList.add('modal-border-disliked');
        else if (newSt.applied) mc.classList.add('modal-border-applied');
        else if (newSt.interested) mc.classList.add('modal-border-interested');
      });
    });

    modalBody.querySelectorAll('.stage-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const newStage = pill.dataset.stage;
        const e = trackedJobs[getJobKey(job)] || {};
        e.stage = newStage;
        trackedJobs[getJobKey(job)] = e;
        saveTrackedJobs();
        modalBody.querySelectorAll('.stage-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        if (statsViewVisible) renderStats();
        updateCardUI(job);
      });
    });
    const noteT = modalBody.querySelector('.job-note-textarea');
    if (noteT) {
      let tmr;
      noteT.addEventListener('input', () => {
        clearTimeout(tmr);
        tmr = setTimeout(() => {
          const e = trackedJobs[getJobKey(job)] || {};
          e.note = noteT.value;
          trackedJobs[getJobKey(job)] = e;
          saveTrackedJobs();
        }, 400);
      });
    }

    const mc = document.querySelector('.modal-content');
    const st = getTrackStatus(job);
    mc.classList.remove('modal-border-interested', 'modal-border-applied', 'modal-border-disliked');
    if (st.disliked) mc.classList.add('modal-border-disliked');
    else if (st.applied) mc.classList.add('modal-border-applied');
    else if (st.interested) mc.classList.add('modal-border-interested');

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.querySelector('.modal-content')?.classList.remove('modal-border-interested', 'modal-border-applied', 'modal-border-disliked');
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  refCvBtn.addEventListener('click', openRefCv);

  modalClose.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  searchInput.addEventListener('input', () => {
    currentPage = 1;
    applyFilters();
  });

  document.getElementById('reset-filters-btn').addEventListener('click', () => {
    activeCategory = '';
    activeTimeFilter = '';
    customDateFrom = '';
    customDateTo = '';
    showInterested = false;
    showApplied = false;
    showDisliked = false;
    searchInput.value = '';
    currentPage = 1;
    renderPills();
    renderTimeFilters();
    renderTrackingFilters();
    applyFilters();
  });

  async function init() {
    try {
      const [jobsRes, skillRes] = await Promise.all([
        fetch(`${BASE}/data/filtered_jobs.json`),
        fetch(`${BASE}/data/skill_per_category.json`)
      ]);
      if (!jobsRes.ok) throw new Error('Error al cargar vacantes');
      allJobs = await jobsRes.json();
      if (skillRes.ok) skillData = await skillRes.json();
      filtered = [...allJobs];
      await loadTrackedJobs();
      await loadNotes();
      fetchPokemonList();
      prevAppliedCount = getTodayAppliedCount();
      const initAuto = getAutoGoal();
      const initCustom = parseInt(localStorage.getItem('daily_goal'));
      const initGoal = initCustom > 0 ? initCustom : initAuto;
      const initPct = initGoal > 0 ? Math.min(Math.round((prevAppliedCount / initGoal) * 100), 100) : 0;
      if (initPct >= 100) lastMilestone = 100;
      else if (initPct >= 75) lastMilestone = 75;
      else if (initPct >= 50) lastMilestone = 50;
      else if (initPct >= 25) lastMilestone = 25;
      updateProgressBadge(false);
      checkPokemonUnlock();
      renderPokemon();
      renderPills();
      renderTimeFilters();
      renderTrackingFilters();
      applyFilters();
    } catch (err) {
      jobList.innerHTML = '<div class="job-card" style="text-align:center;color:var(--text-secondary);">Error al cargar datos: ' + err.message + '</div>';
    }
  }

  init();
})();
