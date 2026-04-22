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

  renderNav(categories)
  renderContact(contact)

  // route on load
  const match = location.pathname.match(/^\/project\/([^/]+)\/([^/]+)/)
  if (match) {
    const [, cat, slug] = match
    await openProjectBySlug(cat, slug)
  } else {
    renderProjects(projects)
  }
}

// ── nav ───────────────────────────────────────────────────────────────────────
function renderNav(categories) {
  const nav = document.getElementById('filterNav')
  nav.querySelector('[data-category="all"]').addEventListener('click', () => setFilter('all'))
  categories.forEach(cat => {
    const btn = document.createElement('button')
    btn.className = 'filter-btn'
    btn.dataset.category = cat.id
    btn.textContent = cat.label
    btn.addEventListener('click', () => setFilter(cat.id))
    nav.appendChild(btn)
  })
}

function setFilter(categoryId) {
  document.querySelectorAll('.filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.category === categoryId)
  )
  const filtered = categoryId === 'all'
    ? allProjects
    : allProjects.filter(p => p.category === categoryId)
  renderProjects(filtered)
}

// ── grid ──────────────────────────────────────────────────────────────────────
function catLabel(id) {
  const c = allCategories.find(c => c.id === id)
  return c ? c.label : id
}

function renderProjects(projects) {
  const grid = document.getElementById('projectsGrid')
  grid.innerHTML = ''
  if (!projects.length) {
    grid.innerHTML = '<p class="loading">No projects found.</p>'
    return
  }
  projects.forEach(proj => {
    const card = document.createElement('div')
    card.className = 'project-card'
    card.innerHTML = `
      <span class="project-name">${proj.name}</span>
      <span class="project-category">${catLabel(proj.category)}</span>
      ${proj.images.length > 1 ? `<span class="project-count">${proj.images.length} images</span>` : ''}
    `
    card.addEventListener('click', () => openProject(proj))
    grid.appendChild(card)
  })
}

// ── detail view ───────────────────────────────────────────────────────────────
async function openProjectBySlug(category, slug) {
  const proj = allProjects.find(p => p.category === category && p.slug === slug)
  if (proj) { openProject(proj); return }
  // fallback: fetch from API
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
  lbImages = proj.images

  proj.images.forEach((src, i) => {
    const wrap = document.createElement('div')
    wrap.className = 'gallery-img-wrap'
    const img = document.createElement('img')
    img.src = src
    img.alt = `${proj.name} ${i + 1}`
    img.onerror = () => { wrap.style.display = 'none' }
    img.addEventListener('click', () => openLightbox(i))
    wrap.appendChild(img)
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
    if (e.key === 'Escape') closeLightbox()
    if (e.key === 'ArrowLeft')  lbStep(-1)
    if (e.key === 'ArrowRight') lbStep(1)
  }
})

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
    </div>
  `
}

init()
