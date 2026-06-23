CREATE TABLE IF NOT EXISTS settings (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  event_title TEXT NOT NULL,
  family_name TEXT NOT NULL,
  welcome_message TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gifts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  image_url TEXT,
  image_attribution TEXT,
  image_source_url TEXT,
  desired_quantity INTEGER CHECK (desired_quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
  id BIGSERIAL PRIMARY KEY,
  gift_id BIGINT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  phone TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reservations_gift_status
  ON reservations(gift_id, status);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

INSERT INTO settings (id, event_title, family_name, welcome_message)
VALUES (
  1,
  'Chá de bebê',
  'Um bebê muito amado está chegando!',
  'Escolha um presente com carinho. Sua presença já torna este momento ainda mais especial.'
)
ON CONFLICT (id) DO NOTHING;
