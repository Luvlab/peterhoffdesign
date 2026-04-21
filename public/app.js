let allProjects = []
let allCategories = []

async function init() {
  const [categories, projects, contact] = await Promise.all([
    fetch('/api/categories').then(r => r.json()),
    fetch('/api/projects').then(r => r.json()),
    fetch('/api/contact').then(r => r.json())
  ])

  allProjects = projects
  allCategories = categories

  renderNav(categories)
  renderProjects(projects)
  renderContact(contact)
}

function renderNav(categories) {
  const nav = document.getElementById('filterNav')

  const allBtn = nav.querySelector('[data-category="all"]')
  allBtn.addEventListener('click', () => setFilter('all'))

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
  document.querySelectorAll('.filter-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.category === categoryId)
  )

  const filtered = categoryId === 'all'
    ? allProjects
    : allProjects.filter(p => p.category === categoryId)

  renderProjects(filtered)
}

function catLabel(id) {
  const cat = allCategories.find(c => c.id === id)
  return cat ? cat.label : id
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
    `
    grid.appendChild(card)
  })
}

function renderContact(c) {
  document.getElementById('siteFooter').innerHTML = `
    <p class="contact-company">${c.company}</p>
    <div class="contact-details">
      <span>${c.name}</span>
      <span>${c.address}, ${c.city}</span>
      <span><a href="tel:${c.phone.replace(/\s/g, '')}">${c.phone}</a></span>
      <span><a href="mailto:${c.email}">${c.email}</a></span>
      <span><a href="https://${c.website}" target="_blank" rel="noopener">${c.website}</a></span>
    </div>
  `
}

init()
