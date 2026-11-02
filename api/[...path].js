import { configFromEnv } from "../backend/src/config.js";
import { createContext } from "../backend/src/context.js";
import { createApp } from "../backend/src/app.js";

let handler;

function createHandler() {
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
  const ctx = createContext(config);
  return createApp(ctx).app;
}

export default function pharosApi(request, response) {
  handler ||= createHandler();
  return handler(request, response);
}
