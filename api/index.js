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

// public: live exchange rates (ECB reference rates via Frankfurter, base SEK) and the visitor's country for the currency guess.
// Cached 6 hours in memory; if the source is down the last good rates are used; with none, only SEK is offered.
let ratesCache = { at: 0, date: null, rates: null }
app.get('/api/links/rates', wrap(async (req, res) => {
  if (!ratesCache.rates || Date.now() - ratesCache.at > 6 * 3600 * 1000) {
    try {
      const r = await fetch('https://api.frankfurter.dev/v1/latest?base=SEK', { signal: AbortSignal.timeout(5000) })
      const j = await r.json()
      if (r.ok && j && j.rates && typeof j.rates === 'object') ratesCache = { at: Date.now(), date: j.date || null, rates: j.rates }
    } catch (e) { /* keep stale */ }
  }
  const country = (req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').toUpperCase().slice(0, 2)
  res.set('Cache-Control', 'private, max-age=600')
  res.json({ base: 'SEK', date: ratesCache.date, rates: ratesCache.rates || {}, country })
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
    config, total_sek: Number.isFinite(+total_sek) ? +total_sek : null,
    user_id: (await userFrom(req))?.id || null
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
    .update(pick(req.body || {}, ['status', 'admin_notes', 'tracking', 'provider'])).eq('id', req.params.id).select().single()
  if (error) throw error
  res.json(data)
}))

// ── Links: customer accounts (Supabase Auth, same sign-in as the admin but any email) ──
async function userFrom(req) {
  const auth = req.headers['authorization'] || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const { data: { user } = {}, error } = await supabase.auth.getUser(token)
  return error ? null : user
}
async function requireUser(req, res, next) {
  const user = await userFrom(req)
  if (!user) return res.status(401).json({ error: 'Logga in först.' })
  req.user = user
  next()
}
const hits = new Map()
function limited(req, key, ms) {            // very small per-IP rate limit
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'local'
  const k = key + ip, now = Date.now()
  if (now - (hits.get(k) || 0) < ms) return true
  hits.set(k, now); return false
}

// saved designs
app.get('/api/links/me/designs', requireUser, wrap(async (req, res) => {
  const { data, error } = await supabase.from('links_designs').select('id,name,state,total_sek,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  res.json(data)
}))
app.post('/api/links/me/designs', requireUser, wrap(async (req, res) => {
  const { name, state, config, total_sek } = req.body || {}
  if (!state || typeof state !== 'object' || JSON.stringify(state).length > 30000) return res.status(400).json({ error: 'Designen saknas.' })
  const { count } = await supabase.from('links_designs').select('id', { count: 'exact', head: true }).eq('user_id', req.user.id)
  if (count >= 100) return res.status(400).json({ error: 'Du har 100 sparade designer. Ta bort någon först.' })
  const { data, error } = await supabase.from('links_designs').insert({
    user_id: req.user.id, name: String(name || 'Min design').slice(0, 80), state, config: config || null,
    total_sek: Number.isFinite(+total_sek) ? +total_sek : null
  }).select('id,name,state,total_sek,created_at').single()
  if (error) throw error
  res.json(data)
}))
app.delete('/api/links/me/designs/:id', requireUser, wrap(async (req, res) => {
  const { error } = await supabase.from('links_designs').delete().eq('id', req.params.id).eq('user_id', req.user.id)
  if (error) throw error
  res.json({ ok: true })
}))
// the customer's own orders: placed while signed in, or with the same email address
app.get('/api/links/me/orders', requireUser, wrap(async (req, res) => {
  const cols = 'id,created_at,total_sek,status,tracking,config'
  const [a, b] = await Promise.all([
    supabase.from('links_orders').select(cols).eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(100),
    supabase.from('links_orders').select(cols).ilike('email', req.user.email || '-').order('created_at', { ascending: false }).limit(100)
  ])
  if (a.error) throw a.error; if (b.error) throw b.error
  const seen = new Set(), out = []
  for (const o of [...a.data, ...b.data]) if (!seen.has(o.id)) { seen.add(o.id); out.push({ id: o.id, created_at: o.created_at, total_sek: o.total_sek, status: o.status, tracking: o.tracking, links: o.config?.links, kind: o.config?.kind }) }
  out.sort((x, y) => (x.created_at < y.created_at ? 1 : -1))
  res.json(out)
}))

// message to a human (from the support window)
app.post('/api/links/messages', wrap(async (req, res) => {
  if (limited(req, 'msg', 20000)) return res.status(429).json({ error: 'Vänta en stund innan du skickar igen.' })
  const { name, email, message, transcript, lang, website } = req.body || {}
  if (website) return res.json({ ok: true })
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !message) return res.status(400).json({ error: 'Fyll i e-post och meddelande.' })
  const { error } = await supabase.from('links_messages').insert({
    user_id: (await userFrom(req))?.id || null, name: String(name || '').slice(0, 120), email: String(email).slice(0, 200),
    message: String(message).slice(0, 4000), lang: String(lang || '').slice(0, 8),
    transcript: Array.isArray(transcript) && JSON.stringify(transcript).length < 40000 ? transcript : null
  })
  if (error) throw error
  res.json({ ok: true })
}))

// AI support. Needs ANTHROPIC_API_KEY in the environment; without it the page offers the human form only.
const SUPPORT_SYSTEM = `You are the customer support assistant for Links by Peter Hoff Design, a Swedish jewellery designer in Stockholm.

About Links: bracelets and necklaces built from small links, about 18 x 18 x 6 mm, that click together with a snap joint (a small half-ball on one link clicks into a bowl on the next). The customer designs the piece in a 3D configurator at peterhoffdesign.com/links: bracelet or necklace, length, edge style (sharp, rounded, chamfer), a shape for every link (plus shapes, rings, a bar and H shapes), a material for every link, and optional inlays in links that have holes (gemstones, coloured glass or another material). Extra links can be bought later and clicked in, to change the size or to turn a bracelet into a necklace. The standard material is recycled PETG made from used bottles. Other choices include recycled fishing-net nylon, shell, wood, cork, coffee and hemp filled materials, and metals such as silver, gold, bronze, steel and titanium. Each piece is made to order.

Prices: the configurator shows an estimated price including shipping, and a per-link breakdown when the price is tapped. Prices are estimates until Peter Hoff Design confirms the order. Inlays are priced separately. Ordering currently sends an enquiry; there is no online payment yet, and Peter Hoff Design replies by email. Customers can sign in with their email address to save designs and see the status of their orders. A customer who wants a shape of their own can describe it in the enquiry form and will be contacted about a sketch or a 3D file.

How to answer: reply in the language the customer writes in. Be brief, warm and concrete. Only state what is written above or in the page context that follows. You do not know delivery times, return terms, stock, exact final prices or the status of a specific order: say so plainly and suggest sending a message to the team with the "message to a person" form in this window. Never invent policies, prices or dates, and never promise anything on behalf of Peter Hoff Design. If the customer is unhappy with an answer or asks for a person, point them to that form.`
let anthropic = null
app.post('/api/links/support', wrap(async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.json({ available: false })
  if (limited(req, 'sup', 2500)) return res.status(429).json({ error: 'Vänta ett ögonblick.' })
  const { messages, context } = req.body || {}
  if (!Array.isArray(messages) || !messages.length || messages.length > 30) return res.status(400).json({ error: 'Frågan saknas.' })
  const clean = messages.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
  if (!clean.length || clean[clean.length - 1].role !== 'user') return res.status(400).json({ error: 'Frågan saknas.' })
  if (!anthropic) { const Anthropic = require('@anthropic-ai/sdk'); anthropic = new Anthropic() }
  const system = [{ type: 'text', text: SUPPORT_SYSTEM, cache_control: { type: 'ephemeral' } }]
  if (context && typeof context === 'string') system.push({ type: 'text', text: 'Page context (what the customer has on screen right now):\n' + context.slice(0, 1500) })
  const r = await anthropic.beta.messages.create({
    model: process.env.LINKS_SUPPORT_MODEL || 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system, messages: clean
  })
  if (r.stop_reason === 'refusal') return res.json({ available: true, reply: null })
  const reply = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
  res.json({ available: true, reply: reply || null })
}))
app.get('/api/links/support', (req, res) => res.json({ available: !!process.env.ANTHROPIC_API_KEY }))

// admin: messages to a human
app.get('/api/admin/links/messages', requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from('links_messages').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  res.json(data)
}))
app.put('/api/admin/links/messages/:id', requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from('links_messages').update(pick(req.body || {}, ['status', 'admin_notes'])).eq('id', req.params.id).select().single()
  if (error) throw error
  res.json(data)
}))

// admin: print and CNC companies. Keys are never stored here: each company names the environment variable
// that holds its key in Vercel, and "connected" only says whether that variable is set.
const PROVIDER_FIELDS = ['name', 'kind', 'materials', 'api_status', 'docs_url', 'site_url', 'env_key', 'notes', 'active', 'sort']
const withConn = p => ({ ...p, connected: !!(p.env_key && /^[A-Z][A-Z0-9_]{2,60}$/.test(p.env_key) && process.env[p.env_key]) })
app.get('/api/admin/links/providers', requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from('links_providers').select('*').order('sort')
  if (error) throw error
  res.json(data.map(withConn))
}))
app.post('/api/admin/links/providers', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {}
  const id = String(b.id || b.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  if (!id || !b.name) return res.status(400).json({ error: 'Namn krävs' })
  const { data, error } = await supabase.from('links_providers').insert({ id, ...pick(b, PROVIDER_FIELDS) }).select().single()
  if (error) throw error
  res.json(withConn(data))
}))
app.put('/api/admin/links/providers/:id', requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from('links_providers')
    .update({ ...pick(req.body || {}, PROVIDER_FIELDS), updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single()
  if (error) throw error
  res.json(withConn(data))
}))
app.delete('/api/admin/links/providers/:id', requireAdmin, wrap(async (req, res) => {
  const { error } = await supabase.from('links_providers').delete().eq('id', req.params.id)
  if (error) throw error
  res.json({ ok: true })
}))

module.exports = app
