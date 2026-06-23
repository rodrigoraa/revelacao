const { Pool } = require("pg");

const seedGifts = [
  {
    name: "Kit de fraldas tamanho P",
    description: "Pacotes de fraldas descartáveis para os primeiros meses.",
    category: "Fraldas",
    imageUrl: "/images/fraldas.svg",
    quantity: 4,
  },
  {
    name: "Kit de fraldas tamanho M",
    description: "Um presente que será muito usado no dia a dia.",
    category: "Fraldas",
    imageUrl: "/images/fraldas.svg",
    quantity: 6,
  },
  {
    name: "Body de algodão",
    description: "Preferência por cores suaves e tamanho de 3 a 6 meses.",
    category: "Roupinhas",
    imageUrl: "/images/body.svg",
    quantity: 5,
  },
  {
    name: "Kit de higiene",
    description: "Com potes, garrafa térmica e bandeja para o cantinho do bebê.",
    category: "Higiene",
    imageUrl: "/images/higiene.svg",
    quantity: 1,
  },
  {
    name: "Manta macia",
    description: "Manta leve e confortável para os passeios.",
    category: "Enxoval",
    imageUrl: "/images/manta.svg",
    quantity: 2,
  },
  {
    name: "Toalha com capuz",
    description: "Toalha infantil felpuda, de preferência em algodão.",
    category: "Banho",
    imageUrl: "/images/toalha.svg",
    quantity: 3,
  },
];

function createPool(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL não foi definida. Copie a conexão do Supabase para o arquivo .env."
    );
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);
  const sslEnabled = process.env.DATABASE_SSL !== "false" && !isLocal;

  return new Pool({
    connectionString: databaseUrl,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    max: Number(process.env.DATABASE_POOL_SIZE) || 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
}

async function initializeDatabase(pool, options = {}) {
  await pool.query(`
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
      desired_quantity INTEGER NOT NULL CHECK (desired_quantity > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id BIGSERIAL PRIMARY KEY,
      gift_id BIGINT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
      guest_name TEXT NOT NULL,
      phone TEXT,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cancelled_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_reservations_gift_status
      ON reservations(gift_id, status);
  `);

  await pool.query(`
    ALTER TABLE gifts
    ALTER COLUMN desired_quantity DROP NOT NULL
  `);

  if (options.enableRls !== false) {
    await pool.query(`
      ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
    `);
  }

  await pool.query(`
    INSERT INTO settings (id, event_title, family_name, welcome_message)
    VALUES (
      1,
      'Chá de bebê',
      'Um bebê muito amado está chegando!',
      'Escolha um presente com carinho. Sua presença já torna este momento ainda mais especial.'
    )
    ON CONFLICT (id) DO NOTHING
  `);

  const { rows } = await pool.query("SELECT COUNT(*)::integer AS total FROM gifts");
  if (rows[0].total === 0) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const gift of seedGifts) {
        await client.query(`
          INSERT INTO gifts (name, description, category, image_url, desired_quantity)
          VALUES ($1, $2, $3, $4, $5)
        `, [gift.name, gift.description, gift.category, gift.imageUrl, gift.quantity]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { createPool, initializeDatabase };
