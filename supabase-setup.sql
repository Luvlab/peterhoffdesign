-- ── Run this in the Supabase SQL Editor ──────────────────────────────────────

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT    DEFAULT '',
  images      JSONB   DEFAULT '[]'::jsonb,
  visible     BOOLEAN DEFAULT TRUE,
  "order"     INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Public can read visible projects (used by the public site via anon key)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read" ON projects
  FOR SELECT USING (visible = TRUE);

CREATE POLICY "service_all" ON projects
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Storage ───────────────────────────────────────────────────────────────────
-- 1. Go to Storage → New bucket
--    Name: project-images   Public: ON
--
-- 2. Add these policies to the bucket (Storage → project-images → Policies):
--
--    Policy: "public read"
--      Operation: SELECT
--      Target roles: anon, authenticated
--      Policy: true
--
--    Policy: "service upload"
--      Operation: INSERT
--      Target roles: service_role
--      Policy: true
--
--    Policy: "service delete"
--      Operation: DELETE
--      Target roles: service_role
--      Policy: true
