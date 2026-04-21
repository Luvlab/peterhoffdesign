const portfolio = require('../data/portfolio.json')

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.json(portfolio.categories)
}
