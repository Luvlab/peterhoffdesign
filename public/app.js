let allProjects   = []
let allCategories = []
let lbImages      = []
let lbCredits     = []
let lbIndex       = 0

// ── i18n ──────────────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  sv: { contact:'Kontakt',      all:'Alla',   loading:'Laddar…',      noProjects:'Inga projekt hittades.',        back:'← Tillbaka'  },
  no: { contact:'Kontakt',      all:'Alle',   loading:'Laster…',      noProjects:'Ingen prosjekter funnet.',      back:'← Tilbake'   },
  da: { contact:'Kontakt',      all:'Alle',   loading:'Indlæser…',    noProjects:'Ingen projekter fundet.',       back:'← Tilbage'   },
  fi: { contact:'Yhteystiedot', all:'Kaikki', loading:'Ladataan…',    noProjects:'Projekteja ei löydy.',          back:'← Takaisin'  },
  en: { contact:'Contact',      all:'All',    loading:'Loading…',     noProjects:'No projects found.',            back:'← Back'      },
  fr: { contact:'Contact',      all:'Tout',   loading:'Chargement…',  noProjects:'Aucun projet trouvé.',          back:'← Retour'    },
  es: { contact:'Contacto',     all:'Todo',   loading:'Cargando…',    noProjects:'No se encontraron proyectos.',  back:'← Volver'    },
  pt: { contact:'Contacto',     all:'Todos',  loading:'A carregar…',  noProjects:'Nenhum projeto encontrado.',    back:'← Voltar'    },
}

// Country → language (ISO 3166-1 alpha-2 → our lang code)
const COUNTRY_LANG = {
  SE:'sv',
  NO:'no',
  DK:'da',
  FI:'fi',
  FR:'fr', BE:'fr', LU:'fr', MC:'fr',
  ES:'es', MX:'es', AR:'es', CO:'es', CL:'es', PE:'es', VE:'es',
  EC:'es', BO:'es', PY:'es', UY:'es', CR:'es', PA:'es', DO:'es',
  HN:'es', SV:'es', GT:'es', NI:'es', CU:'es', GQ:'es',
  PT:'pt', BR:'pt', AO:'pt', MZ:'pt', CV:'pt',
}

function detectBrowserLang() {
  const l = (navigator.language || 'en').toLowerCase().split('-')[0]
  if (l === 'nb' || l === 'nn') return 'no'
  return TRANSLATIONS[l] ? l : 'en'
}

let currentLang = localStorage.getItem('phd_lang') || detectBrowserLang()

async function resolveGeoLang() {
  if (localStorage.getItem('phd_lang')) return   // user has a saved preference — respect it
  try {
    const { country } = await fetch('/api/geo').then(r => r.json())
    const lang = COUNTRY_LANG[country] || 'en'
    currentLang = lang
  } catch (_) { /* keep browser-detected lang */ }
}

function t(key) {
  return (TRANSLATIONS[currentLang] || TRANSLATIONS.sv)[key] || key
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n)
  })
  const picker = document.getElementById('langPicker')
  if (picker) picker.value = currentLang
}

// ── bootstrap ────────────────────────────────────────────────────────────────
async function init() {
  await resolveGeoLang()
  const [categories, projects, contact, settings] = await Promise.all([
    fetch('/api/categories').then(r => r.json()),
    fetch('/api/projects').then(r => r.json()),
    fetch('/api/contact').then(r => r.json()),
    fetch('/api/settings').then(r => r.json()).catch(() => ({}))
  ])
  allProjects   = projects
  allCategories = categories

  renderNav(categories, projects)
  renderContact(contact, settings)

  // route on load
  const match = location.pathname.match(/^\/project\/([^/]+)\/([^/]+)/)
  if (match) {
    const [, cat, slug] = match
    await openProjectBySlug(cat, slug)
  } else {
    setFilter('all')
  }
  applyTranslations()
}

// ── nav ───────────────────────────────────────────────────────────────────────
function renderNav(categories, projects) {
  const nav = document.getElementById('filterNav')

  // find which categories actually have visible projects
  const usedCats = new Set(projects.map(p => p.category))

  // wire filter buttons (already in HTML)
  nav.querySelector('[data-filter="featured"]')?.addEventListener('click', () => setFilter('featured'))
  nav.querySelector('[data-filter="all"]')?.addEventListener('click',      () => setFilter('all'))

  // add category buttons only for categories that have projects
  categories.forEach(cat => {
    if (!usedCats.has(cat.id)) return
    const btn = document.createElement('button')
    btn.className = 'filter-btn'
    btn.dataset.filter = 'cat'
    btn.dataset.category = cat.id
    btn.textContent = cat.label
    btn.addEventListener('click', () => setFilter('cat', cat.id))
    nav.appendChild(btn)
  })
}

function setFilter(type, catId) {
  // highlight correct button
  document.querySelectorAll('.filter-btn').forEach(b => {
    const isActive =
      (type === 'featured' && b.dataset.filter === 'featured') ||
      (type === 'all'      && b.dataset.filter === 'all')      ||
      (type === 'cat'      && b.dataset.category === catId)
    b.classList.toggle('active', isActive)
  })

  let filtered
  if (type === 'featured') {
    filtered = allProjects.filter(p => p.featured)
  } else if (type === 'all') {
    filtered = allProjects
  } else {
    filtered = allProjects.filter(p => p.category === catId)
  }
  renderProjects(filtered)
}

// ── grid ──────────────────────────────────────────────────────────────────────
function catLabel(id) {
  const c = allCategories.find(c => c.id === id)
  return c ? c.label : id
}

function isVideo(url) {
  return /\.mp4(\?|$)/i.test(url)
}

function renderProjects(projects) {
  const grid = document.getElementById('projectsGrid')
  grid.innerHTML = ''
  if (!projects.length) {
    grid.innerHTML = `<p class="loading" data-i18n="noProjects">${t('noProjects')}</p>`
    return
  }
  projects.forEach(proj => {
    const thumbSrc = proj.images?.[0] && !isVideo(proj.images[0]) ? proj.images[0] : null
    const card = document.createElement('div')
    card.className = 'project-card'
    card.innerHTML = `
      <div class="card-thumb">
        ${thumbSrc ? `<img src="${thumbSrc}" alt="${proj.name}" loading="lazy" />` : ''}
        <div class="card-overlay">
          <div class="card-overlay-name">${proj.name}</div>
          <div class="card-overlay-cat">${catLabel(proj.category)}</div>
        </div>
      </div>
      <div class="card-label">
        <div class="project-name">${proj.name}</div>
        <div class="project-cat">${catLabel(proj.category)}</div>
      </div>`
    card.addEventListener('click', () => openProject(proj))
    grid.appendChild(card)
  })
}

// ── detail view ───────────────────────────────────────────────────────────────
async function openProjectBySlug(category, slug) {
  const proj = allProjects.find(p => p.category === category && p.slug === slug)
  if (proj) { openProject(proj); return }
  try {
    const p = await fetch(`/api/project?category=${category}&slug=${slug}`).then(r => r.json())
    openProject(p)
  } catch (_) { showGrid() }
}

function openProject(proj) {
  history.pushState({ projId: proj.id }, '', `/project/${proj.category}/${proj.slug}`)
  document.title = `${proj.name} — Peter Hoff Design`
  document.getElementById('detailName').textContent = proj.name
  document.getElementById('detailCat').textContent  = catLabel(proj.category)

  const gallery = document.getElementById('detailGallery')
  gallery.innerHTML = ''

  // build lbImages + lbCredits from non-video items only
  lbImages  = (proj.images || []).filter(u => !isVideo(u))
  lbCredits = lbImages.map(u => (proj.credits || {})[u] || '')
  let lbIdx = 0  // tracks index within lbImages

  const n = proj.images.length
  gallery.classList.toggle('is-single', n === 1)

  proj.images.forEach((src) => {
    const wrap = document.createElement('div')
    if (isVideo(src)) {
      wrap.className = 'gallery-img-wrap'
      const vid = document.createElement('video')
      vid.src        = src
      vid.autoplay   = true
      vid.muted      = true
      vid.loop       = true
      vid.playsInline = true
      vid.style.cssText = 'width:100%;height:auto;display:block'
      wrap.appendChild(vid)
    } else {
      wrap.className = 'gallery-img-wrap'
      const img = document.createElement('img')
      img.src   = src
      img.alt   = proj.name
      img.onerror = () => { wrap.style.display = 'none' }
      const capturedIdx = lbIdx++
      img.addEventListener('click', () => openLightbox(capturedIdx))
      wrap.appendChild(img)
      const credit = (proj.credits || {})[src]
      if (credit) {
        const cap = document.createElement('div')
        cap.className   = 'gallery-caption'
        cap.textContent = credit
        wrap.appendChild(cap)
      }
    }
    gallery.appendChild(wrap)
  })

  // ── Location map ────────────────────────────────────────────────────────────
  const mapSection = document.getElementById('detailMap')
  if (proj.location && proj.location.trim()) {
    const mapUrl = 'https://maps.google.com/maps?q=' + encodeURIComponent(proj.location.trim()) + '&output=embed&z=15'
    mapSection.innerHTML = `
      <div class="map-label">
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
          <path d="M6 0C2.69 0 0 2.69 0 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.31-2.69-6-6-6zm0 8.5A2.5 2.5 0 1 1 6 3.5a2.5 2.5 0 0 1 0 5z"/>
        </svg>
        ${esc(proj.location)}
      </div>
      <div class="map-wrap">
        <iframe
          src="${mapUrl}"
          allowfullscreen
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          title="Karta: ${esc(proj.location)}">
        </iframe>
      </div>`
    mapSection.hidden = false
  } else {
    mapSection.hidden = true
    mapSection.innerHTML = ''
  }

  document.getElementById('detailOverlay').hidden = false
  document.getElementById('projectsGrid').style.display = 'none'
  window.scrollTo(0, 0)
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function showGrid() {
  document.getElementById('detailOverlay').hidden = true
  document.getElementById('projectsGrid').style.display = ''
  document.title = 'Peter Hoff Design AB'
}

document.getElementById('detailBack').addEventListener('click', () => {
  history.pushState({}, '', '/')
  showGrid()
})

window.addEventListener('popstate', () => {
  const match = location.pathname.match(/^\/project\/([^/]+)\/([^/]+)/)
  if (match) {
    const [, cat, slug] = match
    openProjectBySlug(cat, slug)
  } else {
    showGrid()
  }
})

// ── lightbox ──────────────────────────────────────────────────────────────────
function setLbCaption(i) {
  const el = document.getElementById('lbCaption')
  if (el) el.textContent = lbCredits[i] || ''
}
function openLightbox(index) {
  lbIndex = index
  document.getElementById('lightbox').hidden = false
  document.getElementById('lbImg').src = lbImages[lbIndex]
  setLbCaption(lbIndex)
}
function closeLightbox() { document.getElementById('lightbox').hidden = true }
function lbStep(dir) {
  if (!lbImages.length) return
  lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length
  document.getElementById('lbImg').src = lbImages[lbIndex]
  setLbCaption(lbIndex)
}

document.getElementById('lbClose').addEventListener('click', closeLightbox)
document.getElementById('lbPrev').addEventListener('click', () => lbStep(-1))
document.getElementById('lbNext').addEventListener('click', () => lbStep(1))
document.getElementById('lightbox').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeLightbox()
})
document.addEventListener('keydown', e => {
  if (!document.getElementById('lightbox').hidden) {
    if (e.key === 'Escape')      closeLightbox()
    if (e.key === 'ArrowLeft')   lbStep(-1)
    if (e.key === 'ArrowRight')  lbStep(1)
  }
})

// Touch swipe for lightbox
let _touchX = 0
const lb = document.getElementById('lightbox')
lb.addEventListener('touchstart', e => { _touchX = e.touches[0].clientX }, { passive: true })
lb.addEventListener('touchend',   e => {
  const dx = e.changedTouches[0].clientX - _touchX
  if (Math.abs(dx) > 50) lbStep(dx < 0 ? 1 : -1)
}, { passive: true })

// ── footer ────────────────────────────────────────────────────────────────────
function renderContact(c, settings) {
  const footer = document.getElementById('siteFooter')
  footer.id = 'contact'   // anchor for nav link
  const bio = (settings && settings.bio) ? settings.bio.trim() : ''
  footer.innerHTML = `
    ${bio ? `<p class="contact-bio">${bio.replace(/\n/g, '<br>')}</p>` : ''}
    <p class="contact-company">${c.company}</p>
    <div class="contact-details">
      <span>${c.name}</span>
      <span>${c.address}, ${c.city}</span>
      <span><a href="tel:${c.phone.replace(/\s/g,'')}">${c.phone}</a></span>
      <span><a href="mailto:${c.email}">${c.email}</a></span>
      <span><a href="https://${c.website}" target="_blank" rel="noopener">${c.website}</a></span>
    </div>`

  // wire Kontakt nav link to scroll to footer
  document.getElementById('contactLink')?.addEventListener('click', e => {
    e.preventDefault()
    footer.scrollIntoView({ behavior: 'smooth' })
  })
}

// ── sticky header logo (appears when site-header scrolls out of view) ─────────
;(function() {
  const header    = document.querySelector('.site-header')
  const filterBar = document.getElementById('filterBar')
  if (!header || !filterBar) return

  // Use scrollY vs a cached pixel threshold — immune to iOS URL-bar viewport shifts
  let threshold = 0
  function calcThreshold() {
    threshold = header.offsetTop + header.offsetHeight
  }
  function update() {
    filterBar.classList.toggle('is-scrolled', window.scrollY >= threshold)
  }

  calcThreshold()
  update()
  window.addEventListener('scroll', update, { passive: true })
  // Recalculate if header reflows (orientation change, resize)
  window.addEventListener('resize', function() { calcThreshold(); update() }, { passive: true })
})()

// ── filter nav swipe hint (mobile only, runs once) ────────────────────────────
;(function() {
  if (window.matchMedia('(hover: hover)').matches) return  // skip desktop
  const nav = document.getElementById('filterNav')
  if (!nav) return
  setTimeout(() => {
    if (nav.scrollWidth <= nav.clientWidth + 10) return  // not scrollable, skip
    nav.scrollTo({ left: 72, behavior: 'smooth' })
    setTimeout(() => nav.scrollTo({ left: 0, behavior: 'smooth' }), 540)
  }, 900)
})()

// ── language picker ───────────────────────────────────────────────────────────
;(function() {
  const picker = document.getElementById('langPicker')
  if (!picker) return
  picker.value = currentLang
  picker.addEventListener('change', () => {
    currentLang = picker.value
    localStorage.setItem('phd_lang', currentLang)
    applyTranslations()
  })
})()

// ── ratio picker ──────────────────────────────────────────────────────────────
;(function() {
  const STORAGE_KEY = 'phd_thumb_ratio'
  const root = document.documentElement
  const btns = document.querySelectorAll('.ratio-btn')

  function applyRatio(ratio) {
    root.style.setProperty('--thumb-ratio', ratio)
    btns.forEach(b => b.classList.toggle('active', b.dataset.ratio === ratio))
    localStorage.setItem(STORAGE_KEY, ratio)
  }

  // restore saved ratio on page load
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) applyRatio(saved)

  btns.forEach(btn =>
    btn.addEventListener('click', () => applyRatio(btn.dataset.ratio))
  )
})()

init()
