import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { authentication, hashPassword } from "../src/auth.js";
import { Store } from "../src/database.js";

test("Authentication protects APIs, rejects cross-origin login/logout and invalidates sessions", async () => {
  const store = new Store(":memory:");
  const app = express();
  app.use(express.json());
  const config = {
    adminHash: hashPassword("test-only-password"),
    adminUser: "admin",
    port: 4317,
  };
  authentication(app, { config, store });
  app.get("/api/private", (req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body = {}, headers = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(base + "/api/private")).status, 401);
    const credentials = { username: "admin", password: "test-only-password" };
    assert.equal(
      (
        await post("/api/auth/login", credentials, {
          Origin: "https://untrusted.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (await post("/api/auth/login", { ...credentials, password: "wrong" }))
        .status,
      401,
    );
    const login = await post("/api/auth/login", credentials, {
      Origin: "http://localhost:4317",
    });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly; SameSite=Strict/);
    const cookie = setCookie.split(";")[0];
    assert.equal(
      (await fetch(base + "/api/private", { headers: { Cookie: cookie } }))
        .status,
      200,
    );
    assert.equal(
      (
        await post(
          "/api/auth/logout",
          {},
          { Cookie: cookie, Origin: "https://untrusted.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          "/api/auth/logout",
          {},
          { Cookie: cookie, Origin: "http://localhost:4317" },
        )
      ).status,
      200,
    );
    assert.equal(
      (await fetch(base + "/api/private", { headers: { Cookie: cookie } }))
        .status,
      401,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
});
