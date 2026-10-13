CREATE TABLE IF NOT EXISTS diagram_bundles (
  id text PRIMARY KEY,
  name text NOT NULL,
  color text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO diagram_bundles(id,name,color) VALUES ('shared','Shared diagrams','#6288e8') ON CONFLICT(id) DO NOTHING;
ALTER TABLE diagram_documents ADD COLUMN IF NOT EXISTS bundle_id text NOT NULL DEFAULT 'shared' REFERENCES diagram_bundles(id), ADD COLUMN IF NOT EXISTS name text;
