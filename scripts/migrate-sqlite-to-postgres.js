require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const SQLite = require("better-sqlite3");
const { createPool, initializeDatabase } = require("../src/database");

function sourceColumn(columns, name) {
  return columns.has(name) ? name : `NULL AS ${name}`;
}

async function migrate() {
  if (process.env.MIGRATE_CONFIRM !== "YES") {
    throw new Error(
      "Migração cancelada. Defina MIGRATE_CONFIRM=YES para confirmar que o PostgreSQL de destino pode ser substituído."
    );
  }

  const sourcePath = path.resolve(
    process.env.SQLITE_SOURCE_PATH || "./data/cha-lista.sqlite"
  );
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Banco SQLite não encontrado em: ${sourcePath}`);
  }

  const sqlite = new SQLite(sourcePath, { readonly: true, fileMustExist: true });
  const pool = createPool();

  try {
    const giftColumns = new Set(
      sqlite.prepare("PRAGMA table_info(gifts)").all().map((column) => column.name)
    );

    const settings = sqlite.prepare("SELECT * FROM settings WHERE id = 1").get();
    const gifts = sqlite.prepare(`
      SELECT
        id, name, description, category, image_url,
        ${sourceColumn(giftColumns, "image_attribution")},
        ${sourceColumn(giftColumns, "image_source_url")},
        desired_quantity, created_at, updated_at
      FROM gifts
      ORDER BY id
    `).all();
    const reservations = sqlite.prepare(`
      SELECT
        id, gift_id, guest_name, phone, quantity, status,
        created_at, cancelled_at
      FROM reservations
      ORDER BY id
    `).all();

    await initializeDatabase(pool);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("TRUNCATE reservations, gifts, settings RESTART IDENTITY CASCADE");

      if (settings) {
        await client.query(`
          INSERT INTO settings (
            id, event_title, family_name, welcome_message, updated_at
          )
          VALUES ($1, $2, $3, $4, $5)
        `, [
          settings.id,
          settings.event_title,
          settings.family_name,
          settings.welcome_message,
          settings.updated_at,
        ]);
      }

      for (const gift of gifts) {
        await client.query(`
          INSERT INTO gifts (
            id, name, description, category, image_url, image_attribution,
            image_source_url, desired_quantity, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          gift.id,
          gift.name,
          gift.description,
          gift.category,
          gift.image_url,
          gift.image_attribution,
          gift.image_source_url,
          gift.desired_quantity,
          gift.created_at,
          gift.updated_at,
        ]);
      }

      for (const reservation of reservations) {
        await client.query(`
          INSERT INTO reservations (
            id, gift_id, guest_name, phone, quantity, status,
            created_at, cancelled_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          reservation.id,
          reservation.gift_id,
          reservation.guest_name,
          reservation.phone,
          reservation.quantity,
          reservation.status,
          reservation.created_at,
          reservation.cancelled_at,
        ]);
      }

      await client.query(`
        SELECT setval(
          pg_get_serial_sequence('gifts', 'id'),
          COALESCE((SELECT MAX(id) FROM gifts), 1),
          EXISTS(SELECT 1 FROM gifts)
        )
      `);
      await client.query(`
        SELECT setval(
          pg_get_serial_sequence('reservations', 'id'),
          COALESCE((SELECT MAX(id) FROM reservations), 1),
          EXISTS(SELECT 1 FROM reservations)
        )
      `);

      await client.query("COMMIT");
      console.log(
        `Migração concluída: ${gifts.length} presentes e ${reservations.length} reservas importados.`
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    sqlite.close();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error("Falha na migração:", error.message);
  process.exit(1);
});
