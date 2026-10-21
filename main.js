/*
 * Miyako - BA — WhatsApp bot (Baileys)
 * Author  : ZavedyaID
 * GitHub  : https://github.com/ZavedyaID/Miyako-BA
 * License : MIT
 *
 * Jalankan dengan: npm start
 */

import {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState,
} from "#lib/baileys";
import fs from "node:fs";
import readline from "node:readline/promises";
import path from "node:path";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { attachEvents } from "./events.js";
import { patchChannel } from "#lib/channel";
import { startAutoBackup } from "#lib/backup";
import { checkCards } from "#lib/cards";
import { config } from "#lib/config";
import { db } from "#lib/database";
import { groups } from "#lib/groups";
import { logger } from "#lib/logger";
import { registry } from "#lib/plugins";
import { dayKey, messageCache } from "#lib/utils";

const FATAL = new Set([DisconnectReason.loggedOut, DisconnectReason.badSession, DisconnectReason.multideviceMismatch]);
const STOP = new Set([DisconnectReason.connectionReplaced, DisconnectReason.forbidden]);
const silent = pino({ level: "silent" });
const login = { mode: null, number: null };
let attempts = 0;
let browserTry = 0; // naik tiap code 405 beruntun: ganti identitas browser bila server menolak yang ini
const BROWSERS = [() => Browsers.ubuntu("Chrome"), () => Browsers.macOS("Desktop"), () => Browsers.windows?.("Chrome") ?? Browsers.ubuntu("Firefox")];

const ask = async (question) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(logger.chalk.cyan("? ") + question)).trim();
  } finally {
    rl.close();
  }
};

const chooseLogin = async () => {
  if (login.mode) return;
  login.mode = /^(y|yes|ya)$/i.test(await ask("Login pakai pairing code? [y/N] ")) ? "pair" : "qr";
  if (login.mode === "pair") {
    const number = config.number || (await ask("Nomor WhatsApp bot (contoh 62812xxxx, tanpa +): "));
    login.number = number.replace(/\D/g, "");
  }
};

// Versi WA yang usang = server WhatsApp menolak handshake (disconnect code 405, QR tak pernah muncul).
// Urutan: config.json → "waVersion": [2,3000,xxxxxxxx] (manual) → scrape WA Web → daftar versi Baileys → bawaan library.
// Cadangan mandiri (tanpa bergantung pada export library): ambil client_revision dari WA Web.
const scrapeWaWeb = async () => {
  const res = await fetch("https://web.whatsapp.com/sw.js", { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" }, signal: AbortSignal.timeout(10_000) });
  const rev = (await res.text()).match(/\\?"client_revision\\?":\s*(\d+)/)?.[1];
  if (!rev) throw new Error(`client_revision tidak ditemukan (HTTP ${res.status})`);
  return { version: [2, 3000, Number(rev)], isLatest: true };
};

const latestVersion = async () => {
  const manual = config.waVersion;
  if (Array.isArray(manual) && manual.length === 3) return manual.map(Number);
  for (const [name, fn] of [["WA Web", fetchLatestWaWebVersion], ["WA Web (mandiri)", scrapeWaWeb], ["Baileys", fetchLatestBaileysVersion]]) {
    if (typeof fn !== "function") continue;
    try {
      const res = await fn();
      if (res?.version && res.isLatest !== false) return res.version;
      logger.warn(`${name}: gagal mengambil versi terbaru (${res?.error?.message ?? "pakai versi cadangan"})`);
    } catch (err) {
      logger.warn(`${name}: gagal mengambil versi (${err.message})`);
    }
  }
  logger.warn("Versi WA terbaru tidak terambil — memakai versi bawaan Baileys (bisa memicu code 405)");
};

const connect = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(config.paths.session);
  if (!state.creds.registered) await chooseLogin();

  const version = await latestVersion();
  if (version) logger.info(`WA version ${version.join(".")}`);
  const sock = makeWASocket({
    ...(version && { version }),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, silent) },
    browser: (BROWSERS[browserTry % BROWSERS.length] ?? BROWSERS[0])(),
    logger: silent,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    keepAliveIntervalMs: 30_000,
    cachedGroupMetadata: async (jid) => groups.peek(jid),
    getMessage: async (key) => messageCache.get(key.id)?.message,
  });

  patchChannel(sock);
  attachEvents(sock);
  sock.ev.on("creds.update", saveCreds);

  let codeRequested = false;

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr && login.mode === "pair" && !codeRequested) {
      codeRequested = true;
      try {
        const code = await sock.requestPairingCode(login.number);
        logger.conn(`Pairing code: ${logger.chalk.bgGreen.black.bold(` ${code.match(/.{1,4}/g).join("-")} `)}`);
        logger.info("Open WhatsApp → Linked devices → Link with phone number.");
      } catch (err) {
        logger.error(`Failed to request the pairing code: ${err.message}`);
      }
    } else if (qr && login.mode !== "pair") {
      logger.conn("Scan this QR code with WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "connecting") logger.conn("Connecting…");

    if (connection === "open") {
      attempts = 0;
      browserTry = 0;
      logger.ok(`Connected as ${logger.chalk.bold(sock.user?.id?.split(/[:@]/)[0])} (${sock.user?.name ?? "-"})`);
      startAutoBackup(sock);
    }

    if (connection !== "close") return;

    const code = lastDisconnect?.error?.output?.statusCode;

    if (FATAL.has(code)) {
      logger.warn(`Invalid session (code ${code}) — deleting the session and logging in again`);
      fs.rmSync(config.paths.session, { recursive: true, force: true });
      login.mode = null;
      return connect();
    }

    if (STOP.has(code)) {
      logger.error(`Connection stopped (code ${code}). The session is used on another device or the account is restricted.`);
      process.exit(1);
    }

    logger.warn(`Alasan: ${lastDisconnect?.error?.message ?? "?"}`);
    if (code === 405) browserTry++;
    if (code === 405) logger.warn("Code 405 = WhatsApp menolak versi/klien — mencoba versi WA terbaru + identitas browser lain otomatis.");
    try { sock.ev.removeAllListeners(); sock.end?.(undefined); } catch {}
    const delay = Math.min(30_000, 1000 * 2 ** attempts++);
    logger.conn(`Disconnected (code ${code ?? "?"}) — retrying in ${delay / 1000} s`);
    setTimeout(() => connect().catch((err) => logger.error(`reconnect: ${err.message}`)), delay);
  });
};

const startScheduler = () => {
  const every = (ms, task) => setInterval(task, ms).unref();

  const resetLimits = () => {
    const today = dayKey(config.timezone);
    if (db.settings.lastReset === today) return;

    const base = config.limit?.default ?? 25;
    const stale = Object.values(db.users).filter((user) => (user.limit ?? 0) < base);
    for (const user of stale) user.limit = base;

    db.settings.lastReset = today;
    db.save("users", "settings");
    if (stale.length) logger.ok(`Daily limit reset for ${stale.length} users`);
  };

  const cleanTmp = () => {
    if (!fs.existsSync(config.paths.tmp)) return;
    for (const name of fs.readdirSync(config.paths.tmp)) {
      try {
        const file = path.join(config.paths.tmp, name);
        if (Date.now() - fs.statSync(file).mtimeMs > 5 * 60_000) fs.rmSync(file, { force: true });
      } catch {}
    }
  };

  resetLimits();
  every(60_000, resetLimits);
  every(60_000, () => db.flush());
  every(5 * 60_000, cleanTmp);
};

const shutdown = (signal) => {
  logger.info(`${signal} received — saving the database…`);
  db.flush();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", () => db.flush());
process.on("unhandledRejection", (err) => logger.error(`unhandledRejection: ${err?.stack ?? err}`));
process.on("uncaughtException", (err) => logger.error(`uncaughtException: ${err?.stack ?? err}`));

logger.banner({ name: config.name, version: config.version, node: process.versions.node });

db.load();
Object.assign((config.features ??= {}), db.settings.features); // toggle fitur dari .on owner
await registry.loadAll();
checkCards().then((r) => !r.ok && logger.warn(`Welcome/goodbye/level-up cards disabled: ${r.reason}`)); // warning only, the bot keeps running
registry.watch();
startScheduler();
await connect();
