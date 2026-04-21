const portfolio = require('../data/portfolio.json')

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  const { category } = req.query || {}
  const projects = category
    ? portfolio.projects.filter(p => p.category === category)
    : portfolio.projects
  res.json(projects)
}
