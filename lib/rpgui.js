import crypto from "node:crypto";
import { cardPayload, fetchAvatar, renderCard } from "#lib/cards";
import { db } from "#lib/database";
import { logger } from "#lib/logger";
import { ITEMS, RARITY, TYPE_LABEL, STAMINA_MAX, bankCap, interestPerDay, statsOf, titleOf, xpNeed } from "#lib/rpg";
import { numberOf } from "#lib/utils";

const fmt = (n) => Number(n).toLocaleString("id-ID");
const statText = (it) => (it.atk ? `ATK +${it.atk}` : it.def ? `DEF +${it.def}` : it.heal ? (it.heal > 9999 ? "HP penuh" : `HP +${it.heal}`) : it.stamina ? `Stamina +${it.stamina}` : TYPE_LABEL[it.type]);

// Judul kartu pratinjau per jenis kartu (baris kecil di bawah = nama pemain).
const CARD_TITLE = { profile: "👤 Profil Pemain", hero: "⚔️ Karakter RPG", atm: "🏧 ATM Miyako", result: "🎲 Hasil RPG", grid: "🎒 RPG Miyako" };

/*
 * Kirim kartu sebagai pesan "diteruskan dari channel" + link preview besar (gambar kartu = thumbnail), caption jadi teksnya.
 * Gaya mengikuti db.settings.cardStyle (preview | image). Gagal kirim → coba gaya satunya → terakhir teks biasa.
 */
export const sendCard = async ({ sock, ctx }, kind, data, caption, extraMentions = []) => {
  let image;
  try {
    image = await renderCard(kind, { fallbackName: numberOf(ctx.senderId), ...data });
  } catch (err) {
    logger.warn(`Kartu ${kind} gagal dirender: ${err.message}`);
    return ctx.reply(caption);
  }
  const mentions = [ctx.senderId, ...extraMentions];
  const info = { text: caption, mentions, title: (["result", "grid"].includes(kind) && data.title) || CARD_TITLE[kind] || "🪪 Miyako - BA", body: data.name ?? numberOf(ctx.senderId) };
  const quoted = await ctx.quote();
  const style = db.settings.cardStyle ?? "preview";
  for (const attempt of style === "image" ? ["image", "preview"] : ["preview", "image"]) {
    try {
      return await sock.sendMessage(ctx.chatId, cardPayload(image, { ...info, style: attempt }), { quoted });
    } catch (err) {
      logger.warn(`Kartu ${kind} (${attempt}) gagal terkirim: ${err.message}`);
    }
  }
  return ctx.reply(caption);
};

export const nameOf = ({ ctx, user }) => user.reg?.name ?? ctx.pushName ?? numberOf(ctx.senderId);

// Kartu hasil aksi (berburu, menambang, hadiah, ...). res = { title, subtitle, badge, accent, rows }
export const sendResult = async (env, r, res, extraMentions = []) => {
  const { ctx, sock } = env, st = statsOf(r);
  const caption = [`*${res.title}* — ${res.badge}`, res.subtitle, "", ...res.rows.map((x) => `• ${x.text}`), "", `❤️ ${r.hp}/${st.maxHp}  ⚡ ${r.stamina}/${STAMINA_MAX}  🪙 ${fmt(r.gold)}`].join("\n");
  return sendCard(env, "result", {
    name: nameOf(env), avatar: await fetchAvatar(sock, ctx.senderId),
    title: res.title, subtitle: res.subtitle, badge: res.badge, accent: res.accent, rows: res.rows,
    pill: `Lv ${r.lvl}`, hpText: `${r.hp}/${st.maxHp}`, hpR: r.hp / st.maxHp, xpText: `${r.xp}/${xpNeed(r.lvl)}`, xpR: r.xp / xpNeed(r.lvl),
    footer: `Stamina ${r.stamina}/${STAMINA_MAX}  ·  Gold ${fmt(r.gold)}  ·  Berlian ${r.diamond}`,
  }, caption, extraMentions);
};

export const sendHero = async (env, r, who = env.ctx.senderId, name = nameOf(env)) => {
  const st = statsOf(r), need = xpNeed(r.lvl), w = ITEMS[r.equip.weapon], a = ITEMS[r.equip.armor];
  const caption = [`⚔️ *${name}* — Lv ${r.lvl} ${titleOf(r.lvl)}`, `❤️ HP ${r.hp}/${st.maxHp}  ⚡ ${r.stamina}/${STAMINA_MAX}`, `🗡️ ATK ${st.atk}  🛡️ DEF ${st.def}`, `🪙 ${fmt(r.gold)}  💎 ${r.diamond}`].join("\n");
  return sendCard(env, "hero", {
    name, avatar: await fetchAvatar(env.sock, who), lvl: r.lvl, title: titleOf(r.lvl), cls: titleOf(r.lvl).toUpperCase(),
    hpText: `${r.hp} / ${st.maxHp}`, hpR: r.hp / st.maxHp, stText: `${r.stamina} / ${STAMINA_MAX}`, stR: r.stamina / STAMINA_MAX, xpText: `${r.xp} / ${need}`, xpR: r.xp / need,
    weapon: w?.name ?? "-", armor: a?.name ?? "-", atk: st.atk, def: st.def, gold: fmt(r.gold), diamond: r.diamond,
    footer: `Kill ${r.kills}  ·  Dungeon ${r.dungeons}`,
  }, caption);
};

const chips = (r) => { const st = statsOf(r); return [`${fmt(r.gold)} Gold`, `${r.diamond} Berlian`, `Stamina ${r.stamina}/${STAMINA_MAX}`, `HP ${r.hp}/${st.maxHp}`]; };
const ORDER = { weapon: 0, armor: 1, potion: 2, crate: 3, material: 4, fish: 5, tool: 6 };

export const inventoryList = (r) =>
  Object.entries(r.inv).filter(([id]) => ITEMS[id]).sort(([a], [b]) => ORDER[ITEMS[a].type] - ORDER[ITEMS[b].type] || ITEMS[b].rar - ITEMS[a].rar || a.localeCompare(b));

export const sendInventory = async (env, r, page = 1) => {
  const all = inventoryList(r), pages = Math.max(1, Math.ceil(all.length / 12)), p = Math.min(Math.max(1, page), pages);
  const items = all.slice((p - 1) * 12, p * 12).map(([id, n]) => {
    const it = ITEMS[id], eq = r.equip.weapon === id || r.equip.armor === id;
    return { name: it.name, l2: `${RARITY[it.rar].name} · ${statText(it)}`, l3: `x${n}${eq ? "  ·  TERPASANG" : ""}`, icon: it.icon, color: RARITY[it.rar].color };
  });
  const caption = [`🎒 *TAS ${nameOf(env).toUpperCase()}* (hal ${p}/${pages})`, ...all.slice((p - 1) * 12, p * 12).map(([id, n]) => `• ${ITEMS[id].name} x${n} _(${id})_`), "", `🪙 ${fmt(r.gold)}  💎 ${r.diamond}`, pages > 1 ? `Halaman lain: *${env.ctx.prefix}inv <angka>*` : ""].filter((x) => x !== "").join("\n");
  return sendCard(env, "grid", { title: `TAS ${nameOf(env).toUpperCase()}`, subtitle: `${all.length} jenis item  ·  ${env.ctx.prefix}pakai  ${env.ctx.prefix}equip  ${env.ctx.prefix}jual`, badge: `HAL ${p}/${pages}`, chips: chips(r), items, empty: "Tas kosong — ayo berburu!" }, caption);
};

export const SHOP_IDS = Object.keys(ITEMS).filter((id) => ITEMS[id].buy);
export const sendShop = async (env, r, page = 1) => {
  const pages = Math.max(1, Math.ceil(SHOP_IDS.length / 12)), p = Math.min(Math.max(1, page), pages);
  const list = SHOP_IDS.slice((p - 1) * 12, p * 12);
  const items = list.map((id) => { const it = ITEMS[id]; return { name: it.name, l2: `${statText(it)}  ·  id: ${id}`, l3: `${fmt(it.buy)} Gold`, icon: it.icon, color: RARITY[it.rar].color }; });
  const caption = [`🏪 *TOKO MIYAKO* (hal ${p}/${pages})`, ...list.map((id) => `• ${ITEMS[id].name} — ${fmt(ITEMS[id].buy)} G _(${id})_`), "", `Beli: *${env.ctx.prefix}beli <id> [jumlah]*`].join("\n");
  return sendCard(env, "grid", { title: "TOKO MIYAKO", subtitle: `Beli: ${env.ctx.prefix}beli <id> [jumlah]   ·   Jual: ${env.ctx.prefix}jual <id> [jumlah|all]`, badge: `HAL ${p}/${pages}`, chips: chips(r), items }, caption);
};

// Nomor kartu bank: 16 digit tetap per pengguna (turunan dari JID).
export const cardNumber = (jid) => {
  const hex = crypto.createHash("sha256").update(String(jid)).digest("hex");
  return [0, 1, 2, 3].map((i) => String(parseInt(hex.slice(i * 6, i * 6 + 6), 16) % 10000).padStart(4, "0")).join(" ");
};

export const sendAtm = async (env, r, note = "Selamat datang di ATM Miyako", extraMentions = []) => {
  const { ctx, user, sock } = env, cap = bankCap(r);
  const since = new Date(user.reg?.at ?? Date.now()), mm = String(since.getMonth() + 1).padStart(2, "0"), yy = String(since.getFullYear()).slice(-2);
  const caption = [`🏧 *ATM MIYAKO* — ${nameOf(env)}`, `💳 ${cardNumber(ctx.senderId)}`, "", `🏦 Saldo bank : ${fmt(r.bank)} G`, `👛 Dompet     : ${fmt(r.gold)} G`, `📈 Bunga      : ${fmt(interestPerDay(r))} G / hari`, `🔒 Limit      : ${fmt(r.bank)} / ${fmt(cap)}`, "", note].join("\n");
  return sendCard(env, "atm", {
    name: nameOf(env), number: cardNumber(ctx.senderId), since: `${mm}/${yy}`,
    balance: `${fmt(r.bank)} G`, wallet: `${fmt(r.gold)} G`, total: `${fmt(r.bank + r.gold)} G`,
    interest: `+${fmt(interestPerDay(r))} G / hari`, limit: `${fmt(r.bank)} / ${fmt(cap)}`, ratio: r.bank / cap, note,
  }, caption, extraMentions);
};
