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
// tolerate stray quotes and literal "\n" that sometimes end up in the env value
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .replace(/\\n/g, ',').replace(/["']/g, '')
  .split(/[,\s]+/).map(e => e.trim().toLowerCase()).filter(Boolean)

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
function parseCookie(header, name) {
  return (header || '').split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(name + '='))
    ?.slice(name.length + 1) || null
}

async function requireAdmin(req, res, next) {
  // 1. Bearer token (set explicitly by admin.js)
  const auth = req.headers['authorization'] || ''
  let token = auth.startsWith('Bearer ') ? auth.slice(7) : null

  // 2. phd_auth cookie — browser sends this automatically for same-origin
  //    fetches, so it works even if the in-memory token is stale or missing.
  if (!token) {
    token = parseCookie(req.headers['cookie'], 'phd_auth')
  }

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

// ── Links (cross + H link configurator) ─────────────────────────────────────
const LINK_MATERIAL_FIELDS = ['name','family','swatch','density','cost_per_kg','fee_per_link','supplier','url','notes','estimated','active','sort']
const LINK_SETTING_FIELDS  = ['machine_sek_per_hour','minutes_per_cross','minutes_per_h','labour_sek_per_hour','post_minutes_per_link','waste_percent','fixed_per_piece','markup_percent','vat_percent','shipping_sek','show_prices']
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k] !== undefined).map(k => [k, obj[k]]))

// public: active materials + pricing settings (prices only when show_prices is on)
app.get('/api/links/catalog', wrap(async (req, res) => {
  const [{ data: mats, error: e1 }, { data: set, error: e2 }] = await Promise.all([
    supabase.from('links_materials').select('*').eq('active', true).order('sort'),
    supabase.from('links_settings').select('*').eq('id', 1).single()
  ])
  if (e1) throw e1; if (e2) throw e2
  res.set('Cache-Control', 'public, max-age=60')
  if (!set.show_prices) return res.json({ showPrices: false, materials: mats.map(m => pick(m, ['id','name','family','swatch','density'])) })
  res.json({ showPrices: true, settings: pick(set, LINK_SETTING_FIELDS), materials: mats.map(m => pick({ id: m.id, ...m }, ['id', ...LINK_MATERIAL_FIELDS])) })
}))

// public: send an enquiry / order request from the configurator
const recentOrders = new Map()
app.post('/api/links/orders', wrap(async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'local'
  const now = Date.now(), last = recentOrders.get(ip) || 0
  if (now - last < 20000) return res.status(429).json({ error: 'Vänta en stund innan du skickar igen.' })
  const { name, email, message, config, total_sek, website } = req.body || {}
  if (website) return res.json({ ok: true })                       // honeypot
  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Fyll i namn och en giltig e-postadress.' })
  if (!config || typeof config !== 'object' || JSON.stringify(config).length > 20000) return res.status(400).json({ error: 'Konfigurationen saknas.' })
  recentOrders.set(ip, now)
  const { error } = await supabase.from('links_orders').insert({
    name: String(name).slice(0, 120), email: String(email).slice(0, 200), message: String(message || '').slice(0, 2000),
    config, total_sek: Number.isFinite(+total_sek) ? +total_sek : null
  })
  if (error) throw error
  res.json({ ok: true })
}))

// admin: materials
app.get('/api/admin/links/materials', requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from('links_materials').select('*').order('sort')
  if (error) throw error
  res.json(data)
}))
app.post('/api/admin/links/materials', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {}
  const id = String(b.id || b.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!id || !b.name || !b.density) return res.status(400).json({ error: 'Namn och densitet krävs' })
  const { data, error } = await supabase.from('links_materials').insert({ id, ...pick(b, LINK_MATERIAL_FIELDS) }).select().single()
  if (error) throw error
  res.json(data)
}))
app.put('/api/admin/links/materials/:id', requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from('links_materials')
    .update({ ...pick(req.body || {}, LINK_MATERIAL_FIELDS), updated_at: new Date().toISOString() })
    .eq('id', req.params.id).select().single()
  if (error) throw error
  res.json(data)
}))
app.delete('/api/admin/links/materials/:id', requireAdmin, wrap(async (req, res) => {
  const { error } = await supabase.from('links_materials').delete().eq('id', req.params.id)
  if (error) throw error
  res.json({ ok: true })
}))

// admin: pricing settings
app.get('/api/admin/links/settings', requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from('links_settings').select('*').eq('id', 1).single()
  if (error) throw error
  res.json(data)
}))
app.put('/api/admin/links/settings', requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from('links_settings')
    .update({ ...pick(req.body || {}, LINK_SETTING_FIELDS), updated_at: new Date().toISOString() })
    .eq('id', 1).select().single()
  if (error) throw error
  res.json(data)
}))

// admin: enquiries / orders
app.get('/api/admin/links/orders', requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from('links_orders').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  res.json(data)
}))
app.put('/api/admin/links/orders/:id', requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from('links_orders')
    .update(pick(req.body || {}, ['status', 'admin_notes'])).eq('id', req.params.id).select().single()
  if (error) throw error
  res.json(data)
}))

module.exports = app
