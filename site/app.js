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

  let activeTimeFilter = '';
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
  let hideDisliked = true;

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

  if (window.location.search.includes('reset=1')) {
    trackedJobs = {};
    notes = [];
    localStorage.removeItem('tracked_jobs');
    localStorage.removeItem('notes_data');
    db.collection('tracked').doc('jobs').delete().catch(() => {});
    db.collection('notes').doc('data').delete().catch(() => {});
    window.history.replaceState(null, '', window.location.pathname);
  }

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

  notesBtn.addEventListener('click', () => {
    notesPanel.classList.toggle('hidden');
  });

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
      if (getJobKey(filtered[idx]) !== getJobKey(job)) continue;
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
        existing.interested = true;
      }
    } else if (status === 'applied') {
      if (existing.applied) {
        delete existing.applied;
      } else {
        existing.applied = true;
      }
    } else if (status === 'disliked') {
      if (existing.disliked) {
        delete existing.disliked;
        delete existing.dislikeReason;
      } else {
        showDislikeDialog((reason) => {
          const entry = trackedJobs[key] || {};
          entry.disliked = true;
          entry.dislikeReason = reason || '';
          entry.trackedAt = new Date().toISOString();
          trackedJobs[key] = entry;
          saveTrackedJobs();
          updateCardUI(job);
          renderTrackingFilters();
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
    renderTrackingFilters();
    if (showInterested || showApplied || !hideDisliked) {
      applyFilters();
    }
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

  function renderJobCards(jobs) {
    if (jobs.length === 0) {
      jobList.innerHTML = '<div class="job-card" style="text-align:center;color:var(--text-secondary);">No se encontraron vacantes</div>';
      return;
    }
    let html = '';
    jobs.forEach((j, idx) => {
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

      html += `
        <div class="job-card${borderClass ? ' ' + borderClass : ''}" data-idx="${idx}">
          <div class="job-card-header">
            <div class="job-card-title">${j.title || 'Sin título'} ${langBadge(j.language)}</div>
            <div class="card-actions">
              ${trackBtnHtml(j)}
              ${j.url ? `<a href="${j.url}" target="_blank" class="card-link" title="Ver en LinkedIn">🔗</a>` : ''}
            </div>
          </div>
          <div class="job-card-company">${j.company || ''}${j.location ? ' &middot; ' + j.location : ''}</div>
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
    let html = `
      <span class="pill${showInterested ? ' active' : ''}" data-filter="interested">♡ ${counts.interested}</span>
      <span class="pill${showApplied ? ' active' : ''}" data-filter="showapplied">✓ ${counts.applied}</span>
      <span class="pill${!hideDisliked ? ' active' : ''}" data-filter="hidedisliked">👎 ${counts.disliked}</span>
    `;
    const el = document.getElementById('tracking-filters');
    if (!el) return;
    el.innerHTML = html;
    el.querySelectorAll('.pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.filter;
        if (f === 'interested') showInterested = !showInterested;
        if (f === 'showapplied') showApplied = !showApplied;
        if (f === 'hidedisliked') hideDisliked = !hideDisliked;
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
      if (showInterested) {
        const st = getTrackStatus(j);
        if (!st.interested) return false;
      }
      if (showApplied) {
        const st = getTrackStatus(j);
        if (!st.applied) return false;
      }
      if (hideDisliked) {
        const st = getTrackStatus(j);
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
    renderJobCards(page);
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
      <div class="meta-line">
        <span>📅 ${dateStr}</span>
        ${cat ? `<span class="tag">${cat}</span>` : ''}
        ${`<span class="apply-badge ${applyClass}">${applyLabel}</span>`}
      </div>
      <div class="actions">
        ${job.url ? `<a href="${job.url}" target="_blank" class="btn btn-primary">🔗 Ver en LinkedIn</a>` : ''}
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
      html += `<div class="description">${desc}</div>`;
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

    modalBody.innerHTML = html;

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

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
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
    hideDisliked = true;
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
