import { configFromEnv } from "../backend/src/config.js";
import { createContext } from "../backend/src/context.js";
import { createApp } from "../backend/src/app.js";
import { Store } from "../backend/src/database.js";
import { SupabaseState } from "../backend/src/infrastructure/supabaseState.js";

let localHandler;

function configuration() {
  const deploymentOrigin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined;
  const config = configFromEnv({
    ...process.env,
    VERCEL: "1",
    HOST: "127.0.0.1",
    DATA_DIR: "/tmp/pharos-data",
    ALLOW_PUBLIC_ACCESS: "true",
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN || deploymentOrigin,
  });
  return config;
}

function invoke(app, request, response) {
  return new Promise((resolve, reject) => {
    response.once("finish", resolve);
    response.once("error", reject);
    app(request, response);
  });
}

export default async function pharosApi(request, response) {
  const url = new URL(request.url, "http://localhost");
  const path = url.searchParams.get("path");
  if (path) {
    url.searchParams.delete("path");
    request.url = `/api/${path.replace(/^\/+/, "")}${url.search}`;
  }
  const config = configuration();
  const remoteState = new SupabaseState(config);
  if (!remoteState.enabled) {
    localHandler ||= createApp(createContext(config)).app;
    return localHandler(request, response);
  }
  const store = new Store(":memory:");
  let ctx;
  try {
    await remoteState.hydrate(store);
    ctx = createContext(config, store);
    const { app } = createApp(ctx);
    await invoke(app, request, response);
    await remoteState.persist(store);
  } catch (error) {
    if (!response.headersSent) {
      response.statusCode = error.status || 503;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({
        error: {
          code: error.code || "STATE_UNAVAILABLE",
          message: error.message || "Durable state is unavailable",
        },
      }));
    }
  } finally {
    await ctx?.close();
  }
}
