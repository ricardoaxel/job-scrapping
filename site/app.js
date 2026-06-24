(function () {
  const BASE = (window.location.pathname.replace(/\/$/, '') || '');
  let allJobs = [];
  let skillData = {};
  let filtered = [];
  let currentPage = 1;
  const PER_PAGE = 20;
  let activeCategory = '';

  const searchInput = document.getElementById('search');
  const categoryFilters = document.getElementById('category-filters');
  const statsEl = document.getElementById('stats');
  const jobList = document.getElementById('job-list');
  const paginationEl = document.getElementById('pagination');
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  const modalClose = document.getElementById('modal-close');
  const modalBackdrop = document.getElementById('modal-backdrop');

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

  function truncateText(text, max) {
    if (!text || text.length <= max) return text || '';
    return text.substring(0, max) + '...';
  }

  function langBadge(lang) {
    if (lang === 'es') return '<span class="lang-badge lang-es">ES</span>';
    return '<span class="lang-badge lang-en">EN</span>';
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
      html += `
        <div class="job-card" data-idx="${idx}">
          <div class="job-card-title">${j.title || 'Sin título'} ${langBadge(j.language)}</div>
          <div class="job-card-company">${j.company || ''}${j.location ? ' &middot; ' + j.location : ''}</div>
          <div class="job-card-meta">
            <span>${dateStr}</span>
            ${j.category ? `<span class="job-card-tag">${j.category}</span>` : ''}
          </div>
          ${descPreview ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-top:6px;line-height:1.4;">${descPreview}</div>` : ''}
        </div>
      `;
    });
    jobList.innerHTML = html;
    jobList.querySelectorAll('.job-card').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        openModal(filtered[idx]);
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

  function applyFilters() {
    const query = searchInput.value.toLowerCase().trim();
    filtered = allJobs.filter(j => {
      if (activeCategory && (j.category || '') !== activeCategory) return false;
      if (!query) return true;
      const searchText = (j.title + ' ' + j.company + ' ' + (j.category || '') + ' ' + (j.description || '')).toLowerCase();
      return searchText.includes(query);
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

    let html = `
      <h2>${job.title || 'Sin título'} ${langBadge(jobLang)}</h2>
      <div class="company-line">${job.company || ''}${job.location ? ' &middot; ' + job.location : ''}</div>
      <div class="meta-line">
        <span>📅 ${dateStr}</span>
        ${cat ? `<span class="tag">${cat}</span>` : ''}
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

    modalBody.innerHTML = html;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  modalClose.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  searchInput.addEventListener('input', () => {
    currentPage = 1;
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
      renderPills();
      applyFilters();
    } catch (err) {
      jobList.innerHTML = '<div class="job-card" style="text-align:center;color:var(--text-secondary);">Error al cargar datos: ' + err.message + '</div>';
    }
  }

  init();
})();
