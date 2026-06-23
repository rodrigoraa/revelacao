const assert = require("node:assert/strict");
const test = require("node:test");
const { newDb } = require("pg-mem");
const { createApp } = require("../src/app");

async function request(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  return { response, data };
}

test("fluxo público e Espaço da mãe preserva privacidade e impede excesso de reservas", async (t) => {
  const memoryDatabase = newDb();
  const adapter = memoryDatabase.adapters.createPg();
  const db = new adapter.Pool();
  const app = await createApp({
    db,
    motherSpacePassword: "senha-de-teste",
    sessionSecret: "segredo-de-teste-com-tamanho-suficiente",
    isProduction: false,
    enableRls: false,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await app.locals.db.end();
  });

  const health = await request(baseUrl, "/api/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.data.ok, true);

  const motherSpacePage = await fetch(`${baseUrl}/espaco-da-mae`);
  assert.equal(motherSpacePage.status, 200);
  assert.equal(motherSpacePage.headers.get("cache-control"), "no-store");
  assert.match(await motherSpacePage.text(), /Espaço da mãe/);

  const publicList = await request(baseUrl, "/api/gifts");
  assert.equal(publicList.response.status, 200);
  assert.ok(publicList.data.gifts.length >= 6);
  assert.equal("reservations" in publicList.data.gifts[0], false);
  assert.equal(JSON.stringify(publicList.data).includes("guestName"), false);

  const oneUnitGift = publicList.data.gifts.find((gift) => gift.desiredQuantity === 1);
  assert.ok(oneUnitGift);

  const payload = {
    giftId: oneUnitGift.id,
    guestName: "Convidada Teste",
    phone: "65999999999",
    quantity: 1,
  };
  const attempts = await Promise.all([
    request(baseUrl, "/api/reservations", { method: "POST", body: JSON.stringify(payload) }),
    request(baseUrl, "/api/reservations", {
      method: "POST",
      body: JSON.stringify({ ...payload, guestName: "Outra pessoa" }),
    }),
  ]);
  assert.deepEqual(attempts.map(({ response }) => response.status).sort(), [201, 409]);

  const updatedList = await request(baseUrl, "/api/gifts");
  const updatedGift = updatedList.data.gifts.find((gift) => gift.id === oneUnitGift.id);
  assert.equal(updatedGift.status, "sold_out");
  assert.equal(updatedGift.availableQuantity, 0);

  const malformedCookieSession = await request(baseUrl, "/api/espaco-da-mae/session", {
    headers: { Cookie: "cha_lista_espaco_mae=%E0%A4%A" },
  });
  assert.equal(malformedCookieSession.response.status, 200);
  assert.equal(malformedCookieSession.data.authenticated, false);

  const login = await request(baseUrl, "/api/espaco-da-mae/login", {
    method: "POST",
    body: JSON.stringify({ password: "senha-de-teste" }),
  });
  assert.equal(login.response.status, 200);
  const sessionCookie = login.response.headers.get("set-cookie");
  assert.match(sessionCookie, /Max-Age=28800/);
  const cookie = sessionCookie.split(";")[0];

  const persistedSession = await request(baseUrl, "/api/espaco-da-mae/session", {
    headers: { Cookie: cookie },
  });
  assert.equal(persistedSession.response.status, 200);
  assert.equal(persistedSession.data.authenticated, true);

  const dashboard = await request(baseUrl, "/api/espaco-da-mae/dashboard", {
    headers: { Cookie: cookie },
  });
  assert.equal(dashboard.response.status, 200);
  const motherSpaceGift = dashboard.data.gifts.find((gift) => gift.id === oneUnitGift.id);
  assert.equal(motherSpaceGift.reservations.length, 1);
  assert.equal(motherSpaceGift.reservations[0].guestName, "Convidada Teste");

  const createdGift = await request(baseUrl, "/api/espaco-da-mae/gifts", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({
      name: "Mamadeira",
      description: "",
      category: "Alimentação",
      imageUrl: "https://upload.wikimedia.org/example.jpg",
      imageAttribution: "Autora Exemplo · CC BY 4.0",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
      desiredQuantity: 2,
    }),
  });
  assert.equal(createdGift.response.status, 201);
  assert.equal(createdGift.data.gift.imageAttribution, "Autora Exemplo · CC BY 4.0");
  assert.equal(createdGift.data.gift.imageSourceUrl, "https://commons.wikimedia.org/wiki/File:Example.jpg");

  const oversizedGift = await request(baseUrl, "/api/espaco-da-mae/gifts", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({
      name: "Presente gigante",
      description: "",
      category: "",
      imageUrl: "",
      desiredQuantity: 10000,
    }),
  });
  assert.equal(oversizedGift.response.status, 400);
  assert.match(oversizedGift.data.error, /Quantidade desejada deve ser no máximo 9999/);

  const unlimitedGift = await request(baseUrl, "/api/espaco-da-mae/gifts", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({
      name: "Fraldas sem limite",
      description: "",
      category: "Higiene",
      imageUrl: "",
      unlimited: true,
    }),
  });
  assert.equal(unlimitedGift.response.status, 201);
  assert.equal(unlimitedGift.data.gift.unlimited, true);
  assert.equal(unlimitedGift.data.gift.desiredQuantity, null);
  assert.equal(unlimitedGift.data.gift.availableQuantity, null);

  const unlimitedReservation = await request(baseUrl, "/api/reservations", {
    method: "POST",
    body: JSON.stringify({
      giftId: unlimitedGift.data.gift.id,
      guestName: "Convidado sem limite",
      phone: "",
      quantity: 25,
    }),
  });
  assert.equal(unlimitedReservation.response.status, 201);
  assert.equal(unlimitedReservation.data.gift.unlimited, true);
  assert.equal(unlimitedReservation.data.gift.reservedQuantity, 25);
  assert.equal(unlimitedReservation.data.gift.availableQuantity, null);
  assert.equal(unlimitedReservation.data.gift.status, "available");

  const oversizedReservation = await request(baseUrl, "/api/reservations", {
    method: "POST",
    body: JSON.stringify({
      giftId: unlimitedGift.data.gift.id,
      guestName: "Convidado exagerado",
      phone: "",
      quantity: 10000,
    }),
  });
  assert.equal(oversizedReservation.response.status, 400);
  assert.match(oversizedReservation.data.error, /Quantidade deve ser no máximo 9999/);

  const tooSmallLimit = await request(
    baseUrl,
    `/api/espaco-da-mae/gifts/${unlimitedGift.data.gift.id}`,
    {
      method: "PUT",
      headers: { Cookie: cookie },
      body: JSON.stringify({
        name: "Fraldas sem limite",
        description: "",
        category: "Higiene",
        imageUrl: "",
        unlimited: false,
        desiredQuantity: 20,
      }),
    }
  );
  assert.equal(tooSmallLimit.response.status, 409);

  const convertedToLimited = await request(
    baseUrl,
    `/api/espaco-da-mae/gifts/${unlimitedGift.data.gift.id}`,
    {
      method: "PUT",
      headers: { Cookie: cookie },
      body: JSON.stringify({
        name: "Fraldas com limite",
        description: "",
        category: "Higiene",
        imageUrl: "",
        unlimited: false,
        desiredQuantity: 30,
      }),
    }
  );
  assert.equal(convertedToLimited.response.status, 200);
  assert.equal(convertedToLimited.data.gift.unlimited, false);
  assert.equal(convertedToLimited.data.gift.availableQuantity, 5);

  const cancelled = await request(
    baseUrl,
    `/api/espaco-da-mae/reservations/${motherSpaceGift.reservations[0].id}`,
    { method: "DELETE", headers: { Cookie: cookie } }
  );
  assert.equal(cancelled.response.status, 200);

  const dashboardAfterCancel = await request(baseUrl, "/api/espaco-da-mae/dashboard", {
    headers: { Cookie: cookie },
  });
  const cancelledReservation = dashboardAfterCancel.data.gifts
    .flatMap((gift) => gift.reservations)
    .find((reservation) => reservation.id === motherSpaceGift.reservations[0].id);
  assert.equal(cancelledReservation.status, "cancelled");
  assert.ok(cancelledReservation.cancelledAt);

  const availableAgain = await request(baseUrl, "/api/gifts");
  const releasedGift = availableAgain.data.gifts.find((gift) => gift.id === oneUnitGift.id);
  assert.equal(releasedGift.status, "available");
  assert.equal(releasedGift.availableQuantity, 1);
});
