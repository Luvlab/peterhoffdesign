const express = require('express')
const path    = require('path')
const apiApp  = require('./api/index')

const app = express()

app.use(express.static(path.join(__dirname, 'public')))
app.use(apiApp)

app.get('/project/*', (_, res) => res.sendFile(path.join(__dirname, 'public/index.html')))
app.get('/admin',     (_, res) => res.sendFile(path.join(__dirname, 'public/admin.html')))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`http://localhost:${PORT}`))
