import { dmRegisterGuide } from "#lib/atmflow";
import { lex } from "#lib/i18n";
import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { sendResult, sendShop } from "#lib/rpgui";
import { t as tl } from "#lib/i18n";

const fmt = (n) => Number(n).toLocaleString("id-ID");
const amount = (text, max) => (/^(all|semua)$/i.test(text ?? "") ? max : Math.max(1, Math.floor(Number(text)) || 1));

const shop = definePlugin({
  name: "toko",
  aliases: ["shop", "store"],
  category: "rpg",
  access: { group: true },
  description: "Lihat toko (kartu)",
  usage: "toko [halaman]",
  async run(env) { await sendShop(env, game.getRpg(env.user), Number(env.ctx.args[0]) || 1); },
});

const buy = definePlugin({
  name: "buy",
  ownHelp: true,
  aliases: ["beli"],
  category: "rpg",
  access: { group: true },
  description: "Beli item dari toko",
  usage: "buy <id> [jumlah]",
  async run(env) {
    const { ctx, user, db } = env;
    const r = game.getRpg(user), id = game.findItem(ctx.args[0] ?? ""), n = amount(ctx.args[1], 1);
    if (!ctx.args[0]) return sendShop(env, r, 1);
    if (!id || !game.ITEMS[id].buy) return ctx.reply(tl("rpg.shop.1", { prefix: ctx.pfx }));
    if (game.ITEMS[id].unique && (game.count(r, id) > 0 || n > 1)) {
      return ctx.reply(game.count(r, id) > 0 ? tl("rpg.shop.3", { v: game.ITEMS[id].name, v1: id === "atm" ? tl("rpg.shop.2", { prefix: ctx.pfx, prefix1: ctx.pfx }) : "" }) : tl("rpg.shop.4", { v: game.ITEMS[id].name }));
    }
    const total = game.ITEMS[id].buy * n;
    if (r.gold < total) return ctx.reply(tl("rpg.shop.5", { v: fmt(total), v1: fmt(r.gold) }));
    r.gold -= total; game.addItem(r, id, n); db.save("users");
    if (id === "atm") {
      await sendResult(env, r, { title: tl("rpg2.shop.1"), subtitle: tl("rpg2.shop.2"), badge: tl("rpg2.shop.3"), accent: "0x6fdc8c", rows: [game.itemRow(id, n), { icon: "coin", text: tl("rpg2.shop.4", { v: fmt(total) }), sub: tl("rpg2.shop.5", { v: fmt(r.gold) }) }, { icon: "star", text: `Daftarkan ATM: ${ctx.pfx}register atm`, sub: "Cek chat pribadi dari bot" }], ok: true });
      dmRegisterGuide(env);
      return;
    }
    await sendResult(env, r, { title: tl("rpg2.shop.6"), subtitle: tl("rpg.shop.7"), badge: tl("rpg2.shop.7"), accent: "0x6fdc8c", rows: [game.itemRow(id, n), { icon: "coin", text: tl("rpg2.shop.8", { v: fmt(total) }), sub: tl("rpg2.shop.9", { v: fmt(r.gold) }) }], ok: true });
  },
});

const sell = definePlugin({
  name: "sell",
  aliases: ["jual"],
  category: "rpg",
  access: { group: true },
  description: "Jual item dari tas",
  usage: "sell <id> [jumlah|all]",
  async run(env) {
    const { ctx, user, db } = env;
    const r = game.getRpg(user), id = game.findItem(ctx.args[0] ?? "");
    if (!id || !game.count(r, id)) return ctx.reply(tl("rpg.shop.8", { prefix: ctx.pfx }));
    if (!game.ITEMS[id].sell) return ctx.reply(tl("rpg.shop.9", { v: game.ITEMS[id].name }));
    const equipped = r.equip.weapon === id || r.equip.armor === id;
    const have = game.count(r, id) - (equipped ? 1 : 0);
    if (have <= 0) return ctx.reply(tl("rpg.shop.10"));
    const n = Math.min(amount(ctx.args[1], have), have), total = game.ITEMS[id].sell * n;
    game.takeItem(r, id, n); r.gold += total; db.save("users");
    await sendResult(env, r, { title: "PENJUALAN", subtitle: "Item terjual", badge: "TERJUAL", accent: "0xffd566", rows: [game.itemRow(id, n), { icon: "coin", text: `+${fmt(total)} Gold`, sub: tl("rpg2.shop.10", { v: fmt(r.gold) }) }], ok: true });
  },
});

const equip = definePlugin({
  name: "equip",
  aliases: ["pasang"],
  category: "rpg",
  access: { group: true },
  description: "Pasang senjata / zirah dari tas",
  usage: "equip <id>",
  async run({ ctx, user, db }) {
    const r = game.getRpg(user), id = game.findItem(ctx.args[0] ?? ""), it = game.ITEMS[id];
    if (!id || !["weapon", "armor"].includes(it.type) || !game.count(r, id)) return ctx.reply(tl("rpg.shop.14", { prefix: ctx.pfx }));
    r.equip[it.type] = id; db.save("users");
    const st = game.statsOf(r);
    await ctx.reply(`✅ *${it.name}* terpasang.\n🗡️ ATK ${st.atk}  🛡️ DEF ${st.def}`);
  },
});

const unequip = definePlugin({
  name: "unequip",
  aliases: ["lepas"],
  category: "rpg",
  access: { group: true },
  description: "Lepas senjata / zirah",
  usage: "unequip <weapon|armor>",
  async run({ ctx, user, db }) {
    const r = game.getRpg(user), slot = /arm|zirah|baju/i.test(ctx.args[0] ?? "") ? "armor" : "weapon";
    r.equip[slot] = null; db.save("users");
    await ctx.reply(tl("rpg3.unequip", { slot: lex(slot === "armor" ? "Zirah" : "Senjata") }));
  },
});

const craft = definePlugin({
  name: "tempa",
  aliases: ["craft", "forge"],
  category: "rpg",
  access: { group: true },
  description: "Tempa senjata / zirah dari bahan",
  usage: "tempa [id]",
  async run({ ctx, user, db }) {
    const r = game.getRpg(user), id = game.findItem(ctx.args[0] ?? "");
    const line = (rid) => {
      const rc = game.RECIPES[rid];
      return `• *${game.ITEMS[rid].name}* _(${rid})_ — ${Object.entries(rc).map(([k, v]) => (k === "gold" ? `${fmt(v)} G` : `${game.ITEMS[k].name} ${game.count(r, k)}/${v}`)).join(", ")}`;
    };
    if (!id || !game.RECIPES[id]) return ctx.reply([tl("rpg2.shop.11"), ...Object.keys(game.RECIPES).map(line), "", tl("rpg2.shop.12", { pfx: ctx.pfx })].join("\n"));
    const rc = game.RECIPES[id], lacking = Object.entries(rc).filter(([k, v]) => (k === "gold" ? r.gold : game.count(r, k)) < v);
    if (lacking.length) return ctx.reply(tl("rpg.shop.15", { v: game.ITEMS[id].name, v1: line(id) }));
    for (const [k, v] of Object.entries(rc)) k === "gold" ? (r.gold -= v) : game.takeItem(r, k, v);
    game.addItem(r, id, 1); db.save("users");
    await ctx.reply(tl("rpg.shop.16", { v: game.ITEMS[id].name, prefix: ctx.pfx, id }));
  },
});

export default [shop, buy, sell, equip, unequip, craft];
