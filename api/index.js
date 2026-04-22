const express = require('express')
const store   = require('../lib/store')

const app = express()
app.use(express.json())

// ── helpers ──────────────────────────────────────────────────────────────────
function nextId(projects) {
  const ids = projects.map(p => parseInt(p.id.replace(/\D/g, ''), 10)).filter(Boolean)
  return 'p' + (ids.length ? Math.max(...ids) + 1 : Date.now())
}

// ── public endpoints ──────────────────────────────────────────────────────────
app.get('/api/contact', (req, res) => res.json(store.load().contact))
app.get('/api/categories', (req, res) => res.json(store.load().categories))

app.get('/api/projects', (req, res) => {
  const { category } = req.query
  let projects = store.load().projects.filter(p => p.visible)
  if (category) projects = projects.filter(p => p.category === category)
  projects = [...projects].sort((a, b) => a.order - b.order)
  res.json(projects)
})

app.get('/api/project', (req, res) => {
  const { id, slug, category } = req.query
  const projects = store.load().projects
  const proj = id
    ? projects.find(p => p.id === id)
    : projects.find(p => p.slug === slug && p.category === category)
  if (!proj) return res.status(404).json({ error: 'Not found' })
  res.json(proj)
})

// ── admin endpoints ───────────────────────────────────────────────────────────
app.get('/api/admin/projects', (req, res) => {
  const data = store.load()
  const { category } = req.query
  let projects = data.projects
  if (category) projects = projects.filter(p => p.category === category)
  projects = [...projects].sort((a, b) => a.order - b.order)
  res.json(projects)
})

app.post('/api/admin/projects', (req, res) => {
  const data = store.load()
  const { name, category, slug, description, images, visible } = req.body
  if (!name || !category) return res.status(400).json({ error: 'name and category required' })
  const catProjects = data.projects.filter(p => p.category === category)
  const maxOrder = catProjects.length ? Math.max(...catProjects.map(p => p.order)) : -1
  const project = {
    id: nextId(data.projects),
    name,
    category,
    slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    description: description || '',
    images: images || [],
    visible: visible !== false,
    order: maxOrder + 1
  }
  data.projects.push(project)
  store.save(data)
  res.status(201).json(project)
})

app.put('/api/admin/projects/:id', (req, res) => {
  const data = store.load()
  const idx = data.projects.findIndex(p => p.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  data.projects[idx] = { ...data.projects[idx], ...req.body, id: data.projects[idx].id }
  store.save(data)
  res.json(data.projects[idx])
})

app.delete('/api/admin/projects/:id', (req, res) => {
  const data = store.load()
  const idx = data.projects.findIndex(p => p.id === req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  data.projects.splice(idx, 1)
  store.save(data)
  res.json({ ok: true })
})

// body: [{ id, order }, ...]
app.put('/api/admin/reorder', (req, res) => {
  const data  = store.load()
  const items = req.body
  if (!Array.isArray(items)) return res.status(400).json({ error: 'Array expected' })
  items.forEach(({ id, order }) => {
    const p = data.projects.find(p => p.id === id)
    if (p) p.order = order
  })
  store.save(data)
  res.json({ ok: true })
})

module.exports = app
