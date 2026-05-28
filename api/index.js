require('dotenv').config()
const express = require('express')
const multer  = require('multer')
const db      = require('../lib/db')
const { createClient } = require('@supabase/supabase-js')

const app    = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

// Supabase client using service key (server-side only)
const supabase = require('../lib/supabase')

// Allowed admin emails (comma-separated in env)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

// JSON body for non-multipart requests
app.use((req, res, next) => {
  if (req.is('multipart/form-data')) return next()
  express.json()(req, res, next)
})

const wrap = fn => (req, res) => fn(req, res).catch(err => {
  console.error(err)
  res.status(500).json({ error: err.message })
})

// ── auth middleware ──────────────────────────────────────────────────────────
async function requireAdmin(req, res, next) {
  const auth = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: 'No token' })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })

  const email = (user.email || '').toLowerCase()
  if (!ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ error: 'Not an admin' })
  }

  req.adminUser = user
  next()
}

// ── public config (anon key safe to expose) ──────────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl:  process.env.SUPABASE_URL  || '',
    supabaseKey:  process.env.SUPABASE_ANON_KEY || ''
  })
})

// ── geo language hint (uses Vercel's x-vercel-ip-country header) ─────────────
app.get('/api/geo', (req, res) => {
  const country = (req.headers['x-vercel-ip-country'] || '').toUpperCase()
  res.json({ country })
})

// ── public ───────────────────────────────────────────────────────────────────
app.get('/api/contact',    (req, res) => res.json(db.getContact()))
app.get('/api/categories', (req, res) => res.json(db.getCategories()))

app.get('/api/settings', wrap(async (req, res) => {
  const { data } = await supabase.from('site_settings').select('key,value')
  const obj = {}
  ;(data || []).forEach(r => { obj[r.key] = r.value })
  res.json(obj)
}))

// ── admin — settings ──────────────────────────────────────────────────────────
app.put('/api/admin/settings', requireAdmin, wrap(async (req, res) => {
  const entries = Object.entries(req.body || {})
  if (!entries.length) return res.status(400).json({ error: 'No settings provided' })
  await Promise.all(
    entries.map(([key, value]) =>
      supabase.from('site_settings').upsert({ key, value: String(value) })
    )
  )
  res.json({ ok: true })
}))

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
app.get('/api/admin/projects', requireAdmin, wrap(async (req, res) => {
  const projects = await db.getProjects({ category: req.query.category, visibleOnly: false })
  res.json(projects)
}))

app.post('/api/admin/projects', requireAdmin, wrap(async (req, res) => {
  const { name, category, slug, description, location, images, visible } = req.body
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
    location: location || '',
    images: images || [],
    visible: visible !== false,
    order: maxOrder + 1
  })
  res.status(201).json(project)
}))

app.put('/api/admin/projects/:id', requireAdmin, wrap(async (req, res) => {
  const updated = await db.updateProject(req.params.id, req.body)
  res.json(updated)
}))

app.delete('/api/admin/projects/:id', requireAdmin, wrap(async (req, res) => {
  try {
    const proj = await db.getProject({ id: req.params.id })
    await Promise.all((proj.images || []).map(url => db.deleteImage(url)))
  } catch (_) {}
  await db.deleteProject(req.params.id)
  res.json({ ok: true })
}))

app.put('/api/admin/reorder', requireAdmin, wrap(async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Array expected' })
  await db.reorderProjects(req.body)
  res.json({ ok: true })
}))

// ── admin — images ────────────────────────────────────────────────────────────
app.post('/api/admin/projects/:id/images', requireAdmin, upload.array('images', 50), wrap(async (req, res) => {
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

app.delete('/api/admin/projects/:id/images', requireAdmin, wrap(async (req, res) => {
  const { id } = req.params
  const { url }  = req.body
  if (!url) return res.status(400).json({ error: 'url required' })

  await db.deleteImage(url)
  const proj    = await db.getProject({ id })
  const images  = (proj.images || []).filter(u => u !== url)
  const updated = await db.updateProject(id, { images })
  res.json(updated)
}))

app.put('/api/admin/projects/:id/images', requireAdmin, wrap(async (req, res) => {
  const { images } = req.body
  if (!Array.isArray(images)) return res.status(400).json({ error: 'images array required' })
  const updated = await db.updateProject(req.params.id, { images })
  res.json(updated)
}))

module.exports = app
