/* ── State ─────────────────────────────────────────────────────────────────── */
let allProjects   = []
let allCategories = []
let currentCat    = 'all'
let editingId     = null   // null = new project
let rowSortable   = null
let imgSortable   = null

/* ── Panel helpers ──────────────────────────────────────────────────────────── */
function closePanels() {
  document.getElementById('helpPanel').hidden   = true
  document.getElementById('bioPanel').hidden    = true
  document.getElementById('appearPanel').hidden = true
}

/* ── Bootstrap ─────────────────────────────────────────────────────────────── */
async function init() {
  // Wait for auth guard to confirm a valid session & store a fresh token
  if (window._authReady) await window._authReady

  const [cats, projs, settings] = await Promise.all([
    fetch('/api/categories').then(r => r.json()),
    apiFetch('GET', '/api/admin/projects'),
    fetch('/api/settings').then(r => r.json()).catch(() => ({}))
  ])
  allCategories = cats
  allProjects   = projs
  buildCatTabs()
  buildCatSelect()
  renderTable()
  // Pre-fill bio textarea
  document.getElementById('bioTextarea').value = settings.bio || ''
  // Restore appearance settings
  if (settings['logo-size']) applyLogoSize(settings['logo-size'], false)
}

/* ── Category tabs ─────────────────────────────────────────────────────────── */
function buildCatTabs() {
  const container = document.getElementById('admCats')
  container.querySelector('[data-cat="all"]').addEventListener('click', () => setTab('all'))
  allCategories.forEach(c => {
    const btn = document.createElement('button')
    btn.className   = 'cat-tab'
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

/* ── Table ─────────────────────────────────────────────────────────────────── */
function catLabel(id) {
  const c = allCategories.find(c => c.id === id)
  return c ? c.label : id
}

function filteredProjects() {
  let list = currentCat === 'all' ? allProjects : allProjects.filter(p => p.category === currentCat)
  return [...list].sort((a, b) => a.order - b.order)
}

function renderTable() {
  const body     = document.getElementById('admBody')
  const empty    = document.getElementById('admEmpty')
  const table    = document.getElementById('admTable')
  const projects = filteredProjects()

  if (rowSortable) { rowSortable.destroy(); rowSortable = null }
  body.innerHTML = ''

  const total   = allProjects.length
  const visible = allProjects.filter(p => p.visible).length
  document.getElementById('admStats').textContent = `${total} projects · ${visible} visible`

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
      <td class="col-drag"><span class="drag-handle" title="Drag to reorder">⠿</span></td>
      <td class="col-vis">
        <label class="toggle">
          <input type="checkbox" class="vis-toggle" data-id="${proj.id}" ${proj.visible ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td class="col-name">
        <div class="proj-name">${esc(proj.name)}</div>
        <div class="proj-slug">${esc(proj.slug)}</div>
      </td>
      <td class="col-cat"><span class="cat-badge">${esc(catLabel(proj.category))}</span></td>
      <td class="col-imgs"><span class="img-count">${(proj.images || []).length}</span></td>
      <td class="col-actions">
        <button class="adm-btn--ghost star-btn ${proj.featured ? 'starred' : ''}" data-id="${proj.id}" title="${proj.featured ? 'Remove from featured' : 'Add to featured'}">★</button>
        <button class="adm-btn--ghost edit-btn" data-id="${proj.id}">Edit</button>
        <button class="adm-btn--ghost del del-btn" data-id="${proj.id}">✕</button>
      </td>`
    body.appendChild(tr)
  })

  body.querySelectorAll('.vis-toggle').forEach(cb =>
    cb.addEventListener('change', () => toggleVisibility(cb.dataset.id, cb.checked))
  )
  body.querySelectorAll('.star-btn').forEach(btn =>
    btn.addEventListener('click', () => toggleFeatured(btn.dataset.id))
  )
  body.querySelectorAll('.edit-btn').forEach(btn =>
    btn.addEventListener('click', () => openEdit(btn.dataset.id))
  )
  body.querySelectorAll('.del-btn').forEach(btn =>
    btn.addEventListener('click', () => promptDelete(btn.dataset.id))
  )

  rowSortable = Sortable.create(body, {
    animation: 150,
    handle: '.drag-handle',
    ghostClass: 'sortable-ghost',
    onEnd: saveRowOrder
  })
}

/* ── Visibility ────────────────────────────────────────────────────────────── */
async function toggleVisibility(id, visible) {
  try {
    await apiFetch('PUT', `/api/admin/projects/${id}`, { visible })
    const p = allProjects.find(p => p.id === id)
    if (p) p.visible = visible
    const tr = document.querySelector(`#admBody tr[data-id="${id}"]`)
    if (tr) tr.classList.toggle('hidden-row', !visible)
    const tot = allProjects.length
    const vis = allProjects.filter(p => p.visible).length
    document.getElementById('admStats').textContent = `${tot} projects · ${vis} visible`
    toast(visible ? 'Project visible' : 'Project hidden')
  } catch (err) { toast('Error: ' + err.message) }
}

/* ── Row reorder ───────────────────────────────────────────────────────────── */
async function saveRowOrder() {
  const rows  = [...document.querySelectorAll('#admBody tr[data-id]')]
  const items = rows.map((tr, i) => ({ id: tr.dataset.id, order: i }))
  items.forEach(({ id, order }) => {
    const p = allProjects.find(p => p.id === id)
    if (p) p.order = order
  })
  try {
    await apiFetch('PUT', '/api/admin/reorder', items)
    toast('Order saved')
  } catch (err) { toast('Reorder failed: ' + err.message) }
}

/* ── Modal open/close ──────────────────────────────────────────────────────── */
function openAdd() {
  closePanels()
  editingId = null
  document.getElementById('modalTitle').textContent = 'Add Project'
  document.getElementById('modalSave').textContent  = 'Create Project'
  document.getElementById('editId').value     = ''
  document.getElementById('fName').value      = ''
  document.getElementById('fSlug').value      = ''
  document.getElementById('fDesc').value      = ''
  document.getElementById('fLocation').value  = ''
  document.getElementById('fVisible').checked = true
  updateLocationMapPreview('')
  if (currentCat !== 'all') document.getElementById('fCat').value = currentCat
  else if (allCategories.length) document.getElementById('fCat').value = allCategories[0].id
  showModalTab('details')
  resetImageTab()
  document.getElementById('modalOverlay').hidden = false
}

function openEdit(id) {
  closePanels()
  const proj = allProjects.find(p => p.id === id)
  if (!proj) return
  editingId = id
  document.getElementById('modalTitle').textContent  = 'Edit Project'
  document.getElementById('modalSave').textContent   = 'Save Details'
  document.getElementById('editId').value            = proj.id
  document.getElementById('fName').value             = proj.name
  document.getElementById('fCat').value              = proj.category
  document.getElementById('fSlug').value             = proj.slug
  document.getElementById('fDesc').value             = proj.description || ''
  document.getElementById('fLocation').value         = proj.location || ''
  document.getElementById('fVisible').checked        = proj.visible
  updateLocationMapPreview(proj.location || '')
  showModalTab('details')
  renderImageTab(proj)
  document.getElementById('modalOverlay').hidden = false
}

function closeModal() {
  document.getElementById('modalOverlay').hidden = true
  editingId = null
  if (imgSortable) { imgSortable.destroy(); imgSortable = null }
}

/* ── Modal tab switching ───────────────────────────────────────────────────── */
function showModalTab(name) {
  document.querySelectorAll('.modal-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === name)
  )
  document.getElementById('tabDetails').hidden = name !== 'details'
  document.getElementById('tabImages').hidden  = name !== 'images'
}

document.querySelectorAll('.modal-tab').forEach(tab =>
  tab.addEventListener('click', () => showModalTab(tab.dataset.tab))
)

/* ── Build category select ─────────────────────────────────────────────────── */
function buildCatSelect() {
  const sel = document.getElementById('fCat')
  allCategories.forEach(c => {
    const opt = document.createElement('option')
    opt.value = c.id
    opt.textContent = c.label
    sel.appendChild(opt)
  })
}

/* ── Save details ──────────────────────────────────────────────────────────── */
async function saveDetails() {
  const name     = document.getElementById('fName').value.trim()
  const category = document.getElementById('fCat').value
  const slug     = document.getElementById('fSlug').value.trim()
  const desc     = document.getElementById('fDesc').value.trim()
  const location = document.getElementById('fLocation').value.trim()
  const visible  = document.getElementById('fVisible').checked

  if (!name || !category) { toast('Name and category are required'); return }

  const body = {
    name, category,
    slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    description: desc,
    location,
    visible
  }

  try {
    if (editingId) {
      const updated = await apiFetch('PUT', `/api/admin/projects/${editingId}`, body)
      const idx = allProjects.findIndex(p => p.id === editingId)
      if (idx !== -1) allProjects[idx] = { ...allProjects[idx], ...updated }
      toast('Project saved')
    } else {
      const created = await apiFetch('POST', '/api/admin/projects', body)
      allProjects.push(created)
      // switch to edit mode so images tab works
      editingId = created.id
      document.getElementById('editId').value = created.id
      document.getElementById('modalTitle').textContent = 'Edit Project'
      document.getElementById('modalSave').textContent  = 'Save Details'
      renderImageTab(created)
      toast('Project created — add images in the Images tab')
    }
    renderTable()
  } catch (err) { toast('Error: ' + err.message) }
}

/* ── Delete ────────────────────────────────────────────────────────────────── */
let _deleteId = null

function promptDelete(id) {
  const proj = allProjects.find(p => p.id === id)
  _deleteId  = id
  document.getElementById('confirmMsg').textContent =
    `Delete "${proj ? proj.name : id}" and all its images? This cannot be undone.`
  document.getElementById('confirmOverlay').hidden = false
}

async function doDelete() {
  if (!_deleteId) return
  try {
    await apiFetch('DELETE', `/api/admin/projects/${_deleteId}`)
    allProjects = allProjects.filter(p => p.id !== _deleteId)
    _deleteId = null
    document.getElementById('confirmOverlay').hidden = true
    renderTable()
    toast('Project deleted')
  } catch (err) { toast('Error: ' + err.message) }
}

/* ── Featured toggle ───────────────────────────────────────────────────────── */
async function toggleFeatured(id) {
  const proj = allProjects.find(p => p.id === id)
  if (!proj) return
  const newVal = !proj.featured
  try {
    await apiFetch('PUT', `/api/admin/projects/${id}`, { featured: newVal })
    proj.featured = newVal
    const btn = document.querySelector(`#admBody tr[data-id="${id}"] .star-btn`)
    if (btn) {
      btn.classList.toggle('starred', newVal)
      btn.title = newVal ? 'Remove from featured' : 'Add to featured'
    }
    toast(newVal ? '★ Added to featured' : '☆ Removed from featured')
  } catch (err) { toast('Error: ' + err.message) }
}

/* ── Image tab ─────────────────────────────────────────────────────────────── */
function resetImageTab() {
  document.getElementById('imgGrid').innerHTML = ''
  document.getElementById('imgEmpty').hidden   = false
  document.getElementById('tabImgCount').textContent = ''
  document.getElementById('uploadProgress').hidden   = true
  document.getElementById('uploadBar').style.width   = '0'
  if (imgSortable) { imgSortable.destroy(); imgSortable = null }
}

function renderImageTab(proj) {
  const images = proj.images || []
  document.getElementById('tabImgCount').textContent = images.length || ''
  document.getElementById('imgEmpty').hidden = images.length > 0

  const grid = document.getElementById('imgGrid')
  grid.innerHTML = ''
  const credits = proj.credits || {}
  images.forEach(url => grid.appendChild(makeThumb(url, proj.id, credits[url])))

  if (imgSortable) imgSortable.destroy()
  imgSortable = Sortable.create(grid, {
    handle: '.img-thumb-handle',
    animation: 150,
    ghostClass: 'sortable-img-ghost',
    onEnd: () => saveImageOrder(proj.id)
  })
}

function isVideo(url) { return /\.mp4(\?|$)/i.test(url) }

function makeThumb(url, projId, credit) {
  const div = document.createElement('div')
  div.className = 'img-thumb'
  div.dataset.url = url
  const media = isVideo(url)
    ? `<video src="${esc(url)}" muted loop playsinline preload="metadata"></video>`
    : `<img src="${esc(url)}" loading="lazy" alt="" />`
  div.innerHTML = `
    <div class="img-thumb-media">
      ${media}
      <div class="img-thumb-overlay">
        <button class="img-thumb-del" title="Delete">✕</button>
      </div>
    </div>
    <div class="img-thumb-footer">
      <span class="img-thumb-handle" title="Dra för att sortera">⠿</span>
      <input class="img-credit-input" type="text"
        placeholder="Fotograf / kredit"
        value="${esc(credit || '')}"
        data-url="${esc(url)}" />
    </div>`
  div.querySelector('.img-thumb-del').addEventListener('click', () => deleteImage(projId, url))
  div.querySelector('.img-credit-input').addEventListener('blur', () => saveCredits(projId))
  return div
}

function getCreditsFromGrid() {
  const credits = {}
  document.querySelectorAll('#imgGrid .img-credit-input').forEach(inp => {
    const val = inp.value.trim()
    if (val) credits[inp.dataset.url] = val
  })
  return credits
}

async function saveCredits(projId) {
  const credits = getCreditsFromGrid()
  try {
    const updated = await apiFetch('PUT', `/api/admin/projects/${projId}`, { credits })
    const p = allProjects.find(p => p.id === projId)
    if (p) p.credits = updated.credits || {}
    toast('Kredit sparad')
  } catch (err) { toast('Error: ' + err.message) }
}

async function saveImageOrder(projId) {
  const urls    = [...document.querySelectorAll('#imgGrid .img-thumb')].map(el => el.dataset.url)
  const credits = getCreditsFromGrid()
  try {
    const updated = await apiFetch('PUT', `/api/admin/projects/${projId}`, { images: urls, credits })
    const p = allProjects.find(p => p.id === projId)
    if (p) { p.images = updated.images || urls; p.credits = updated.credits || {} }
    renderTable()
  } catch (err) { toast('Reorder failed: ' + err.message) }
}

async function deleteImage(projId, url) {
  try {
    const updated = await apiFetch('DELETE', `/api/admin/projects/${projId}/images`, { url })
    const p = allProjects.find(p => p.id === projId)
    if (p) p.images = updated.images || []
    renderImageTab(p)
    renderTable()
    toast('Image deleted')
  } catch (err) { toast('Error: ' + err.message) }
}

/* ── Image upload ──────────────────────────────────────────────────────────── */
const uploadZone    = document.getElementById('uploadZone')
const imgFileInput  = document.getElementById('imgFileInput')
const uploadProgress = document.getElementById('uploadProgress')
const uploadBar     = document.getElementById('uploadBar')
const uploadStatus  = document.getElementById('uploadStatus')

uploadZone.addEventListener('dragover', e => {
  e.preventDefault()
  uploadZone.classList.add('drag-over')
})
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'))
uploadZone.addEventListener('drop', e => {
  e.preventDefault()
  uploadZone.classList.remove('drag-over')
  if (!editingId) { toast('Save the project first'); return }
  const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/') || f.type === 'video/mp4')
  if (files.length) uploadImages(editingId, files)
})

imgFileInput.addEventListener('change', () => {
  if (!editingId) { toast('Save the project first'); return }
  const files = [...imgFileInput.files]
  imgFileInput.value = ''
  if (files.length) uploadImages(editingId, files)
})

async function uploadImages(projId, files) {
  const token = await getToken()
  return new Promise(resolve => {
    const form = new FormData()
    files.forEach(f => form.append('images', f))

    uploadProgress.hidden       = false
    uploadBar.style.width       = '0'
    uploadStatus.textContent    = `Uploading 0%…`

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/admin/projects/${projId}/images`)
    xhr.setRequestHeader('Authorization', 'Bearer ' + token)

    xhr.upload.addEventListener('progress', e => {
      if (!e.lengthComputable) return
      const pct = Math.round(e.loaded / e.total * 100)
      uploadBar.style.width    = pct + '%'
      uploadStatus.textContent = `Uploading ${pct}%…`
    })

    xhr.addEventListener('load', () => {
      uploadProgress.hidden = true
      uploadBar.style.width = '0'
      if (xhr.status >= 200 && xhr.status < 300) {
        const updated = JSON.parse(xhr.responseText)
        const p = allProjects.find(p => p.id === projId)
        if (p) p.images = updated.images || []
        renderImageTab(p)
        renderTable()
        toast(`${files.length} image${files.length !== 1 ? 's' : ''} uploaded`)
      } else {
        const err = (() => { try { return JSON.parse(xhr.responseText) } catch { return {} } })()
        toast('Upload failed: ' + (err.error || `HTTP ${xhr.status}`))
      }
      resolve()
    })

    xhr.addEventListener('error', () => {
      uploadProgress.hidden = true
      toast('Upload failed: network error')
      resolve()
    })

    xhr.send(form)
  })
}

/* ── API helper ────────────────────────────────────────────────────────────── */
async function getToken() {
  // Try to get a live token from the Supabase client first (handles auto-refresh).
  // Write it back to localStorage AND refresh the auth cookie so middleware stays happy.
  if (window._sb) {
    try {
      const { data } = await window._sb.auth.getSession()
      if (data?.session?.access_token) {
        const token = data.session.access_token
        localStorage.setItem('phd_sb_token', token)
        document.cookie = 'phd_auth=' + token + '; path=/; max-age=3600; SameSite=Lax; Secure'
        return token
      }
    } catch (_) { /* fall through to stored token */ }
  }
  // Fallback: use the token stored at login / last successful refresh
  return localStorage.getItem('phd_sb_token') || ''
}

async function apiFetch(method, path, body) {
  const token = await getToken()
  const opts = { method, headers: { 'Authorization': 'Bearer ' + token } }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(path, opts)
  if (res.status === 401 || res.status === 403) {
    // Session expired — send to login
    location.replace('/admin-login')
    return
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

/* ── Toast ─────────────────────────────────────────────────────────────────── */
const toastEl = (() => {
  const el = document.createElement('div')
  el.className = 'toast'
  document.body.appendChild(el)
  return el
})()
let toastTimer

function toast(msg) {
  toastEl.textContent = msg
  toastEl.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500)
}

/* ── Utilities ─────────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

/* ── Location map preview ───────────────────────────────────────────────────── */
function updateLocationMapPreview(loc) {
  const preview = document.getElementById('locationMapPreview')
  if (!preview) return
  if (loc && loc.trim()) {
    const src = 'https://maps.google.com/maps?q=' + encodeURIComponent(loc.trim()) + '&output=embed&z=14'
    preview.innerHTML = `<iframe src="${src}" loading="lazy" allowfullscreen title="Karta"></iframe>`
    preview.hidden = false
  } else {
    preview.hidden = true
    preview.innerHTML = ''
  }
}

document.getElementById('fLocation').addEventListener('blur', function() {
  updateLocationMapPreview(this.value)
})

/* ── Help / Tutorial panel ─────────────────────────────────────────────────── */
document.getElementById('helpBtn').addEventListener('click', () => {
  const panel  = document.getElementById('helpPanel')
  const isOpen = !panel.hidden
  closePanels()
  if (!isOpen) panel.hidden = false
})

// Accordion: click anywhere on the header div to toggle
document.querySelectorAll('.help-section-hd').forEach(hd => {
  hd.addEventListener('click', () => {
    const section = hd.closest('.help-section')
    section.classList.toggle('is-open')
  })
})

/* ── Appearance panel ──────────────────────────────────────────────────────── */
function applyLogoSize(value, save = true) {
  const px = parseInt(value, 10)
  if (!px) return
  // Update preview image height
  const preview = document.getElementById('appearLogoPreview')
  if (preview) preview.style.height = px + 'px'
  // Highlight active preset button
  document.querySelectorAll('.size-btn[data-setting="logo-size"]').forEach(b =>
    b.classList.toggle('active', b.dataset.value === String(px))
  )
  // Save to DB
  if (save) {
    apiFetch('PUT', '/api/admin/settings', { 'logo-size': String(px) })
      .then(() => toast('Logo size saved'))
      .catch(err => toast('Error: ' + err.message))
  }
}

document.getElementById('appearBtn').addEventListener('click', () => {
  const panel  = document.getElementById('appearPanel')
  const isOpen = !panel.hidden
  closePanels()
  if (!isOpen) panel.hidden = false
})

document.querySelectorAll('.size-btn').forEach(btn =>
  btn.addEventListener('click', () => applyLogoSize(btn.dataset.value))
)

/* ── Bio panel ─────────────────────────────────────────────────────────────── */
document.getElementById('bioBtn').addEventListener('click', () => {
  const panel  = document.getElementById('bioPanel')
  const isOpen = !panel.hidden
  closePanels()
  if (!isOpen) panel.hidden = false
})
document.getElementById('bioCancelBtn').addEventListener('click', () => {
  document.getElementById('bioPanel').hidden = true
})
document.getElementById('bioSaveBtn').addEventListener('click', async () => {
  const bio = document.getElementById('bioTextarea').value.trim()
  try {
    await apiFetch('PUT', '/api/admin/settings', { bio })
    document.getElementById('bioPanel').hidden = true
    toast('Bio sparad')
  } catch (err) { toast('Error: ' + err.message) }
})

/* ── Wire events ───────────────────────────────────────────────────────────── */
document.getElementById('addBtn').addEventListener('click', openAdd)
document.getElementById('modalClose').addEventListener('click', closeModal)
document.getElementById('modalCancel').addEventListener('click', closeModal)
document.getElementById('modalSave').addEventListener('click', saveDetails)
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal()
})
document.getElementById('confirmNo').addEventListener('click', () => {
  document.getElementById('confirmOverlay').hidden = true
})
document.getElementById('confirmYes').addEventListener('click', doDelete)
document.getElementById('confirmOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('confirmOverlay').hidden = true
})

/* ── Logout ────────────────────────────────────────────────────────────────── */
document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (window._sb) await window._sb.auth.signOut().catch(() => {})
  localStorage.removeItem('phd_sb_token')
  // Expire the auth cookie so middleware blocks /admin immediately
  document.cookie = 'phd_auth=; path=/; max-age=0; SameSite=Lax; Secure'
  location.replace('/admin-login')
})

/* ── Start ─────────────────────────────────────────────────────────────────── */
init().catch(err => console.error('Admin init failed:', err))
