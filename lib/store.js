const fs = require('fs')
const path = require('path')

const SRC  = path.join(__dirname, '../data/portfolio.json')
const TMP  = '/tmp/phd-data.json'

let _cache = null

function load() {
  if (_cache) return _cache
  try {
    if (fs.existsSync(TMP)) {
      _cache = JSON.parse(fs.readFileSync(TMP, 'utf8'))
      return _cache
    }
  } catch (_) {}
  _cache = JSON.parse(fs.readFileSync(SRC, 'utf8'))
  return _cache
}

function save(data) {
  _cache = data
  try { fs.writeFileSync(TMP, JSON.stringify(data)) } catch (_) {}
  if (!process.env.VERCEL) {
    fs.writeFileSync(SRC, JSON.stringify(data, null, 2))
  }
}

module.exports = { load, save }
