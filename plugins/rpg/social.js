import { db } from "#lib/database";
import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { sendResult } from "#lib/rpgui";
import { t } from "#lib/i18n";
import { duration } from "#lib/utils";
import { t as tl } from "#lib/i18n";

const fmt = (n) => Number(n).toLocaleString("id-ID");
const wait = (ms) => `⏳ Tunggu *${duration(ms)}* lagi.`;
const targetOf = (ctx) => {
  const id = ctx.mentionedJid[0] ?? ctx.quotedSender;
  return id && id !== ctx.senderId && db.users[id]?.rpg ? { id, user: db.users[id] } : null;
};
const nameOf = (u, id) => u.reg?.name ?? u.name ?? id.split("@")[0];

const kerja = definePlugin({
  name: "kerja",
  aliases: ["work", "bekerja"],
  category: "rpg",
  access: { group: true },
  description: "Bekerja untuk gaji gold + XP (jeda 20 menit)",
  usage: "kerja",
  async run(env) {
    const r = game.getRpg(env.user), left = game.cooldownLeft(r, "kerja", game.CD.kerja);
    if (left) return env.ctx.reply(wait(left));
    const res = game.work(r);
    db.save("users");
    await sendResult(env, r, res);
  },
});

const duel = definePlugin({
  name: "duel",
  aliases: ["pvp", "tanding"],
  category: "rpg",
  access: { group: true },
  description: "Duel PvP dengan taruhan gold (jeda 5 menit)",
  usage: "duel @tag [taruhan]",
  async run(env) {
    const { ctx, user } = env, r = game.getRpg(user), t = targetOf(ctx);
    if (!t) return ctx.reply(tl("rpg.social.1", { prefix: ctx.pfx }));
    const left = game.cooldownLeft(r, "duel", game.CD.duel);
    if (left) return ctx.reply(wait(left));
    const tr = game.getRpg(t.user), bet = game.parseAmount(ctx.args.find((a) => /^\d/.test(a)), Math.min(r.gold, tr.gold));
    const res = game.duel(r, tr, bet, nameOf(t.user, t.id));
    db.save("users");
    await sendResult(env, r, res, [t.id]);
  },
});

const rampok = definePlugin({
  name: "rampok",
  aliases: ["rob", "curi"],
  category: "rpg",
  access: { group: true },
  description: "Rampok dompet pemain lain (uang di bank aman, jeda 1 jam)",
  usage: "rampok @tag",
  async run(env) {
    const { ctx, user } = env, r = game.getRpg(user), t = targetOf(ctx);
    if (!t) return ctx.reply(tl("rpg.social.2", { prefix: ctx.pfx }));
    const left = game.cooldownLeft(r, "rampok", game.CD.rampok);
    if (left) return ctx.reply(wait(left));
    const tr = game.getRpg(t.user);
    if (tr.gold < 100) return ctx.reply(tl("rpg.social.3"));
    if (r.gold < 100) return ctx.reply(tl("rpg.social.4"));
    const res = game.rob(r, tr, nameOf(t.user, t.id));
    db.save("users");
    await sendResult(env, r, res, [t.id]);
  },
});

const balap = definePlugin({
  name: "balap",
  aliases: ["race", "balapan"],
  category: "rpg",
  access: { group: true },
  description: "Motorbike race against another player with a Gold bet (5 min cooldown)",
  usage: "balap @tag [taruhan]",
  async run(env) {
    const { ctx, user } = env, r = game.getRpg(user), tg = targetOf(ctx);
    if (!tg) return ctx.reply(t("race.noTarget", { p: ctx.pfx }));
    const left = game.cooldownLeft(r, "balap", game.CD.balap);
    if (left) return ctx.reply(wait(left));
    const tr = game.getRpg(tg.user), bet = game.parseAmount(ctx.args.find((a) => /^\d/.test(a)), Math.min(r.gold, tr.gold));
    const res = game.race(r, tr, bet, nameOf(tg.user, tg.id));
    db.save("users");
    await sendResult(env, r, res, [tg.id]);
  },
});

const misi = definePlugin({
  name: "misi",
  aliases: ["quest", "tugas"],
  category: "rpg",
  access: { group: true },
  description: "Misi harian (selesaikan semua → hadiah). `.misi claim`",
  usage: "misi [claim]",
  async run(env) {
    const { ctx, user } = env, r = game.getRpg(user);
    if (/^(claim|klaim|ambil)$/i.test(ctx.args[0] ?? "")) {
      const rows = game.claimQuests(r);
      if (!rows) return ctx.reply(game.questState(r).claimed ? tl("rpg.social.5") : tl("rpg.social.6"));
      db.save("users");
      return sendResult(env, r, { title: tl("rpg2.social.1"), subtitle: tl("rpg.social.7"), badge: "KLAIM", accent: "0xffd566", rows, ok: true });
    }
    const done = game.questDone(r), claimed = game.questState(r).claimed;
    db.save("users");
    await sendResult(env, r, {
      title: tl("rpg2.social.2"), subtitle: claimed ? tl("rpg.social.8") : done ? tl("rpg.social.9", { prefix: ctx.pfx }) : tl("rpg.social.10"), badge: claimed ? "DIKLAIM" : done ? tl("rpg2.social.3") : tl("rpg2.social.4"), accent: done ? "0xffd566" : "0x6fd7ff",
      rows: [...game.questRows(r), { icon: "crate", text: tl("rpg2.social.5"), sub: tl("rpg2.social.6") }], ok: true,
    });
  },
});

export default [kerja, duel, balap, rampok, misi];
