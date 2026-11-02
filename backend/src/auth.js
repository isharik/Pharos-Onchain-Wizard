import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password, hash) {
  try {
    const [salt, expected] = hash.split(":");
    const actual = scryptSync(password, salt, 64);
    const bytes = Buffer.from(expected, "hex");
    return bytes.length === actual.length && timingSafeEqual(bytes, actual);
  } catch {
    return false;
  }
}
export function authentication(app, ctx) {
  const config = ctx.config;
  const enabled = !!config.adminHash;
  const attempts = new Map();
  const cookieName = "pharos_session";
  const acceptedOrigin = (req) =>
    !req.headers.origin ||
    [
      config.publicOrigin,
      "http://127.0.0.1:" + config.port,
      "http://localhost:" + config.port,
    ]
      .filter(Boolean)
      .includes(req.headers.origin);
  const tokenOf = (req) =>
    (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
  const key = (token) =>
    "session:" + createHash("sha256").update(token).digest("hex");
  const valid = (req) => {
    const token = tokenOf(req);
    const session = token && ctx.store.get(key(token));
    return !!session && session.expires > Date.now();
  };
  app.get("/api/auth/status", (req, res) =>
    res.json({ required: enabled, authenticated: !enabled || valid(req) }),
  );
  app.post("/api/auth/login", (req, res) => {
    if (!enabled) return res.json({ ok: true });
    if (!acceptedOrigin(req))
      return res
        .status(403)
        .json({ error: { message: "Login origin rejected" } });
    const ip = req.socket.remoteAddress;
    const attempt = attempts.get(ip) || {
      count: 0,
      until: Date.now() + 900000,
    };
    if (attempt.until < Date.now()) {
      attempt.count = 0;
      attempt.until = Date.now() + 900000;
    }
    if (attempt.count >= 10)
      return res
        .status(429)
        .json({
          error: {
            message: "Too many login attempts. Try again in 15 minutes.",
          },
        });
    attempt.count++;
    attempts.set(ip, attempt);
    if (
      typeof req.body.password !== "string" ||
      req.body.password.length > 512 ||
      req.body.username !== config.adminUser ||
      !verifyPassword(req.body.password, config.adminHash)
    )
      return res
        .status(401)
        .json({ error: { message: "Incorrect account or password" } });
    attempts.delete(ip);
    const token = randomBytes(32).toString("hex");
    ctx.store.set(key(token), { expires: Date.now() + 8 * 3600000 });
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${config.publicOrigin?.startsWith("https:") ? "; Secure" : ""}`,
    );
    res.json({ ok: true });
  });
  app.post("/api/auth/logout", (req, res) => {
    if (!acceptedOrigin(req))
      return res
        .status(403)
        .json({ error: { message: "Logout origin rejected" } });
    const token = tokenOf(req);
    if (token) ctx.store.set(key(token), null);
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    );
    res.json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    if (enabled && !valid(req))
      return res
        .status(401)
        .json({
          error: {
            code: "AUTH_REQUIRED",
            message: "Sign in to access this workspace",
          },
        });
    next();
  });
}
