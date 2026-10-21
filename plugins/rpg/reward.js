import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { sendResult } from "#lib/rpgui";
import { duration } from "#lib/utils";
import { t as tl } from "#lib/i18n";

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
    if (!res) return env.ctx.reply(tl("rpg.reward.1"));
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
    if (!res) return env.ctx.reply(tl("rpg.reward.2", { v: duration(game.WEEK - (Date.now() - r.weekly)) }));
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
    if (!id || !game.isCrate(id)) return ctx.reply(tl("rpg.reward.3", { prefix: ctx.pfx, v: ["petikayu", "petiemas", "petidiamond"].filter((x) => game.count(r, x)).map((x) => `${x} x${game.count(r, x)}`).join(", ") || "-" }));
    const n = Math.min(Math.max(1, Number(ctx.args[1]) || 1), 10);
    if (game.count(r, id) < n) return ctx.reply(tl("rpg.reward.4", { v: game.ITEMS[id].name, v1: game.count(r, id) }));
    const outs = [];
    for (let i = 0; i < n; i++) { game.takeItem(r, id, 1); outs.push(game.openCrate(r, id)); }
    env.db.save("users");
    const rows = game.crateRows(outs);
    await sendResult(env, r, { title: tl("rpg2.reward.1"), subtitle: `${game.ITEMS[id].name} x${n}`, badge: "TERBUKA", accent: "0xffd566", rows, ok: true });
  },
});

export default [daily, weekly, crate];
