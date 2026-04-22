let allProjects   = []
let allCategories = []
let lbImages      = []
let lbIndex       = 0

// ── bootstrap ────────────────────────────────────────────────────────────────
async function init() {
  const [categories, projects, contact] = await Promise.all([
    fetch('/api/categories').then(r => r.json()),
    fetch('/api/projects').then(r => r.json()),
    fetch('/api/contact').then(r => r.json())
  ])
  allProjects   = projects
  allCategories = categories

  renderNav(categories, projects)
  renderContact(contact)

  // route on load
  const match = location.pathname.match(/^\/project\/([^/]+)\/([^/]+)/)
  if (match) {
    const [, cat, slug] = match
    await openProjectBySlug(cat, slug)
  } else {
    // default to featured; fall back to all if none are marked featured
    const hasFeatured = projects.some(p => p.featured)
    setFilter(hasFeatured ? 'featured' : 'all')
  }
}

// ── nav ───────────────────────────────────────────────────────────────────────
function renderNav(categories, projects) {
  const nav = document.getElementById('filterNav')

  // find which categories actually have visible projects
  const usedCats = new Set(projects.map(p => p.category))

  // wire Featured + All buttons (already in HTML)
  nav.querySelector('[data-filter="featured"]').addEventListener('click', () => setFilter('featured'))
  nav.querySelector('[data-filter="all"]').addEventListener('click',      () => setFilter('all'))

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
    grid.innerHTML = '<p class="loading">No projects found.</p>'
    return
  }
  projects.forEach(proj => {
    const thumbSrc = proj.images?.[0] && !isVideo(proj.images[0]) ? proj.images[0] : null
    const card = document.createElement('div')
    card.className = 'project-card'
    card.innerHTML = `
      <div class="card-thumb">
        ${thumbSrc ? `<img src="${thumbSrc}" alt="${proj.name}" loading="lazy" />` : ''}
      </div>
      <div class="card-label">
        <div class="project-name">${proj.name}</div>
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

  // build lbImages from non-video items only
  lbImages = (proj.images || []).filter(u => !isVideo(u))
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
    }
    gallery.appendChild(wrap)
  })

  document.getElementById('detailOverlay').hidden = false
  document.getElementById('projectsGrid').style.display = 'none'
  window.scrollTo(0, 0)
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
function openLightbox(index) {
  lbIndex = index
  document.getElementById('lightbox').hidden = false
  document.getElementById('lbImg').src = lbImages[lbIndex]
}
function closeLightbox() { document.getElementById('lightbox').hidden = true }
function lbStep(dir) {
  if (!lbImages.length) return
  lbIndex = (lbIndex + dir + lbImages.length) % lbImages.length
  document.getElementById('lbImg').src = lbImages[lbIndex]
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
function renderContact(c) {
  document.getElementById('siteFooter').innerHTML = `
    <p class="contact-company">${c.company}</p>
    <div class="contact-details">
      <span>${c.name}</span>
      <span>${c.address}, ${c.city}</span>
      <span><a href="tel:${c.phone.replace(/\s/g,'')}">${c.phone}</a></span>
      <span><a href="mailto:${c.email}">${c.email}</a></span>
      <span><a href="https://${c.website}" target="_blank" rel="noopener">${c.website}</a></span>
    </div>`
}

init()
