import fs from "node:fs";
import path from "node:path";
import { config } from "#lib/config";
import { logger } from "#lib/logger";

const TABLES = ["users", "groups", "response", "stats", "settings", "redeem", "clans"];
const isPlain = (v) => v && typeof v === "object" && !Array.isArray(v);

const fill = (target, defaults) => {
  let changed = false;
  for (const [key, value] of Object.entries(defaults)) {
    if (target[key] === undefined) {
      target[key] = isPlain(value) ? structuredClone(value) : value;
      changed = true;
    } else if (isPlain(value) && isPlain(target[key])) {
      changed = fill(target[key], value) || changed;
    }
  }
  return changed;
};

const userDefaults = () => ({
  name: "",
  banned: false,
  premium: { on: false, expiredAt: 0 },
  limit: config.limit?.default ?? 25,
  exp: 0,
  level: 1,
  afk: -1,
  afkReason: "",
  rpg: null, // data RPG (lib/rpg.js) — dibuat otomatis saat pertama main
  reg: null, // data registrasi: { on, name, age, gender, sn, no, at } — diisi .register
  createdAt: Date.now(),
});

const groupDefaults = (id) => ({
  id,
  isBanned: false,
  welcome: false,
  goodbye: false,
  adminNotif: false,
  autoAi: false,
  ownerGreet: true,
  antiLink: false,
  antiSpam: false,
  delete: false,
  sWelcome: "",
  sBye: "",
  warnLink: {},
});

class Database {
  #dir = config.paths.database;
  #dirty = new Set();
  #timer = null;

  constructor() {
    for (const table of TABLES) this[table] = {};
  }

  #file(table) {
    return path.join(this.#dir, `${table}.json`);
  }

  load() {
    fs.mkdirSync(this.#dir, { recursive: true });
    const legacy = path.join(config.paths.root, "lib/database");

    for (const table of TABLES) {
      const file = this.#file(table);
      const old = path.join(legacy, `${table}.json`);

      if (!fs.existsSync(file) && fs.existsSync(old)) {
        fs.copyFileSync(old, file);
        logger.info(`Migrating legacy database: ${table}.json`);
      }

      try {
        this[table] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
      } catch (err) {
        const backup = `${file}.corrupt-${Date.now()}`;
        fs.copyFileSync(file, backup);
        logger.warn(`${table}.json rusak (${err.message}) — dicadangkan ke ${path.basename(backup)}`);
        this[table] = {};
      }
    }

    logger.ok(`Database ready — ${Object.keys(this.users).length} users, ${Object.keys(this.groups).length} groups`);
  }

  save(...tables) {
    for (const table of tables.length ? tables : TABLES) this.#dirty.add(table);
    this.#timer ??= setTimeout(() => this.flush(), 2000).unref();
  }

  flush() {
    clearTimeout(this.#timer);
    this.#timer = null;
    for (const table of this.#dirty) {
      const file = this.#file(table);
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(this[table], null, 2));
      fs.renameSync(`${file}.tmp`, file);
    }
    this.#dirty.clear();
  }

  // Owner tambahan (.addowner) — disimpan sebagai deretan angka nomor / LID di settings.owners.
  isExtraOwner({ pn, lid } = {}) {
    const owners = this.settings.owners;
    if (!Array.isArray(owners) || !owners.length) return false;
    const digits = (jid) => String(jid ?? "").split("@")[0].replace(/\D/g, "");
    return [pn, lid].map(digits).filter(Boolean).some((d) => owners.includes(d));
  }

  user(jid, name) {
    const record = (this.users[jid] ??= {});
    let changed = fill(record, userDefaults());
    if (name && record.name !== name) {
      record.name = name;
      changed = true;
    }
    if (changed) this.save("users");
    return record;
  }

  group(id) {
    const record = (this.groups[id] ??= {});
    // Migrasi: dulu "welcome" juga mengatur pesan keluar & promote/demote.
    if (record.welcome && record.goodbye === undefined) {
      record.goodbye = true;
      record.adminNotif = true;
    }
    if (fill(record, groupDefaults(id))) this.save("groups");
    return record;
  }
}

export const db = new Database();
