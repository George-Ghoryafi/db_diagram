CREATE TABLE IF NOT EXISTS diagram_documents (
  id text PRIMARY KEY,
  dbml text NOT NULL,
  revision text NOT NULL,
  layout jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS diagram_versions (
  id text NOT NULL REFERENCES diagram_documents(id),
  revision text NOT NULL,
  dbml text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, revision)
);
