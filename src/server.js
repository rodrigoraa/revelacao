require("dotenv").config();
const { createApp } = require("./app");

const port = Number(process.env.PORT) || 3000;

async function start() {
  const app = await createApp();
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`Chá Lista disponível em http://localhost:${port}`);
  });

  async function shutdown() {
    server.close(async () => {
      await app.locals.db.end();
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("Não foi possível iniciar o Chá Lista:", error);
  process.exit(1);
});
