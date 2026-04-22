let allProjects   = []
let allCategories = []
let currentCat    = 'all'
let sortable      = null

// ── bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  const [cats, projs] = await Promise.all([
    fetch('/api/categories').then(r => r.json()),
    fetch('/api/admin/projects').then(r => r.json())
  ])
  allCategories = cats
  allProjects   = projs

  buildCatTabs(cats)
  buildCatSelect(cats)
  renderTable()
  updateStats()
}

// ── category tabs ─────────────────────────────────────────────────────────────
function buildCatTabs(cats) {
  const container = document.getElementById('admCats')
  container.querySelector('[data-cat="all"]').addEventListener('click', () => setTab('all'))
  cats.forEach(c => {
    const btn = document.createElement('button')
    btn.className = 'cat-tab'
    btn.dataset.cat = c.id
    btn.textContent = c.label
    btn.addEventListener('click', () => setTab(c.id))
    container.appendChild(btn)
  })
}

function setTab(catId) {
  currentCat = catId
  document.querySelectorAll('.cat-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.cat === catId)
  )
  renderTable()
}

// ── table ─────────────────────────────────────────────────────────────────────
function catLabel(id) {
  const c = allCategories.find(c => c.id === id)
  return c ? c.label : id
}

function visibleProjects() {
  let list = currentCat === 'all'
    ? allProjects
    : allProjects.filter(p => p.category === currentCat)
  return [...list].sort((a, b) => a.order - b.order)
}

function renderTable() {
  const body    = document.getElementById('admBody')
  const empty   = document.getElementById('admEmpty')
  const table   = document.getElementById('admTable')
  const projects = visibleProjects()

  if (sortable) { sortable.destroy(); sortable = null }

  body.innerHTML = ''

  if (!projects.length) {
    table.hidden = true
    empty.hidden = false
    return
  }
  table.hidden = false
  empty.hidden = true

  projects.forEach(proj => {
    const tr = document.createElement('tr')
    tr.dataset.id = proj.id
    if (!proj.visible) tr.classList.add('hidden-row')
    tr.innerHTML = `
      <td><span class="drag-handle" title="Drag to reorder">⠿</span></td>
      <td>
        <label class="toggle" title="${proj.visible ? 'Click to hide' : 'Click to show'}">
          <input type="checkbox" class="vis-toggle" data-id="${proj.id}" ${proj.visible ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td>
        <div class="proj-name">${proj.name}</div>
        <div class="proj-slug">${proj.slug}</div>
      </td>
      <td><span class="cat-badge">${catLabel(proj.category)}</span></td>
      <td class="col-imgs"><span class="img-count">${proj.images.length}</span></td>
      <td class="col-actions">
        <button class="adm-btn--ghost edit-btn" data-id="${proj.id}" title="Edit">Edit</button>
        <button class="adm-btn--ghost del adm-btn--ghost del-btn" data-id="${proj.id}" title="Delete">✕</button>
      </td>
    `
    body.appendChild(tr)
  })

  // visibility toggles
  body.querySelectorAll('.vis-toggle').forEach(cb => {
    cb.addEventListener('change', () => toggleVisibility(cb.dataset.id, cb.checked))
  })
  // edit buttons
  body.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id))
  })
  // delete buttons
  body.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id))
  })

  // drag-and-drop (within current category view)
  sortable = Sortable.create(body, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    onEnd: onReorder
  })
}

function updateStats() {
  const total   = allProjects.length
  const visible = allProjects.filter(p => p.visible).length
  document.getElementById('admStats').textContent = `${total} projects · ${visible} visible`
}

// ── toggle visibility ─────────────────────────────────────────────────────────
async function toggleVisibility(id, visible) {
  await fetch(`/api/admin/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visible })
  })
  const proj = allProjects.find(p => p.id === id)
  if (proj) proj.visible = visible
  // update row style
  const tr = document.querySelector(`tr[data-id="${id}"]`)
  if (tr) tr.classList.toggle('hidden-row', !visible)
  updateStats()
  toast(visible ? 'Project visible' : 'Project hidden')
}

// ── reorder ───────────────────────────────────────────────────────────────────
async function onReorder() {
  const rows   = [...document.querySelectorAll('#admBody tr[data-id]')]
  const items  = rows.map((tr, i) => ({ id: tr.dataset.id, order: i }))
  items.forEach(({ id, order }) => {
    const p = allProjects.find(p => p.id === id)
    if (p) p.order = order
  })
  await fetch('/api/admin/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(items)
  })
  toast('Order saved')
}

// ── add / edit modal ──────────────────────────────────────────────────────────
function buildCatSelect(cats) {
  const sel = document.getElementById('fCat')
  cats.forEach(c => {
    const opt = document.createElement('option')
    opt.value = c.id
    opt.textContent = c.label
    sel.appendChild(opt)
  })
}

function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Add Project'
  document.getElementById('editId').value    = ''
  document.getElementById('fName').value     = ''
  document.getElementById('fSlug').value     = ''
  document.getElementById('fDesc').value     = ''
  document.getElementById('fImages').value   = ''
  document.getElementById('fVisible').checked = true
  if (currentCat !== 'all') document.getElementById('fCat').value = currentCat
  document.getElementById('modalOverlay').hidden = false
}

function openEditModal(id) {
  const proj = allProjects.find(p => p.id === id)
  if (!proj) return
  document.getElementById('modalTitle').textContent  = 'Edit Project'
  document.getElementById('editId').value            = proj.id
  document.getElementById('fName').value             = proj.name
  document.getElementById('fSlug').value             = proj.slug
  document.getElementById('fDesc').value             = proj.description || ''
  document.getElementById('fImages').value           = (proj.images || []).join('\n')
  document.getElementById('fCat').value              = proj.category
  document.getElementById('fVisible').checked        = proj.visible
  document.getElementById('modalOverlay').hidden     = false
}

function closeModal() {
  document.getElementById('modalOverlay').hidden = true
}

async function saveModal() {
  const id      = document.getElementById('editId').value
  const name    = document.getElementById('fName').value.trim()
  const category= document.getElementById('fCat').value
  const slug    = document.getElementById('fSlug').value.trim()
  const desc    = document.getElementById('fDesc').value.trim()
  const images  = document.getElementById('fImages').value.split('\n').map(s => s.trim()).filter(Boolean)
  const visible = document.getElementById('fVisible').checked

  if (!name || !category) { alert('Name and category are required.'); return }

  if (id) {
    // update
    const res  = await fetch(`/api/admin/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, slug: slug || undefined, description: desc, images, visible })
    })
    const updated = await res.json()
    const idx = allProjects.findIndex(p => p.id === id)
    if (idx !== -1) allProjects[idx] = updated
    toast('Project updated')
  } else {
    // create
    const res  = await fetch('/api/admin/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, slug: slug || undefined, description: desc, images, visible })
    })
    const created = await res.json()
    allProjects.push(created)
    toast('Project added')
  }

  closeModal()
  renderTable()
  updateStats()
}

// ── delete ────────────────────────────────────────────────────────────────────
let _deleteId = null

function confirmDelete(id) {
  const proj = allProjects.find(p => p.id === id)
  _deleteId = id
  document.getElementById('confirmMsg').textContent =
    `Delete "${proj ? proj.name : id}"? This cannot be undone.`
  document.getElementById('confirmOverlay').hidden = false
}

async function doDelete() {
  if (!_deleteId) return
  await fetch(`/api/admin/projects/${_deleteId}`, { method: 'DELETE' })
  allProjects = allProjects.filter(p => p.id !== _deleteId)
  _deleteId = null
  document.getElementById('confirmOverlay').hidden = true
  renderTable()
  updateStats()
  toast('Project deleted')
}

// ── toast ─────────────────────────────────────────────────────────────────────
function toast(msg) {
  let el = document.getElementById('toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast'
    el.className = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), 2200)
}

// ── wire events ───────────────────────────────────────────────────────────────
document.getElementById('addBtn').addEventListener('click', openAddModal)
document.getElementById('modalClose').addEventListener('click', closeModal)
document.getElementById('modalCancel').addEventListener('click', closeModal)
document.getElementById('modalSave').addEventListener('click', saveModal)
document.getElementById('confirmNo').addEventListener('click', () => {
  document.getElementById('confirmOverlay').hidden = true
})
document.getElementById('confirmYes').addEventListener('click', doDelete)
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal()
})

init()
