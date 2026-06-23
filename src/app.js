const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const { createPool, initializeDatabase } = require("./database");
const { createAuth } = require("./auth");

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function text(value, field, { required = false, max = 500 } = {}) {
  const result = typeof value === "string" ? value.trim() : "";
  if (required && !result) throw new ApiError(400, `Preencha o campo ${field}.`);
  if (result.length > max) throw new ApiError(400, `${field} excede o limite de ${max} caracteres.`);
  return result || null;
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new ApiError(400, `${field} deve ser um número inteiro maior que zero.`);
  }
  return number;
}

function giftImageUrl(value) {
  const result = text(value, "imagem", { max: 500 });
  if (!result) return null;
  if (result.startsWith("/images/")) return result;

  try {
    const url = new URL(result);
    if (url.protocol === "http:" || url.protocol === "https:") return result;
  } catch {
    // A mensagem amigável abaixo cobre URLs inválidas.
  }
  throw new ApiError(400, "Informe uma URL de imagem válida (http, https ou /images/...).");
}

function externalHttpsUrl(value, field) {
  const result = text(value, field, { max: 800 });
  if (!result) return null;
  try {
    const url = new URL(result);
    if (url.protocol === "https:") return result;
  } catch {
    // A mensagem amigável abaixo cobre URLs inválidas.
  }
  throw new ApiError(400, `Informe uma URL HTTPS válida para ${field}.`);
}

function imageMetadata(body, imageUrl) {
  if (!imageUrl || imageUrl.startsWith("/images/")) {
    return { attribution: null, sourceUrl: null };
  }
  return {
    attribution: text(body.imageAttribution, "crédito da imagem", { max: 300 }),
    sourceUrl: externalHttpsUrl(body.imageSourceUrl, "origem da imagem"),
  };
}

function normalizeSearch(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function buildImageSearchProfile(value) {
  const query = normalizeSearch(value);
  const profiles = [
    {
      match: /\bfrald/,
      search: "diaper product baby",
      relevant: /\b(diaper|diapers|nappy|nappies|couche|pañal|fralda)\b/,
      reject: /\b(detergent|laundry|washing|soap|trash|meconium|airport|changing|change station)\b/,
      localImage: "/images/fraldas.svg",
      localTitle: "Ilustração de pacote de fraldas",
    },
    {
      match: /\bmamadeir|\bgarrafinha/,
      search: "baby bottle",
      relevant: /\b(baby bottle|baby bottles|feeding bottle|nursing bottle|bottle liner|bottle liners|mamadeira)\b/,
      reject: /\b(baby with|baby drinking|child|museum|cemetery|advertisement|button)\b/,
    },
    {
      match: /\bchupet/,
      search: "baby pacifier product",
      relevant: /\b(pacifier|dummy|soother|chupeta)\b/,
      reject: /\b(baby using|infant using|child using)\b/,
    },
    {
      match: /\bbody\b|\bmacacao/,
      search: "baby bodysuit clothing product",
      relevant: /\b(bodysuit|onesie|baby clothing|romper)\b/,
      reject: /\b(baby wearing|child wearing)\b/,
      localImage: "/images/body.svg",
      localTitle: "Ilustração de body infantil",
    },
    {
      match: /\bmanta|\bcobertor/,
      search: "baby blanket product",
      relevant: /\b(baby blanket|infant blanket|receiving blanket)\b/,
      reject: /\b(baby wrapped|child wrapped|with baby)\b/,
      localImage: "/images/manta.svg",
      localTitle: "Ilustração de manta para bebê",
    },
    {
      match: /\btoalha/,
      search: "baby hooded towel product",
      relevant: /\b(hooded towel|baby towel|infant towel)\b/,
      reject: /\b(baby wearing|child wearing)\b/,
      localImage: "/images/toalha.svg",
      localTitle: "Ilustração de toalha com capuz",
    },
    {
      match: /\bbanheir/,
      search: "baby bathtub product",
      relevant: /\b(baby bath|baby bathtub|infant bathtub|bath tub)\b/,
      reject: /\b(bathing baby|baby bathing|child bathing)\b/,
    },
    {
      match: /\bberco/,
      search: "baby crib furniture",
      relevant: /\b(crib|cot|baby bed|infant bed)\b/,
      reject: /\b(baby in|child in|infant in)\b/,
    },
    {
      match: /\bcarrinho/,
      search: "baby stroller",
      relevant: /\b(stroller|pushchair|pram|baby carriage)\b/,
      reject: /\b(baby on|baby at|baby in|child|children|concert|sisters|scene|ride)\b/,
    },
    {
      match: /\bbebe conforto|\bcadeirinha/,
      search: "infant car seat product",
      relevant: /\b(infant car seat|baby car seat|child safety seat)\b/,
      reject: /\b(baby in|child in|infant in)\b/,
    },
    {
      match: /\bsapato|\bsapatinho/,
      search: "baby shoes product",
      relevant: /\b(baby shoes|infant shoes|booties)\b/,
      reject: /\b(baby wearing|child wearing)\b/,
    },
    {
      match: /\bmeia/,
      search: "baby socks product",
      relevant: /\b(baby socks|infant socks)\b/,
      reject: /\b(baby wearing|child wearing)\b/,
    },
    {
      match: /\bkit.*higiene|\bhigiene/,
      search: "baby care toiletries product",
      relevant: /\b(baby care|baby toiletries|baby hygiene|toiletries)\b/,
      reject: /\b(bathing baby|baby bathing|baby care,)\b/,
      localImage: "/images/higiene.svg",
      localTitle: "Ilustração de kit de higiene",
    },
    {
      match: /\btermometro/,
      search: "baby thermometer product",
      relevant: /\b(baby thermometer|infant thermometer|digital thermometer)\b/,
      reject: /\b(using thermometer|temperature measurement)\b/,
    },
    {
      match: /\bbolsa|\bmochila/,
      search: "baby diaper bag product",
      relevant: /\b(diaper bag|nappy bag|baby bag)\b/,
      reject: /\b(person|woman|man|model)\b/,
    },
    {
      match: /\bbabador/,
      search: "baby bib product",
      relevant: /\b(baby bib|infant bib|bib)\b/,
      reject: /\b(baby wearing|child wearing)\b/,
    },
    {
      match: /\bbrinquedo|\bchocalho/,
      search: "baby rattle toy product",
      relevant: /\b(baby rattle|rattle toy|infant toy)\b/,
      reject: /\b(baby playing|child playing)\b/,
    },
  ];
  const profile = profiles.find((item) => item.match.test(query));
  if (profile) return profile;

  const words = query.split(/\s+/).filter((word) => word.length >= 3).slice(0, 4);
  const escaped = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return {
    search: `${value} baby product`,
    relevant: escaped.length ? new RegExp(`\\b(${escaped.join("|")})\\b`, "i") : /baby product/i,
    reject: /\b(person|woman|man|girl|boy|child using|baby using)\b/,
    localImage: "/images/presente.svg",
    localTitle: "Ilustração neutra de presente",
  };
}

function plainMetadata(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function giftStatus(desired, reserved) {
  if (reserved >= desired) return "sold_out";
  if (reserved > 0) return "partial";
  return "available";
}

function mapGift(row) {
  const reserved = Number(row.reserved_quantity || 0);
  const desired = Number(row.desired_quantity);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    imageUrl: row.image_url,
    imageAttribution: row.image_attribution,
    imageSourceUrl: row.image_source_url,
    desiredQuantity: desired,
    reservedQuantity: reserved,
    availableQuantity: Math.max(0, desired - reserved),
    status: giftStatus(desired, reserved),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function selectGifts(db) {
  const { rows } = await db.query(`
    SELECT
      g.*,
      COALESCE(r.reserved_quantity, 0) AS reserved_quantity
    FROM gifts g
    LEFT JOIN (
      SELECT gift_id, SUM(quantity) AS reserved_quantity
      FROM reservations
      WHERE status = 'active'
      GROUP BY gift_id
    ) r ON r.gift_id = g.id
    ORDER BY g.created_at ASC, g.id ASC
  `);
  return rows.map(mapGift);
}

async function selectGift(db, giftId) {
  const { rows } = await db.query(`
    SELECT
      g.*,
      COALESCE(r.reserved_quantity, 0) AS reserved_quantity
    FROM gifts g
    LEFT JOIN (
      SELECT gift_id, SUM(quantity) AS reserved_quantity
      FROM reservations
      WHERE status = 'active'
      GROUP BY gift_id
    ) r ON r.gift_id = g.id
    WHERE g.id = $1
  `, [giftId]);
  const row = rows[0];
  return row ? mapGift(row) : null;
}

async function getSettings(db) {
  const { rows } = await db.query("SELECT * FROM settings WHERE id = 1");
  const row = rows[0];
  return {
    eventTitle: row.event_title,
    familyName: row.family_name,
    welcomeMessage: row.welcome_message,
  };
}

async function createApp(options = {}) {
  const motherSpacePassword = options.motherSpacePassword || process.env.ESPACO_MAE_PASSWORD;
  const sessionSecret = options.sessionSecret || process.env.ESPACO_MAE_SESSION_SECRET || crypto.randomBytes(32).toString("hex");
  const isProduction = options.isProduction ?? process.env.NODE_ENV === "production";

  if (!motherSpacePassword) {
    throw new Error("ESPACO_MAE_PASSWORD não foi definida. Copie .env.example para .env e configure uma senha.");
  }

  const db = options.db || createPool(options.databaseUrl);
  await initializeDatabase(db, { enableRls: options.enableRls !== false });
  const auth = createAuth({
    password: motherSpacePassword,
    secret: sessionSecret,
    secureCookies: isProduction,
  });
  const imageSearchCache = new Map();

  const app = express();
  app.disable("x-powered-by");
  if (isProduction) app.set("trust proxy", 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", async (req, res) => {
    await db.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  });

  app.get("/api/settings", async (req, res) => {
    res.json(await getSettings(db));
  });

  app.get("/api/gifts", async (req, res) => {
    res.json({ gifts: await selectGifts(db) });
  });

  async function createReservation(giftId, guestName, phone, quantity) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const giftResult = await client.query(`
        SELECT id, desired_quantity
        FROM gifts
        WHERE id = $1
        FOR UPDATE
      `, [giftId]);
      const gift = giftResult.rows[0];
      if (!gift) throw new ApiError(404, "Este presente não foi encontrado.");

      const reservedResult = await client.query(`
        SELECT COALESCE(SUM(quantity), 0)::integer AS total
        FROM reservations
        WHERE gift_id = $1 AND status = 'active'
      `, [giftId]);
      const available = Number(gift.desired_quantity) - reservedResult.rows[0].total;

      if (available <= 0) {
        throw new ApiError(409, "Este presente acabou de ser totalmente reservado.", { available: 0 });
      }
      if (quantity > available) {
        throw new ApiError(
          409,
          `Há somente ${available} ${available === 1 ? "unidade disponível" : "unidades disponíveis"}.`,
          { available }
        );
      }

      const result = await client.query(`
        INSERT INTO reservations (gift_id, guest_name, phone, quantity)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [giftId, guestName, phone, quantity]);
      await client.query("COMMIT");
      return result.rows[0].id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  app.post("/api/reservations", async (req, res) => {
    const giftId = positiveInteger(req.body.giftId, "Presente");
    const guestName = text(req.body.guestName, "nome", { required: true, max: 120 });
    const phone = text(req.body.phone, "telefone", { max: 40 });
    const quantity = positiveInteger(req.body.quantity, "Quantidade");

    const reservationId = await createReservation(giftId, guestName, phone, quantity);
    res.status(201).json({
      message: "Presente reservado com sucesso. Obrigado pelo carinho!",
      reservationId,
      gift: await selectGift(db, giftId),
    });
  });

  const loginAttempts = new Map();
  app.post("/api/espaco-da-mae/login", (req, res) => {
    const ip = req.ip;
    const attempt = loginAttempts.get(ip);
    const now = Date.now();
    if (attempt?.blockedUntil > now) {
      return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
    }

    const password = typeof req.body.password === "string" ? req.body.password : "";
    const token = auth.login(password);
    if (!token) {
      const failures = attempt?.resetAt > now ? attempt.failures + 1 : 1;
      const blockedUntil = failures >= 5 ? now + 5 * 60 * 1000 : 0;
      loginAttempts.set(ip, { failures, blockedUntil, resetAt: now + 10 * 60 * 1000 });
      return res.status(401).json({ error: "Senha incorreta." });
    }

    loginAttempts.delete(ip);
    auth.setCookie(res, token);
    res.json({ authenticated: true });
  });

  app.post("/api/espaco-da-mae/logout", (req, res) => {
    auth.clearCookie(res);
    res.json({ authenticated: false });
  });

  app.get("/api/espaco-da-mae/session", (req, res) => {
    res.json({ authenticated: auth.hasValidSession(req) });
  });

  app.use("/api/espaco-da-mae", auth.requireMotherSpace);

  app.get("/api/espaco-da-mae/images/search", async (req, res) => {
    const query = text(req.query.q, "nome do presente", { required: true, max: 80 });
    if (query.length < 3) {
      throw new ApiError(400, "Digite pelo menos 3 letras para buscar imagens.");
    }

    const cacheKey = normalizeSearch(query);
    const cached = imageSearchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ images: cached.images });
    }

    const profile = buildImageSearchProfile(query);
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: profile.search,
      gsrnamespace: "6",
      gsrlimit: "30",
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
      iiurlwidth: "640",
      format: "json",
      formatversion: "2",
    });

    let response;
    try {
      response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
        headers: { "User-Agent": "ChaLista/1.0 (baby shower gift list)" },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new ApiError(502, "A busca de imagens demorou demais. Tente novamente.");
    }
    if (!response.ok) {
      throw new ApiError(502, "O serviço de imagens está indisponível no momento.");
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(502, "O serviço de imagens limitou temporariamente as buscas. Aguarde um instante.");
    }
    const remoteImages = (data.query?.pages || [])
      .map((page) => {
        const info = page.imageinfo?.[0];
        if (!info || !["image/jpeg", "image/png", "image/webp"].includes(info.mime)) return null;
        const title = page.title.replace(/^File:/i, "");
        const normalizedTitle = normalizeSearch(title);
        const metadataText = [
          plainMetadata(info.extmetadata?.ObjectName?.value),
          plainMetadata(info.extmetadata?.ImageDescription?.value),
          plainMetadata(info.extmetadata?.Categories?.value),
        ].join(" ");
        const normalizedMetadata = normalizeSearch(metadataText);
        const isKnownGift = Boolean(profile.match);
        const relevanceText = isKnownGift ? normalizedTitle : `${normalizedTitle} ${normalizedMetadata}`;
        if (!profile.relevant.test(relevanceText)) return null;
        if (profile.reject.test(`${normalizedTitle} ${normalizedMetadata}`)) return null;

        const creator = plainMetadata(info.extmetadata?.Artist?.value) || "Autor não informado";
        const license = plainMetadata(info.extmetadata?.LicenseShortName?.value) || "Ver licença na fonte";
        return {
          title,
          imageUrl: info.thumburl || info.url,
          sourceUrl: info.descriptionurl,
          attribution: `${creator} · ${license}`.slice(0, 300),
        };
      })
      .filter(Boolean)
      .slice(0, profile.localImage ? 7 : 8);

    const images = profile.localImage
      ? [{
          title: profile.localTitle,
          imageUrl: profile.localImage,
          sourceUrl: null,
          attribution: "Ilustração do sistema",
        }, ...remoteImages]
      : remoteImages;

    imageSearchCache.set(cacheKey, { images, expiresAt: Date.now() + 10 * 60 * 1000 });
    res.json({ images });
  });

  app.get("/api/espaco-da-mae/dashboard", async (req, res) => {
    const gifts = await selectGifts(db);
    const { rows: reservations } = await db.query(`
      SELECT id, gift_id, guest_name, phone, quantity, status, created_at, cancelled_at
      FROM reservations
      ORDER BY created_at DESC, id DESC
    `);

    const byGift = new Map();
    for (const reservation of reservations) {
      if (!byGift.has(reservation.gift_id)) byGift.set(reservation.gift_id, []);
      byGift.get(reservation.gift_id).push({
        id: reservation.id,
        guestName: reservation.guest_name,
        phone: reservation.phone,
        quantity: reservation.quantity,
        status: reservation.status,
        createdAt: reservation.created_at,
        cancelledAt: reservation.cancelled_at,
      });
    }

    res.json({
      settings: await getSettings(db),
      gifts: gifts.map((gift) => ({
        ...gift,
        reservations: byGift.get(gift.id) || [],
      })),
    });
  });

  app.put("/api/espaco-da-mae/settings", async (req, res) => {
    const eventTitle = text(req.body.eventTitle, "título do evento", { required: true, max: 100 });
    const familyName = text(req.body.familyName, "nome do bebê ou família", { required: true, max: 160 });
    const welcomeMessage = text(req.body.welcomeMessage, "mensagem inicial", { required: true, max: 600 });

    await db.query(`
      UPDATE settings
      SET event_title = $1, family_name = $2, welcome_message = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [eventTitle, familyName, welcomeMessage]);

    res.json({ message: "Informações atualizadas.", settings: await getSettings(db) });
  });

  app.post("/api/espaco-da-mae/gifts", async (req, res) => {
    const name = text(req.body.name, "nome do presente", { required: true, max: 160 });
    const description = text(req.body.description, "descrição", { max: 600 });
    const category = text(req.body.category, "categoria", { max: 80 });
    const imageUrl = giftImageUrl(req.body.imageUrl);
    const metadata = imageMetadata(req.body, imageUrl);
    const desiredQuantity = positiveInteger(req.body.desiredQuantity, "Quantidade desejada");

    const result = await db.query(`
      INSERT INTO gifts (
        name, description, category, image_url, image_attribution,
        image_source_url, desired_quantity
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      name, description, category, imageUrl, metadata.attribution,
      metadata.sourceUrl, desiredQuantity
    ]);

    res.status(201).json({
      message: "Presente adicionado.",
      gift: await selectGift(db, result.rows[0].id),
    });
  });

  app.put("/api/espaco-da-mae/gifts/:id", async (req, res) => {
    const giftId = positiveInteger(req.params.id, "Presente");
    const existing = await selectGift(db, giftId);
    if (!existing) throw new ApiError(404, "Presente não encontrado.");

    const name = text(req.body.name, "nome do presente", { required: true, max: 160 });
    const description = text(req.body.description, "descrição", { max: 600 });
    const category = text(req.body.category, "categoria", { max: 80 });
    const imageUrl = giftImageUrl(req.body.imageUrl);
    const metadata = imageMetadata(req.body, imageUrl);
    const desiredQuantity = positiveInteger(req.body.desiredQuantity, "Quantidade desejada");

    if (desiredQuantity < existing.reservedQuantity) {
      throw new ApiError(
        409,
        `A quantidade não pode ser menor que as ${existing.reservedQuantity} unidades já reservadas.`
      );
    }

    await db.query(`
      UPDATE gifts
      SET name = $1, description = $2, category = $3, image_url = $4,
          image_attribution = $5, image_source_url = $6, desired_quantity = $7,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `, [
      name, description, category, imageUrl, metadata.attribution,
      metadata.sourceUrl, desiredQuantity, giftId
    ]);

    res.json({ message: "Presente atualizado.", gift: await selectGift(db, giftId) });
  });

  app.delete("/api/espaco-da-mae/gifts/:id", async (req, res) => {
    const giftId = positiveInteger(req.params.id, "Presente");
    const gift = await selectGift(db, giftId);
    if (!gift) throw new ApiError(404, "Presente não encontrado.");
    if (gift.reservedQuantity > 0) {
      throw new ApiError(409, "Cancele as reservas ativas antes de remover este presente.");
    }

    await db.query("DELETE FROM gifts WHERE id = $1", [giftId]);
    res.json({ message: "Presente removido." });
  });

  app.delete("/api/espaco-da-mae/reservations/:id", async (req, res) => {
    const reservationId = positiveInteger(req.params.id, "Reserva");
    const result = await db.query(`
      UPDATE reservations
      SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'active'
    `, [reservationId]);

    if (result.rowCount === 0) {
      throw new ApiError(404, "Reserva ativa não encontrada.");
    }
    res.json({ message: "Reserva cancelada e quantidade liberada." });
  });

  const publicDirectory = path.join(__dirname, "..", "public");
  app.use(express.static(publicDirectory, {
    extensions: ["html"],
    maxAge: isProduction ? "1h" : 0,
  }));
  app.get("/espaco-da-mae", (req, res) => {
    res.sendFile(path.join(publicDirectory, "espaco-da-mae.html"));
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Rota não encontrada." });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof ApiError) {
      return res.status(error.status).json({ error: error.message, details: error.details });
    }
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      return res.status(400).json({ error: "Os dados enviados são inválidos." });
    }
    console.error(error);
    res.status(500).json({ error: "Não foi possível concluir a operação. Tente novamente." });
  });

  app.locals.db = db;
  return app;
}

module.exports = { createApp };
