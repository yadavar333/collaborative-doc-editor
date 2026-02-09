-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ── Documents ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title            VARCHAR(255) NOT NULL,
  content_snapshot TEXT         NOT NULL DEFAULT '',
  version          INTEGER      NOT NULL DEFAULT 0,
  created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ── Document membership ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_users (
  document_id UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  role        VARCHAR(10) NOT NULL CHECK (role IN ('editor', 'viewer')),
  PRIMARY KEY (document_id, user_id)
);

-- ── Operations ────────────────────────────────────────────────────────────────
-- Each row is one submitted OT operation at a specific document version.
-- The UNIQUE constraint prevents two ops from claiming the same version slot.
CREATE TABLE IF NOT EXISTS operations (
  id             UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID      NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id        UUID      NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  version        INTEGER   NOT NULL,
  operation_data JSONB     NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS idx_ops_doc_version ON operations (document_id, version);

-- ── Cursors ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cursors (
  document_id UUID      NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     UUID      NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  position    INTEGER   NOT NULL DEFAULT 0,
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (document_id, user_id)
);
