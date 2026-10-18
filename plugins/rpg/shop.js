import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { sendResult, sendShop } from "#lib/rpgui";

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
  aliases: ["beli"],
  category: "rpg",
  access: { group: true },
  description: "Beli item dari toko",
  usage: "buy <id> [jumlah]",
  async run(env) {
    const { ctx, user, db } = env;
    const r = game.getRpg(user), id = game.findItem(ctx.args[0] ?? ""), n = amount(ctx.args[1], 1);
    if (!ctx.args[0]) return sendShop(env, r, 1);
    if (!id || !game.ITEMS[id].buy) return ctx.reply(`🏪 Item itu tidak dijual. Lihat daftar: *${ctx.prefix}toko*`);
    if (game.ITEMS[id].unique && (game.count(r, id) > 0 || n > 1)) {
      return ctx.reply(game.count(r, id) > 0 ? `✅ Kamu sudah punya *${game.ITEMS[id].name}*.${id === "atm" ? ` Atur PIN di chat pribadi: *${ctx.prefix}setpin <4-6 angka>*, lalu buka dengan *${ctx.prefix}atm <Nomor Serial> <PIN>*.` : ""}` : `🏪 *${game.ITEMS[id].name}* hanya bisa dibeli 1.`);
    }
    const total = game.ITEMS[id].buy * n;
    if (r.gold < total) return ctx.reply(`🪙 Gold kurang. Butuh *${fmt(total)}*, kamu punya ${fmt(r.gold)}.`);
    r.gold -= total; game.addItem(r, id, n); db.save("users");
    if (id === "atm") {
      await sendResult(env, r, { title: "PEMBELIAN", subtitle: "Kartu ATM siap dipakai!", badge: "LUNAS", accent: "0x6fdc8c", rows: [game.itemRow(id, n), { icon: "coin", text: `Bayar ${fmt(total)} Gold`, sub: `Sisa dompet ${fmt(r.gold)} Gold` }, { icon: "star", text: `Atur PIN: ${ctx.prefix}setpin`, sub: "Lewat chat pribadi, lalu buka ATM dengan SN + PIN" }], ok: true });
      return;
    }
    await sendResult(env, r, { title: "PEMBELIAN", subtitle: "Terima kasih sudah berbelanja!", badge: "LUNAS", accent: "0x6fdc8c", rows: [game.itemRow(id, n), { icon: "coin", text: `Bayar ${fmt(total)} Gold`, sub: `Sisa dompet ${fmt(r.gold)} Gold` }], ok: true });
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
    if (!id || !game.count(r, id)) return ctx.reply(`🎒 Kamu tidak punya item itu. Cek: *${ctx.prefix}inv*`);
    if (!game.ITEMS[id].sell) return ctx.reply(`🚫 *${game.ITEMS[id].name}* tidak bisa dijual.`);
    const equipped = r.equip.weapon === id || r.equip.armor === id;
    const have = game.count(r, id) - (equipped ? 1 : 0);
    if (have <= 0) return ctx.reply("🛡️ Item itu sedang dipakai. Lepas dulu dengan *.unequip*.");
    const n = Math.min(amount(ctx.args[1], have), have), total = game.ITEMS[id].sell * n;
    game.takeItem(r, id, n); r.gold += total; db.save("users");
    await sendResult(env, r, { title: "PENJUALAN", subtitle: "Item terjual", badge: "TERJUAL", accent: "0xffd566", rows: [game.itemRow(id, n), { icon: "coin", text: `+${fmt(total)} Gold`, sub: `Dompet sekarang ${fmt(r.gold)} Gold` }], ok: true });
  },
});

const use = definePlugin({
  name: "pakai",
  aliases: ["use", "minum"],
  category: "rpg",
  access: { group: true },
  description: "Pakai ramuan (HP / stamina)",
  usage: "pakai <id> [jumlah]",
  async run({ ctx, user, db }) {
    const r = game.getRpg(user), id = game.findItem(ctx.args[0] ?? ""), it = game.ITEMS[id];
    if (!id || it.type !== "potion") return ctx.reply(`🧪 Item apa? Contoh: *${ctx.prefix}pakai potionhp*`);
    const n = Math.min(Math.max(1, Number(ctx.args[1]) || 1), 20);
    if (game.count(r, id) < n) return ctx.reply(`🎒 ${it.name} kamu hanya ${game.count(r, id)}.`);
    const { maxHp } = game.statsOf(r);
    game.takeItem(r, id, n);
    if (it.heal) r.hp = Math.min(maxHp, r.hp + it.heal * n);
    if (it.stamina) r.stamina = Math.min(game.STAMINA_MAX, r.stamina + it.stamina * n);
    db.save("users");
    await ctx.reply(`🧪 Memakai *${it.name} x${n}*\n❤️ HP ${r.hp}/${maxHp}  ⚡ Stamina ${r.stamina}/${game.STAMINA_MAX}`);
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
    if (!id || !["weapon", "armor"].includes(it.type) || !game.count(r, id)) return ctx.reply(`⚔️ Pasang apa? Pilih senjata/zirah yang ada di tas (*${ctx.prefix}inv*).`);
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
    await ctx.reply(`✅ ${slot === "armor" ? "Zirah" : "Senjata"} dilepas.`);
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
    if (!id || !game.RECIPES[id]) return ctx.reply(["🔨 *RESEP TEMPA*", ...Object.keys(game.RECIPES).map(line), "", `Tempa: *${ctx.prefix}tempa <id>*`].join("\n"));
    const rc = game.RECIPES[id], lacking = Object.entries(rc).filter(([k, v]) => (k === "gold" ? r.gold : game.count(r, k)) < v);
    if (lacking.length) return ctx.reply(`🔨 Bahan kurang untuk *${game.ITEMS[id].name}*:\n${line(id)}`);
    for (const [k, v] of Object.entries(rc)) k === "gold" ? (r.gold -= v) : game.takeItem(r, k, v);
    game.addItem(r, id, 1); db.save("users");
    await ctx.reply(`🔨 Berhasil menempa *${game.ITEMS[id].name}*! Pasang dengan *${ctx.prefix}equip ${id}*.`);
  },
});

export default [shop, buy, sell, use, equip, unequip, craft];
