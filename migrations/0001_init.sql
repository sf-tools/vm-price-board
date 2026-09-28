CREATE TABLE snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id   TEXT    NOT NULL,
  created_at    TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('published', 'flagged', 'rejected')),
  price_changed INTEGER NOT NULL,
  pricing       TEXT    NOT NULL,
  changes       TEXT    NOT NULL,
  problems      TEXT    NOT NULL,
  confidence    TEXT    NOT NULL
);
CREATE INDEX snapshots_by_provider ON snapshots (provider_id, id DESC);

CREATE TABLE checks (
  provider_id    TEXT PRIMARY KEY,
  checked_at     TEXT    NOT NULL,
  ok             INTEGER NOT NULL,
  content_hash   TEXT,
  error          TEXT,
  failed_sources TEXT
);
