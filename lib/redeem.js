import crypto from "node:crypto";
import { db } from "#lib/database";
import { MAX_LEVEL } from "#lib/levels";
import { ITEMS, addItem, addXp, findItem, getRpg } from "#lib/rpg";
import { fmt, tr } from "#lib/tr";
import { gainExp } from "#lib/utils";

/*
 * Redeem: hadiah dari admin (kode buatan .createredeem) dan hadiah dari game (lib/gamecodes.js) lewat satu pintu .redeem.
 *
 * Bentuk hadiah (semua opsional):
 *   { gold, diamond, limit, exp (EXP bot), xp (XP RPG), level (+level bot), premiumDays (-1 = permanen), items: { id: jumlah } }
 *
 * Kode admin disimpan di database/redeem.json:
 *   KODE → { code, rewards, max (0 = tak terbatas), uses, usedBy: { jid: waktu }, expiresAt (0 = tanpa batas), note, createdAt, createdBy }
 */
const DAY = 86_400_000;
export const REWARD_KEYS = ["gold", "diamond", "limit", "exp", "xp", "level", "premiumDays", "items"];

const ALIASES = {
  gold: "gold", g: "gold", koin: "gold", coin: "gold",
  diamond: "diamond", berlian: "diamond", dm: "diamond", gem: "diamond",
  limit: "limit", lmt: "limit",
  exp: "exp", xpbot: "exp",
  xp: "xp", rpgxp: "xp",
  level: "level", lvl: "level",
  premium: "premium", prem: "premium", vip: "premium",
};
const CTRL = { max: "max", uses: "max", kuota: "max", ttl: "ttl", expire: "ttl", exp_in: "ttl", kadaluarsa: "ttl", note: "note", catatan: "note", code: "code", kode: "code", item: "item", items: "item" };

export const parseDuration = (text) => {
  const v = String(text ?? "").trim().toLowerCase();
  if (/^(perm|permanen|permanent|forever|selamanya)$/.test(v)) return -1;
  const m = v.match(/^(\d+(?:\.\d+)?)(m|h|d|w|j)?$/);
  if (!m) return null;
  const unit = { m: 60_000, h: 3_600_000, j: 3_600_000, d: DAY, w: 7 * DAY }[m[2] ?? "d"];
  return Math.round(Number(m[1]) * unit);
};

export const parseAmount = (text) => {
  const m = String(text ?? "").toLowerCase().replace(/[,_]/g, "").match(/^(\d+(?:\.\d+)?)([kmb]?)$/);
  return m ? Math.floor(Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] ?? 1)) : null;
};

const clean = (rewards) => {
  const out = {};
  for (const k of ["gold", "diamond", "limit", "exp", "xp", "level", "premiumDays"]) if (rewards[k]) out[k] = rewards[k];
  if (rewards.items && Object.keys(rewards.items).length) out.items = { ...rewards.items };
  return out;
};
export const isEmpty = (rewards) => !Object.keys(clean(rewards)).length;

/*
 * "gold=5000 diamond=10 limit=50 premium=7d xp=500 item=petiemas:2 max=100 ttl=7d note=halo" → { rewards, max, ttl, note, code, errors }
 * Pasangan juga boleh dipisah spasi: "gold 5000 limit 50". Kata tanpa "=" yang bukan kunci dianggap kode.
 */
export const parseSpec = (args) => {
  const rewards = { items: {} }, errors = [];
  let max = 0, ttl = 0, note = "", code = "";
  const list = [...args];
  while (list.length) {
    const token = list.shift();
    let [key, ...rest] = token.split(/[=:]/);
    let value = rest.join(":");
    key = key.toLowerCase();
    const known = ALIASES[key] ?? CTRL[key] ?? (findItem(key) && ITEMS[findItem(key)] && key.length > 2 ? "itemid" : null);
    if (!known) {
      if (!code && /^[\w-]{3,32}$/.test(token) && !/^\d+$/.test(token)) code = token.toUpperCase();
      else errors.push(token);
      continue;
    }
    if (!value && list.length && (known !== "itemid" || /^\d/.test(list[0]))) value = list.shift();
    if (known === "note") { note = [value, ...list.splice(0)].join(" ").trim(); break; }
    if (known === "code") { code = value.toUpperCase(); continue; }
    if (known === "max") { const n = parseAmount(value); if (n === null) errors.push(token); else max = n; continue; }
    if (known === "ttl") { const ms = parseDuration(value); if (ms === null || ms < 0) errors.push(token); else ttl = ms; continue; }
    if (known === "item" || known === "itemid") {
      const [name, n = "1"] = known === "item" ? value.split(/[:*x]/) : [key, value || "1"];
      const id = findItem(name), amount = parseAmount(n);
      if (!id || !amount) errors.push(token); else rewards.items[id] = (rewards.items[id] ?? 0) + amount;
      continue;
    }
    if (known === "premium") { const ms = parseDuration(value); if (ms === null) errors.push(token); else rewards.premiumDays = ms < 0 ? -1 : Math.max(1, Math.round(ms / DAY)); continue; }
    const n = parseAmount(value);
    if (n === null || !n) errors.push(token); else rewards[known] = (rewards[known] ?? 0) + n;
  }
  return { rewards: clean(rewards), max, ttl, note, code, errors };
};

export const describe = (rewards) => {
  const lines = [];
  if (rewards.gold) lines.push(`🪙 +${fmt(rewards.gold)} Gold`);
  if (rewards.diamond) lines.push(`💎 +${fmt(rewards.diamond)} Diamond`);
  if (rewards.limit) lines.push(`🎟️ +${fmt(rewards.limit)} Limit`);
  if (rewards.exp) lines.push(`⭐ +${fmt(rewards.exp)} EXP`);
  if (rewards.xp) lines.push(`🗡️ +${fmt(rewards.xp)} XP RPG`);
  if (rewards.level) lines.push(`📈 +${fmt(rewards.level)} ${tr("Level bot", "Bot level")}`);
  if (rewards.premiumDays) lines.push(`👑 Premium ${rewards.premiumDays < 0 ? tr("permanen", "permanent") : `+${rewards.premiumDays} ${tr("hari", "days")}`}`);
  for (const [id, n] of Object.entries(rewards.items ?? {})) lines.push(`🎁 ${ITEMS[id]?.name ?? id} x${fmt(n)}`);
  return lines;
};

// Berikan hadiah ke pengguna → daftar baris hasil.
export const grant = (user, rewards) => {
  const r = getRpg(user);
  if (rewards.gold) r.gold += rewards.gold;
  if (rewards.diamond) r.diamond += rewards.diamond;
  if (rewards.limit) user.limit = (user.limit ?? 0) + rewards.limit;
  if (rewards.exp) gainExp(user, rewards.exp);
  if (rewards.level) { user.level = Math.min(MAX_LEVEL, (user.level ?? 1) + rewards.level); user.exp = 0; }
  const ups = rewards.xp ? addXp(r, rewards.xp) : [];
  if (rewards.premiumDays) {
    const now = Date.now();
    if (rewards.premiumDays < 0) user.premium = { on: true, expiredAt: 0 };
    else {
      const base = user.premium?.on && user.premium.expiredAt > now ? user.premium.expiredAt : now;
      user.premium = { on: true, expiredAt: base + rewards.premiumDays * DAY };
    }
  }
  for (const [id, n] of Object.entries(rewards.items ?? {})) if (ITEMS[id]) addItem(r, id, n);
  const lines = describe(rewards);
  for (const up of ups) lines.push(`🆙 ${tr("Level RPG naik ke", "RPG level up to")} ${up.lvl}`);
  db.save("users");
  return lines;
};

/* ── kode admin ─────────────────────────────────────────────────────────── */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const randomCode = () => {
  const pick = () => [...crypto.randomBytes(4)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  for (;;) {
    const code = `MIYAKO-${pick()}`;
    if (!db.redeem[code]) return code;
  }
};

export const createCode = ({ code, rewards, max = 0, ttl = 0, note = "", by = "" }) => {
  code = (code || randomCode()).toUpperCase();
  if (db.redeem[code]) throw new Error(tr(`Kode ${code} sudah ada.`, `Code ${code} already exists.`));
  db.redeem[code] = { code, rewards, max, uses: 0, usedBy: {}, expiresAt: ttl ? Date.now() + ttl : 0, note, createdAt: Date.now(), createdBy: by };
  db.save("redeem");
  return db.redeem[code];
};
export const deleteCode = (code) => {
  const key = String(code ?? "").toUpperCase();
  if (!db.redeem[key]) return false;
  delete db.redeem[key];
  db.save("redeem");
  return true;
};

// → { ok, lines } | { ok:false, error }
export const redeemAdminCode = (user, jid, rawCode) => {
  const entry = db.redeem[String(rawCode ?? "").trim().toUpperCase()];
  if (!entry) return { ok: false, error: tr("Kode tidak ditemukan.", "Code not found.") };
  if (entry.expiresAt && Date.now() > entry.expiresAt) return { ok: false, error: tr("Kode sudah kedaluwarsa.", "This code has expired.") };
  if (entry.usedBy[jid]) return { ok: false, error: tr("Kamu sudah memakai kode ini.", "You already redeemed this code.") };
  if (entry.max && entry.uses >= entry.max) return { ok: false, error: tr("Kuota kode sudah habis.", "This code has no uses left.") };
  entry.uses++;
  entry.usedBy[jid] = Date.now();
  const lines = grant(user, entry.rewards);
  db.save("redeem");
  return { ok: true, lines, entry };
};

export const codeSummary = (entry) =>
  [
    `*${entry.code}*${entry.note ? ` — ${entry.note}` : ""}`,
    ...describe(entry.rewards).map((l) => `  ${l}`),
    `  👥 ${entry.uses}/${entry.max || "∞"}  ·  ⏳ ${entry.expiresAt ? new Date(entry.expiresAt).toLocaleString(tr("id-ID", "en-GB"), { dateStyle: "medium", timeStyle: "short" }) : "∞"}`,
  ].join("\n");
