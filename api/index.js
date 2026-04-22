require('dotenv').config()
const express = require('express')
const multer  = require('multer')
const db      = require('../lib/db')

const app    = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

// JSON body for non-multipart requests
app.use((req, res, next) => {
  if (req.is('multipart/form-data')) return next()
  express.json()(req, res, next)
})

const wrap = fn => (req, res) => fn(req, res).catch(err => {
  console.error(err)
  res.status(500).json({ error: err.message })
})

// ── public ───────────────────────────────────────────────────────────────────
app.get('/api/contact',    (req, res) => res.json(db.getContact()))
app.get('/api/categories', (req, res) => res.json(db.getCategories()))

app.get('/api/projects', wrap(async (req, res) => {
  const projects = await db.getProjects({
    category: req.query.category,
    featured:  req.query.featured === 'true' ? true : undefined
  })
  res.json(projects)
}))

app.get('/api/project', wrap(async (req, res) => {
  const { id, category, slug } = req.query
  const proj = await db.getProject(id ? { id } : { category, slug })
  res.json(proj)
}))

// ── admin — projects ─────────────────────────────────────────────────────────
app.get('/api/admin/projects', wrap(async (req, res) => {
  const projects = await db.getProjects({ category: req.query.category, visibleOnly: false })
  res.json(projects)
}))

app.post('/api/admin/projects', wrap(async (req, res) => {
  const { name, category, slug, description, images, visible } = req.body
  if (!name || !category) return res.status(400).json({ error: 'name and category required' })
  const existing = await db.getProjects({ category, visibleOnly: false })
  const maxOrder  = existing.length ? Math.max(...existing.map(p => p.order)) : -1
  const id = 'p' + Date.now()
  const project = await db.createProject({
    id,
    name,
    category,
    slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    description: description || '',
    images: images || [],
    visible: visible !== false,
    order: maxOrder + 1
  })
  res.status(201).json(project)
}))

app.put('/api/admin/projects/:id', wrap(async (req, res) => {
  const updated = await db.updateProject(req.params.id, req.body)
  res.json(updated)
}))

app.delete('/api/admin/projects/:id', wrap(async (req, res) => {
  // Also delete all images from storage
  try {
    const proj = await db.getProject({ id: req.params.id })
    await Promise.all((proj.images || []).map(url => db.deleteImage(url)))
  } catch (_) {}
  await db.deleteProject(req.params.id)
  res.json({ ok: true })
}))

app.put('/api/admin/reorder', wrap(async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Array expected' })
  await db.reorderProjects(req.body)
  res.json({ ok: true })
}))

// ── admin — images ────────────────────────────────────────────────────────────

// Upload one or more images; add to project's images array
app.post('/api/admin/projects/:id/images', upload.array('images', 50), wrap(async (req, res) => {
  const { id } = req.params
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' })

  const proj = await db.getProject({ id })
  const currentImages = proj.images || []

  const newUrls = await Promise.all(
    req.files.map(f => db.uploadImage(id, f.originalname, f.buffer, f.mimetype))
  )

  const updated = await db.updateProject(id, { images: [...currentImages, ...newUrls] })
  res.json(updated)
}))

// Delete a single image by URL
app.delete('/api/admin/projects/:id/images', wrap(async (req, res) => {
  const { id } = req.params
  const { url }  = req.body
  if (!url) return res.status(400).json({ error: 'url required' })

  await db.deleteImage(url)
  const proj    = await db.getProject({ id })
  const images  = (proj.images || []).filter(u => u !== url)
  const updated = await db.updateProject(id, { images })
  res.json(updated)
}))

// Save reordered image array
app.put('/api/admin/projects/:id/images', wrap(async (req, res) => {
  const { images } = req.body
  if (!Array.isArray(images)) return res.status(400).json({ error: 'images array required' })
  const updated = await db.updateProject(req.params.id, { images })
  res.json(updated)
}))

module.exports = app
