#!/usr/bin/env node
/**
 * One-time migration: downloads all images from peterhoffdesign.com
 * and uploads them to Supabase Storage, then seeds the projects table.
 *
 * Usage:
 *   1. cp .env.example .env  (and fill in SUPABASE_URL + SUPABASE_SERVICE_KEY)
 *   2. node scripts/migrate.js
 */
require('dotenv').config()
const fs        = require('fs')
const path      = require('path')
const { createClient } = require('@supabase/supabase-js')

const PORTFOLIO = require('../data/portfolio.json')
const BUCKET    = 'project-images'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }

function mimeFromUrl(url) {
  const ext = url.split('.').pop().split('?')[0].toLowerCase()
  return MIME[ext] || 'image/jpeg'
}

async function download(url) {
  const res = await fetch(url, {
    headers: { 'Referer': 'https://peterhoffdesign.com/', 'User-Agent': 'Mozilla/5.0' }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function uploadToSupabase(projectId, originalUrl) {
  const filename  = originalUrl.split('/').pop().replace(/\s+/g, '-')
  const storagePath = `${projectId}/${filename}`

  // Check if already uploaded
  const { data: existing } = await supabase.storage.from(BUCKET).list(projectId, {
    search: filename
  })
  if (existing?.length) {
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
    console.log(`    → already exists, skipping`)
    return publicUrl
  }

  const buffer = await download(originalUrl)
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mimeFromUrl(originalUrl),
    upsert: true
  })
  if (error) throw error

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return publicUrl
}

async function migrate() {
  console.log(`\n🚀  Migrating ${PORTFOLIO.projects.length} projects to Supabase…\n`)

  const updatedProjects = []

  for (const proj of PORTFOLIO.projects) {
    console.log(`▸  ${proj.name} (${proj.images.length} images)`)
    const newImages = []

    for (const url of proj.images) {
      process.stdout.write(`   ${url.split('/').pop()} … `)
      try {
        const newUrl = await uploadToSupabase(proj.id, url)
        newImages.push(newUrl)
        console.log('✓')
      } catch (err) {
        console.log(`✗  ${err.message} — keeping original`)
        newImages.push(url)
      }
      // small delay to avoid hammering peterhoffdesign.com
      await new Promise(r => setTimeout(r, 120))
    }

    // Upsert into Supabase DB
    const { error } = await supabase.from('projects').upsert({
      id:          proj.id,
      name:        proj.name,
      category:    proj.category,
      slug:        proj.slug,
      description: proj.description || '',
      images:      newImages,
      visible:     proj.visible,
      order:       proj.order
    })
    if (error) console.error(`   DB error: ${error.message}`)
    else console.log(`   ✓ DB saved\n`)

    updatedProjects.push({ ...proj, images: newImages })
  }

  // Update local portfolio.json with new URLs
  const updated = { ...PORTFOLIO, projects: updatedProjects }
  fs.writeFileSync(
    path.join(__dirname, '../data/portfolio.json'),
    JSON.stringify(updated, null, 2)
  )
  console.log('✓  data/portfolio.json updated with Supabase URLs')
  console.log('\n🎉  Migration complete!\n')
}

migrate().catch(err => { console.error(err); process.exit(1) })
