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

const latestVersion = async () => {
  try {
    return (await fetchLatestBaileysVersion()).version;
  } catch {
    logger.warn("Gagal mengambil versi WA terbaru — memakai versi bawaan Baileys");
  }
};

const connect = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(config.paths.session);
  if (!state.creds.registered) await chooseLogin();

  const version = await latestVersion();
  const sock = makeWASocket({
    ...(version && { version }),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, silent) },
    browser: Browsers.ubuntu("Chrome"),
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
        logger.info("Buka WhatsApp → Perangkat tertaut → Tautkan dengan nomor telepon.");
      } catch (err) {
        logger.error(`Gagal meminta pairing code: ${err.message}`);
      }
    } else if (qr && login.mode !== "pair") {
      logger.conn("Scan QR berikut dengan WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "connecting") logger.conn("Menghubungkan…");

    if (connection === "open") {
      attempts = 0;
      logger.ok(`Terhubung sebagai ${logger.chalk.bold(sock.user?.id?.split(/[:@]/)[0])} (${sock.user?.name ?? "-"})`);
    }

    if (connection !== "close") return;

    const code = lastDisconnect?.error?.output?.statusCode;

    if (FATAL.has(code)) {
      logger.warn(`Sesi tidak valid (kode ${code}) — menghapus sesi dan login ulang`);
      fs.rmSync(config.paths.session, { recursive: true, force: true });
      login.mode = null;
      return connect();
    }

    if (STOP.has(code)) {
      logger.error(`Koneksi dihentikan (kode ${code}). Sesi dipakai perangkat lain atau akun dibatasi.`);
      process.exit(1);
    }

    const delay = Math.min(30_000, 1000 * 2 ** attempts++);
    logger.conn(`Terputus (kode ${code ?? "?"}) — mencoba lagi dalam ${delay / 1000} dtk`);
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
    if (stale.length) logger.ok(`Limit harian direset untuk ${stale.length} user`);
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
  logger.info(`${signal} diterima — menyimpan database…`);
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
await registry.loadAll();
registry.watch();
startScheduler();
await connect();
