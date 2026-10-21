import crypto from "node:crypto";
import { cardPayload, fetchAvatar, renderCard } from "#lib/cards";
import { atmClean, takeTrail, trackAtm, wipeKeys } from "#lib/atmtrail";
import { db } from "#lib/database";
import { logger } from "#lib/logger";
import { ITEMS, RARITY, TYPE_LABEL, STAMINA_MAX, bankCap, interestPerDay, statsOf, titleOf, xpNeed } from "#lib/rpg";
import { numberOf } from "#lib/utils";
import { t as tl } from "#lib/i18n";

const fmt = (n) => Number(n).toLocaleString("id-ID");
const statText = (it) => (it.atk ? `ATK +${it.atk}` : it.def ? `DEF +${it.def}` : it.heal ? (it.heal > 9999 ? "HP penuh" : `HP +${it.heal}`) : it.stamina ? `Stamina +${it.stamina}` : TYPE_LABEL[it.type]);

// Judul kartu pratinjau per jenis kartu (baris kecil di bawah = nama pemain).
const CARD_TITLE = { get profile() { return tl("rgui.1"); }, get hero() { return tl("rgui.2"); }, get atm() { return tl("rgui.3"); }, get result() { return tl("rgui.4"); }, get grid() { return tl("rgui.5"); } };

/*
 * Kirim kartu sebagai pesan tl("rgui.6") + link preview besar (gambar kartu = thumbnail), caption jadi teksnya.
 * Gaya mengikuti db.settings.cardStyle (preview | image). Gagal kirim → coba gaya satunya → terakhir teks biasa.
 */
export const sendCard = async ({ sock, ctx }, kind, data, caption, extraMentions = []) => {
  let image;
  try {
    image = await renderCard(kind, { fallbackName: numberOf(ctx.senderId), ...data });
  } catch (err) {
    logger.warn(tl("rgui.7", { kind, message: err.message }));
    return ctx.reply(caption);
  }
  const mentions = [ctx.senderId, ...extraMentions];
  const info = { text: caption, mentions, title: (["result", "grid"].includes(kind) && data.title) || CARD_TITLE[kind] || tl("rgui.8"), body: data.name ?? numberOf(ctx.senderId) };
  const quoted = await ctx.quote();
  const style = db.settings.cardStyle ?? "preview";
  for (const attempt of style === "image" ? ["image", "preview"] : ["preview", "image"]) {
    try {
      return await sock.sendMessage(ctx.chatId, cardPayload(image, { ...info, style: attempt }), { quoted });
    } catch (err) {
      logger.warn(tl("rgui.9", { kind, attempt, message: err.message }));
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
    footer: tl("rgui.10", { stamina: r.stamina, STAMINA_MAX, v: fmt(r.gold), diamond: r.diamond }),
  }, caption, extraMentions);
};

export const sendHero = async (env, r, who = env.ctx.senderId, name = nameOf(env)) => {
  const st = statsOf(r), need = xpNeed(r.lvl), w = ITEMS[r.equip.weapon], a = ITEMS[r.equip.armor];
  const caption = [`⚔️ *${name}* — Lv ${r.lvl} ${titleOf(r.lvl)}`, `❤️ HP ${r.hp}/${st.maxHp}  ⚡ ${r.stamina}/${STAMINA_MAX}`, tl("rgui.11", { atk: st.atk, def: st.def }), `🪙 ${fmt(r.gold)}  💎 ${r.diamond}`].join("\n");
  return sendCard(env, "hero", {
    name, avatar: await fetchAvatar(env.sock, who), lvl: r.lvl, title: titleOf(r.lvl), cls: titleOf(r.lvl).toUpperCase(),
    hpText: `${r.hp} / ${st.maxHp}`, hpR: r.hp / st.maxHp, stText: `${r.stamina} / ${STAMINA_MAX}`, stR: r.stamina / STAMINA_MAX, xpText: `${r.xp} / ${need}`, xpR: r.xp / need,
    weapon: w?.name ?? "-", armor: a?.name ?? "-", atk: st.atk, def: st.def, gold: fmt(r.gold), diamond: r.diamond,
    footer: tl("rgui.12", { kills: r.kills, dungeons: r.dungeons }),
  }, caption);
};

const chips = (r) => { const st = statsOf(r); return [tl("rgui.13", { v: fmt(r.gold) }), tl("rgui.14", { diamond: r.diamond }), tl("rgui.15", { stamina: r.stamina, STAMINA_MAX }), `HP ${r.hp}/${st.maxHp}`]; };
const ORDER = { weapon: 0, armor: 1, potion: 2, crate: 3, material: 4, fish: 5, tool: 6 };

export const inventoryList = (r) =>
  Object.entries(r.inv).filter(([id]) => ITEMS[id]).sort(([a], [b]) => ORDER[ITEMS[a].type] - ORDER[ITEMS[b].type] || ITEMS[b].rar - ITEMS[a].rar || a.localeCompare(b));

export const sendInventory = async (env, r, page = 1) => {
  const all = inventoryList(r), pages = Math.max(1, Math.ceil(all.length / 12)), p = Math.min(Math.max(1, page), pages);
  const items = all.slice((p - 1) * 12, p * 12).map(([id, n]) => {
    const it = ITEMS[id], eq = r.equip.weapon === id || r.equip.armor === id;
    return { name: it.name, l2: `${RARITY[it.rar].name} · ${statText(it)}`, l3: `x${n}${eq ? tl("rgui.16") : ""}`, icon: it.icon, color: RARITY[it.rar].color };
  });
  const caption = [tl("rgui.17", { v: nameOf(env).toUpperCase(), p, pages }), ...all.slice((p - 1) * 12, p * 12).map(([id, n]) => `• ${ITEMS[id].name} x${n} _(${id})_`), "", `🪙 ${fmt(r.gold)}  💎 ${r.diamond}`, pages > 1 ? tl("rgui.18", { prefix: env.ctx.prefix }) : ""].filter((x) => x !== "").join("\n");
  return sendCard(env, "grid", { title: tl("rgui.19", { v: nameOf(env).toUpperCase() }), subtitle: tl("rgui.20", { length: all.length, prefix: env.ctx.prefix, prefix1: env.ctx.prefix, prefix2: env.ctx.prefix }), badge: tl("rgui.21", { p, pages }), chips: chips(r), items, empty: tl("rgui.22") }, caption);
};

export const SHOP_IDS = Object.keys(ITEMS).filter((id) => ITEMS[id].buy);
export const sendShop = async (env, r, page = 1) => {
  const pages = Math.max(1, Math.ceil(SHOP_IDS.length / 12)), p = Math.min(Math.max(1, page), pages);
  const list = SHOP_IDS.slice((p - 1) * 12, p * 12);
  const items = list.map((id) => { const it = ITEMS[id]; return { name: it.name, l2: `${statText(it)}  ·  id: ${id}`, l3: tl("rgui.23", { v: fmt(it.buy) }), icon: it.icon, color: RARITY[it.rar].color }; });
  const caption = [tl("rgui.24", { p, pages }), ...list.map((id) => `• ${ITEMS[id].name} — ${fmt(ITEMS[id].buy)} G _(${id})_`), "", tl("rgui.25", { prefix: env.ctx.prefix })].join("\n");
  return sendCard(env, "grid", { title: tl("rgui.26"), subtitle: tl("rgui.27", { prefix: env.ctx.prefix, prefix1: env.ctx.prefix }), badge: tl("rgui.28", { p, pages }), chips: chips(r), items }, caption);
};

// Nomor kartu bank: 16 digit tetap per pengguna (turunan dari JID).
export const cardNumber = (jid) => {
  const hex = crypto.createHash("sha256").update(String(jid)).digest("hex");
  return [0, 1, 2, 3].map((i) => String(parseInt(hex.slice(i * 6, i * 6 + 6), 16) % 10000).padStart(4, "0")).join(" ");
};

export const sendAtm = async (env, r, note = tl("rgui.29"), extraMentions = []) => {
  const { ctx, user, sock } = env, cap = bankCap(r);
  const since = new Date(user.reg?.at ?? Date.now()), mm = String(since.getMonth() + 1).padStart(2, "0"), yy = String(since.getFullYear()).slice(-2);
  const caption = [tl("rgui.30", { v: nameOf(env) }), `💳 ${cardNumber(ctx.senderId)}`, "", tl("rgui.31", { v: fmt(r.bank) }), tl("rgui.32", { v: fmt(r.gold) }), tl("rgui.33", { v: fmt(interestPerDay(r)) }), tl("rgui.34", { v: fmt(r.bank), v1: fmt(cap) }), "", note].join("\n");
  const old = atmClean() ? takeTrail(env) : [];
  const sent = await sendCard(env, "atm", {
    name: nameOf(env), number: cardNumber(ctx.senderId), since: `${mm}/${yy}`,
    balance: `${fmt(r.bank)} G`, wallet: `${fmt(r.gold)} G`, total: `${fmt(r.bank + r.gold)} G`,
    interest: tl("rgui.35", { v: fmt(interestPerDay(r)) }), limit: `${fmt(r.bank)} / ${fmt(cap)}`, ratio: r.bank / cap, note,
  }, caption, extraMentions);
  // Hemat chat: hanya kartu ATM terbaru yang tersisa — kartu/pesan ATM sebelumnya & pesan perintah pemain dihapus.
  if (atmClean()) {
    trackAtm(env, sent);
    wipeKeys(sock, old);
    const raw = ctx.raw?.key;
    if (raw?.id && raw.remoteJid === ctx.chatId && !raw.fromMe) sock.sendMessage(ctx.chatId, { delete: raw }).catch(() => {});
  }
  return sent;
};
