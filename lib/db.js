const supabase  = require('./supabase')
const portfolio = require('../data/portfolio.json')

const contact    = portfolio.contact
const categories = portfolio.categories

// ── contact / categories stay in JSON (never changes) ──────────────────────
function getContact()    { return contact }
function getCategories() { return categories }

// ── projects ────────────────────────────────────────────────────────────────
async function getProjects({ category, featured, visibleOnly = true } = {}) {
  let q = supabase.from('projects').select('*').order('order', { ascending: true })
  if (visibleOnly) q = q.eq('visible', true)
  if (category)    q = q.eq('category', category)
  if (featured)    q = q.eq('featured', true)
  const { data, error } = await q
  if (error) throw error
  return data
}

async function getProject({ id, category, slug } = {}) {
  let q = supabase.from('projects').select('*')
  q = id ? q.eq('id', id) : q.eq('category', category).eq('slug', slug)
  const { data, error } = await q.single()
  if (error) throw error
  return data
}

async function createProject(fields) {
  const { data, error } = await supabase.from('projects').insert(fields).select().single()
  if (error) throw error
  return data
}

async function updateProject(id, fields) {
  const { data, error } = await supabase.from('projects').update(fields).eq('id', id).select().single()
  if (error) throw error
  return data
}

async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

async function reorderProjects(items) {
  await Promise.all(
    items.map(({ id, order }) => supabase.from('projects').update({ order }).eq('id', id))
  )
}

// ── image helpers ────────────────────────────────────────────────────────────
const BUCKET = 'project-images'

function storagePathFromUrl(url) {
  const marker = `/object/public/${BUCKET}/`
  const idx    = url.indexOf(marker)
  return idx !== -1 ? decodeURIComponent(url.slice(idx + marker.length)) : null
}

async function uploadImage(projectId, filename, buffer, mimetype) {
  const path = `${projectId}/${Date.now()}-${filename.replace(/\s+/g, '-')}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimetype,
    upsert: false
  })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

async function deleteImage(url) {
  const path = storagePathFromUrl(url)
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path])
}

module.exports = {
  getContact, getCategories,
  getProjects, getProject, createProject, updateProject, deleteProject, reorderProjects,
  uploadImage, deleteImage
}
