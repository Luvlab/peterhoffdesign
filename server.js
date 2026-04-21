const express = require('express')
const path = require('path')
const portfolio = require('./data/portfolio.json')

const app = express()

app.use(express.static(path.join(__dirname, 'public')))

app.get('/api/contact', (req, res) => res.json(portfolio.contact))
app.get('/api/categories', (req, res) => res.json(portfolio.categories))
app.get('/api/projects', (req, res) => {
  const { category } = req.query
  const projects = category
    ? portfolio.projects.filter(p => p.category === category)
    : portfolio.projects
  res.json(projects)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`http://localhost:${PORT}`))
