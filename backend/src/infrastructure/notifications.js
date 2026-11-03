import { AppError } from "../errors.js";
export class Notifications {
  constructor(config, store) {
    this.config = config;
    this.store = store;
  }
  async send(id, channel, payload) {
    const key = `notification:${id}`;
    const old = this.store.get(key);
    if (old) return { status: old.status, duplicate: true };
    const timestamp = new Date().toISOString();
    const content = `${timestamp} | ${payload.message} | ${payload.link || ""}`;
    if (channel === "console") {
      console.info(JSON.stringify({ level: "alert", timestamp, ...payload }));
      this.store.set(key, { status: "delivered" });
      return { status: "delivered" };
    }
    let url, body;
    if (channel === "discord") {
      url = this.config.discord;
      body = { content };
    }
    if (channel === "telegram") {
      url = this.config.telegramToken
        ? `https://api.telegram.org/bot${this.config.telegramToken}/sendMessage`
        : null;
      body = { chat_id: this.config.telegramChat, text: content };
    }
    if (!url)
      throw new AppError(
        "NOT_CONFIGURED",
        `Configure the ${channel} notification channel on the server`,
        503,
      );
    this.store.set(key, { status: "sending", payload });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout),
        redirect: "error",
      });
      if (!res.ok) {
        this.store.set(key, {
          status: "failed",
          httpStatus: res.status,
          payload,
        });
        throw new AppError(
          "NOTIFICATION_FAILED",
          `Notification channel returned HTTP ${res.status}`,
          502,
        );
      }
      this.store.set(key, { status: "delivered", payload });
      return { status: "delivered" };
    } catch (e) {
      if (this.store.get(key).status === "sending")
        this.store.set(key, { status: "delivery-uncertain", payload });
      throw e;
    }
  }
}
