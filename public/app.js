let allProjects   = []
let allCategories = []
let lbImages      = []
let lbCredits     = []
let lbIndex       = 0

// ── i18n ──────────────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  sv: {
    contact:'Kontakt', all:'Alla', loading:'Laddar…', noProjects:'Inga projekt hittades.', back:'← Tillbaka',
    'graphic-design':'Design', 'object-design':'Silversmide', 'architecture':'Arkitektur', 'exhibitions':'Utställningar', 'interiors':'Interiörer',
  },
  no: {
    contact:'Kontakt', all:'Alle', loading:'Laster…', noProjects:'Ingen prosjekter funnet.', back:'← Tilbake',
    'graphic-design':'Design', 'object-design':'Sølvsmie', 'architecture':'Arkitektur', 'exhibitions':'Utstillinger', 'interiors':'Interiører',
  },
  da: {
    contact:'Kontakt', all:'Alle', loading:'Indlæser…', noProjects:'Ingen projekter fundet.', back:'← Tilbage',
    'graphic-design':'Design', 'object-design':'Sølvsmede', 'architecture':'Arkitektur', 'exhibitions':'Udstillinger', 'interiors':'Interiører',
  },
  fi: {
    contact:'Yhteystiedot', all:'Kaikki', loading:'Ladataan…', noProjects:'Projekteja ei löydy.', back:'← Takaisin',
    'graphic-design':'Design', 'object-design':'Hopeasepäntyö', 'architecture':'Arkkitehtuuri', 'exhibitions':'Näyttelyt', 'interiors':'Sisustus',
  },
  en: {
    contact:'Contact', all:'All', loading:'Loading…', noProjects:'No projects found.', back:'← Back',
    'graphic-design':'Design', 'object-design':'Silversmithing', 'architecture':'Architecture', 'exhibitions':'Exhibitions', 'interiors':'Interiors',
  },
  fr: {
    contact:'Contact', all:'Tout', loading:'Chargement…', noProjects:'Aucun projet trouvé.', back:'← Retour',
    'graphic-design':'Design', 'object-design':'Argenterie', 'architecture':'Architecture', 'exhibitions':'Expositions', 'interiors':'Intérieurs',
  },
  es: {
    contact:'Contacto', all:'Todo', loading:'Cargando…', noProjects:'No se encontraron proyectos.', back:'← Volver',
    'graphic-design':'Diseño', 'object-design':'Platería', 'architecture':'Arquitectura', 'exhibitions':'Exposiciones', 'interiors':'Interiores',
  },
  pt: {
    contact:'Contacto', all:'Todos', loading:'A carregar…', noProjects:'Nenhum projeto encontrado.', back:'← Voltar',
    'graphic-design':'Design', 'object-design':'Ourivesaria', 'architecture':'Arquitectura', 'exhibitions':'Exposições', 'interiors':'Interiores',
  },
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
  return (TRANSLATIONS[currentLang] || TRANSLATIONS.en)[key]
      || TRANSLATIONS.en[key]
      || key
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n)
  })
  const picker = document.getElementById('langPicker')
  if (picker) picker.value = currentLang
  const mobilePicker = document.getElementById('mobileLangPicker')
  if (mobilePicker) mobilePicker.value = currentLang
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

  // Apply CMS appearance settings as CSS vars
  if (settings['logo-size']) {
    document.documentElement.style.setProperty('--logo-h', settings['logo-size'] + 'px')
  }

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
function showAll() {
  history.pushState({}, '', '/')
  document.title = 'Peter Hoff Design AB'
  document.getElementById('detailOverlay').hidden = true
  document.getElementById('projectsGrid').style.display = ''
  setFilter('all')
}

// Logo click → reset to all projects
;(function() {
  const link = document.getElementById('logoLink')
  if (link) link.addEventListener('click', e => { e.preventDefault(); showAll() })
})()

function renderNav(categories, projects) {
  const nav       = document.getElementById('filterNav')
  const mobileNav = document.getElementById('mobileMenuCats')

  // find which categories actually have visible projects
  const usedCats = new Set(projects.map(p => p.category))

  categories.forEach(cat => {
    if (!usedCats.has(cat.id)) return

    // Desktop filter button
    const btn = document.createElement('button')
    btn.className = 'filter-btn'
    btn.dataset.filter   = 'cat'
    btn.dataset.category = cat.id
    btn.dataset.i18n     = cat.id
    btn.textContent = t(cat.id)
    btn.addEventListener('click', () => setFilter('cat', cat.id))
    nav.appendChild(btn)

    // Mobile menu button (mirrors desktop)
    if (mobileNav) {
      const mBtn = document.createElement('button')
      mBtn.className = 'mobile-filter-btn'
      mBtn.dataset.filter   = 'cat'
      mBtn.dataset.category = cat.id
      mBtn.dataset.i18n     = cat.id
      mBtn.textContent = t(cat.id)
      mBtn.addEventListener('click', () => {
        setFilter('cat', cat.id)
        window._closeMobileMenu?.()
      })
      mobileNav.appendChild(mBtn)
    }
  })
}

function setFilter(type, catId) {
  // highlight correct button — both desktop and mobile mirrors
  document.querySelectorAll('.filter-btn, .mobile-filter-btn').forEach(b => {
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
    const images = (proj.images || []).filter(u => !isVideo(u))
    const card = document.createElement('div')
    card.className = 'project-card'
    const slidesHtml = images.map((src, i) =>
      `<img src="${esc(src)}" class="thumb-slide${i === 0 ? ' active' : ''}" alt="${esc(proj.name)}" loading="${i === 0 ? 'eager' : 'lazy'}" />`
    ).join('')
    card.innerHTML = `
      <div class="card-thumb">
        ${slidesHtml}
        <div class="card-overlay">
          <div class="card-overlay-name">${proj.name}</div>
          <div class="card-overlay-cat" data-i18n="${esc(proj.category)}">${t(proj.category)}</div>
        </div>
      </div>
      <div class="card-label">
        <div class="project-name">${proj.name}</div>
        <div class="project-cat" data-i18n="${esc(proj.category)}">${t(proj.category)}</div>
      </div>`
    card.addEventListener('click', () => openProject(proj))
    grid.appendChild(card)
    if (images.length > 1) initCardSlideshow(card, images.length)
  })
}

// ── thumbnail slideshow ───────────────────────────────────────────────────────
function initCardSlideshow(card, count) {
  let current = 0
  let timer   = null

  function advance() {
    const slides = card.querySelectorAll('.thumb-slide')
    slides[current].classList.remove('active')
    current = (current + 1) % count
    slides[current].classList.add('active')
    timer = setTimeout(advance, 6000)
  }

  // Start only when card enters viewport, pause when it leaves
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting && !timer) {
        timer = setTimeout(advance, 6000)   // first advance after 6 s
      } else if (!e.isIntersecting && timer) {
        clearTimeout(timer)
        timer = null
      }
    })
  }, { threshold: 0.1 })

  io.observe(card)
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
  document.getElementById('detailName').textContent  = proj.name
  const detailCatEl = document.getElementById('detailCat')
  detailCatEl.dataset.i18n = proj.category
  detailCatEl.textContent  = t(proj.category)

  const gallery = document.getElementById('detailGallery')
  gallery.innerHTML = ''

  // build lbImages + lbCredits from non-video items only
  lbImages  = (proj.images || []).filter(u => !isVideo(u))
  lbCredits = lbImages.map(u => (proj.credits || {})[u] || '')
  let lbIdx = 0  // tracks index within lbImages

  const n = proj.images.length
  gallery.classList.toggle('is-single', n === 1)
  gallery.style.gridTemplateColumns =
    n === 1 ? '1fr' :
    n === 2 ? 'repeat(2, 1fr)' :
    n === 3 ? 'repeat(3, 1fr)' :
    n === 4 ? 'repeat(2, 1fr)' :
    `repeat(auto-fill, minmax(${n <= 10 ? 340 : 260}px, 1fr))`

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

// ── header is now sticky — no secondary logo needed, no-op retained for safety ──
;(function() { /* filter-bar-logo logic removed: header is sticky */ })()

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

// ── language picker (desktop + mobile synced) ────────────────────────────────
;(function() {
  function changeLang(lang) {
    currentLang = lang
    localStorage.setItem('phd_lang', currentLang)
    applyTranslations()  // syncs both pickers via applyTranslations()
    // Re-render project cards so their inline category text updates
    const overlay = document.getElementById('detailOverlay')
    if (overlay && overlay.hidden) {
      const activeBtn = document.querySelector('.filter-btn.active, .mobile-filter-btn.active')
      if (activeBtn) {
        if (activeBtn.dataset.filter === 'cat') setFilter('cat', activeBtn.dataset.category)
        else setFilter(activeBtn.dataset.filter || 'all')
      }
    }
  }

  const picker = document.getElementById('langPicker')
  if (picker) {
    picker.value = currentLang
    picker.addEventListener('change', () => changeLang(picker.value))
  }

  const mobilePicker = document.getElementById('mobileLangPicker')
  if (mobilePicker) {
    mobilePicker.value = currentLang
    mobilePicker.addEventListener('change', () => {
      changeLang(mobilePicker.value)
      window._closeMobileMenu?.()
    })
  }
})()

// ── hamburger / mobile menu ───────────────────────────────────────────────────
;(function() {
  const hamburger = document.getElementById('navHamburger')
  const menu      = document.getElementById('mobileMenu')
  const backdrop  = document.getElementById('mobileMenuBackdrop')
  if (!hamburger || !menu || !backdrop) return

  function openMenu() {
    menu.classList.add('is-open')
    backdrop.classList.add('is-open')
    hamburger.setAttribute('aria-expanded', 'true')
    menu.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
  }

  function closeMenu() {
    menu.classList.remove('is-open')
    backdrop.classList.remove('is-open')
    hamburger.setAttribute('aria-expanded', 'false')
    menu.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
  }

  // Export close for use by category buttons populated later in init()
  window._closeMobileMenu = closeMenu

  hamburger.addEventListener('click', () =>
    menu.classList.contains('is-open') ? closeMenu() : openMenu()
  )
  backdrop.addEventListener('click', closeMenu)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu() })

  // Contact link in mobile menu → scroll to footer
  document.getElementById('mobileMenuContact')?.addEventListener('click', e => {
    e.preventDefault()
    closeMenu()
    setTimeout(() => {
      document.getElementById('siteFooter')?.scrollIntoView({ behavior: 'smooth' })
    }, 320)  // wait for menu slide-out
  })
})()

// ── ratio menus (multiple instances: main header + detail header) ─────────────
;(function() {
  const STORAGE_KEY = 'phd_thumb_ratio'
  const root = document.documentElement

  const ICONS = {
    '1/1':  '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="1"/></svg>',
    '4/3':  '<svg width="18" height="14" viewBox="0 0 18 14"><rect x="1" y="1" width="16" height="12" rx="1"/></svg>',
    '16/9': '<svg width="20" height="12" viewBox="0 0 20 12"><rect x="1" y="1" width="18" height="10" rx="1"/></svg>',
    '3/4':  '<svg width="14" height="18" viewBox="0 0 14 18"><rect x="1" y="1" width="12" height="16" rx="1"/></svg>',
    '9/16': '<svg width="12" height="20" viewBox="0 0 12 20"><rect x="1" y="1" width="10" height="18" rx="1"/></svg>',
  }

  // Close every open dropdown on the page
  function closeAll() {
    document.querySelectorAll('.ratio-dropdown').forEach(dd => {
      dd.hidden = true
    })
    document.querySelectorAll('.ratio-trigger').forEach(t => {
      t.setAttribute('aria-expanded', 'false')
    })
  }

  // Apply ratio: update CSS var, all buttons, all trigger icons
  function applyRatio(ratio) {
    root.style.setProperty('--thumb-ratio', ratio)
    document.querySelectorAll('.ratio-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.ratio === ratio)
    )
    if (ICONS[ratio]) {
      document.querySelectorAll('.ratio-trigger').forEach(t => {
        t.innerHTML = ICONS[ratio]
      })
    }
    localStorage.setItem(STORAGE_KEY, ratio)
  }

  // Wire each .ratio-menu independently
  document.querySelectorAll('.ratio-menu').forEach(menu => {
    const trigger  = menu.querySelector('.ratio-trigger')
    const dropdown = menu.querySelector('.ratio-dropdown')
    if (!trigger || !dropdown) return

    trigger.addEventListener('click', e => {
      e.stopPropagation()
      const opening = dropdown.hidden
      closeAll()
      if (opening) {
        dropdown.hidden = false
        trigger.setAttribute('aria-expanded', 'true')
      }
    })
  })

  // Ratio option clicks (all dropdowns)
  document.querySelectorAll('.ratio-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      applyRatio(btn.dataset.ratio)
      closeAll()
    })
  )

  // Close on outside click or Escape
  document.addEventListener('click', e => {
    if (!e.target.closest('.ratio-menu')) closeAll()
  })
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAll()
  })

  // Restore saved ratio on load
  applyRatio(localStorage.getItem(STORAGE_KEY) || '1/1')
})()

init()
