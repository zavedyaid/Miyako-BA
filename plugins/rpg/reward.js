import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { sendResult } from "#lib/rpgui";
import { duration } from "#lib/utils";

const daily = definePlugin({
  name: "daily",
  aliases: ["hadiah", "claim", "harian"],
  category: "rpg",
  access: { group: true },
  description: "Klaim hadiah harian (streak = hadiah makin besar)",
  usage: "daily",
  async run(env) {
    const r = game.getRpg(env.user);
    const res = game.claimDaily(r);
    if (!res) return env.ctx.reply("🎁 Hadiah harian sudah kamu ambil hari ini. Kembali lagi besok!");
    env.db.save("users");
    await sendResult(env, r, res);
  },
});

const weekly = definePlugin({
  name: "weekly",
  aliases: ["mingguan"],
  category: "rpg",
  access: { group: true },
  description: "Klaim hadiah mingguan (gold, berlian, peti emas)",
  usage: "weekly",
  async run(env) {
    const r = game.getRpg(env.user);
    const res = game.claimWeekly(r);
    if (!res) return env.ctx.reply(`🎁 Hadiah mingguan bisa diklaim lagi dalam *${duration(game.WEEK - (Date.now() - r.weekly))}*.`);
    env.db.save("users");
    await sendResult(env, r, res);
  },
});

const crate = definePlugin({
  name: "peti",
  aliases: ["crate", "bukapeti"],
  category: "rpg",
  access: { group: true },
  description: "Buka peti dari tasmu",
  usage: "peti <petikayu|petiemas|petidiamond> [jumlah]",
  async run(env) {
    const { ctx, user } = env;
    const r = game.getRpg(user);
    const id = game.findItem(ctx.args[0] ?? "");
    if (!id || !game.isCrate(id)) return ctx.reply(`📦 Peti apa? Contoh: *${ctx.prefix}peti petikayu*\nPeti yang kamu punya: ${["petikayu", "petiemas", "petidiamond"].filter((x) => game.count(r, x)).map((x) => `${x} x${game.count(r, x)}`).join(", ") || "-"}`);
    const n = Math.min(Math.max(1, Number(ctx.args[1]) || 1), 10);
    if (game.count(r, id) < n) return ctx.reply(`📦 ${game.ITEMS[id].name} kamu tidak cukup (punya ${game.count(r, id)}).`);
    const outs = [];
    for (let i = 0; i < n; i++) { game.takeItem(r, id, 1); outs.push(game.openCrate(r, id)); }
    env.db.save("users");
    const rows = game.crateRows(outs);
    await sendResult(env, r, { title: "BUKA PETI", subtitle: `${game.ITEMS[id].name} x${n}`, badge: "TERBUKA", accent: "0xffd566", rows, ok: true });
  },
});

export default [daily, weekly, crate];
