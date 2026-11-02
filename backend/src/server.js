import { configFromEnv } from "./config.js";
import { createContext } from "./context.js";
import { createApp } from "./app.js";
const config = configFromEnv();
const ctx = createContext(config);
const { app, scheduler } = createApp(ctx);
const server = app.listen(config.port, config.host, () =>
  console.info(
    `Pharos: ${config.publicOrigin || `http://127.0.0.1:${config.port}`}`,
  ),
);
scheduler.start();
async function close() {
  server.close();
  await scheduler.stop();
  await ctx.close();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
