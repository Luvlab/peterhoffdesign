require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

async function run() {
  const { data, error } = await supabase.from('projects').select('id, name')
  if (error) throw error
  const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name, 'sv', { sensitivity: 'base' }))
  await Promise.all(sorted.map(({ id }, i) =>
    supabase.from('projects').update({ order: i }).eq('id', id)
  ))
  console.log(`✓ ${sorted.length} projects sorted alphabetically`)
  sorted.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`))
}
run().catch(err => { console.error(err); process.exit(1) })
