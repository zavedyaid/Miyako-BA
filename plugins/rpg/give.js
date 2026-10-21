import { definePlugin } from "#lib/plugins";
import { db } from "#lib/database";
import { describe, grant, parseSpec } from "#lib/redeem";
import { ITEMS, count, getRpg, takeItem } from "#lib/rpg";
import { tr } from "#lib/tr";
import { numberOf } from "#lib/utils";

/*
 * .give @tag <apa> <jumlah> — kasih barang / apapun ke pemain lain.
 *   Pemain biasa : dipindahkan DARI tasnya — gold, diamond, limit, atau item (mis. .give @tag gold 500 · .give @tag potionhp 3 · .give @tag limit 5)
 *   Owner        : GRATIS & tanpa batas, dan boleh apa saja — gold, diamond, limit, premium, exp, xp, level, item
 *                  (mis. .give @tag gold=100k diamond=50 premium=30d item=petiemas:3 · .give @tag pedangnaga 1)
 * Target: tag, atau reply pesannya. Owner tanpa target = diri sendiri.
 */
export default definePlugin({
  name: "give",
  aliases: ["kasih", "beri", "gift", "bagi"],
  category: "rpg",
  access: { group: true },
  description: "Give items, gold, diamonds or limit to another player (owner: anything, free)",
  usage: "give @tag <gold|diamond|limit|item> <amount>",
  async run(env) {
    const { ctx, user, role } = env, p = ctx.pfx;
    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender ?? (role.owner ? ctx.senderId : null);
    const help = tr(
      `🎁 *GIVE*\n› *${p}give @tag gold 500*\n› *${p}give @tag potionhp 3*\n› *${p}give @tag limit 5*\n› *${p}give @tag diamond 2*\nBarang diambil dari tasmu.${role.owner ? `\n\n👑 Owner (gratis, bebas): *${p}give @tag gold=100k diamond=50 premium=30d level=5 item=petiemas:3*` : ""}`,
      `🎁 *GIVE*\n› *${p}give @tag gold 500*\n› *${p}give @tag potionhp 3*\n› *${p}give @tag limit 5*\n› *${p}give @tag diamond 2*\nItems are taken from your bag.${role.owner ? `\n\n👑 Owner (free, anything): *${p}give @tag gold=100k diamond=50 premium=30d level=5 item=petiemas:3*` : ""}`,
    );
    if (!targetId) return ctx.reply(help);

    const spec = parseSpec(ctx.args.filter((a) => !a.startsWith("@")).map((a) => a.replace(/^\+/, "")));
    // parseSpec menganggap kata pertama yang tak dikenal sebagai "kode" — di sini itu berarti salah ketik
    if (spec.errors.length || spec.code || !Object.keys(spec.rewards).length) return ctx.reply(help);
    const rw = spec.rewards;

    const target = db.user(targetId);
    if (!role.owner) {
      if (targetId === ctx.senderId) return ctx.reply(tr("😅 Tidak bisa memberi ke diri sendiri.", "😅 You can't give to yourself."));
      if (!target.reg?.on) return ctx.reply(tr("❌ Penerima belum terdaftar.", "❌ The recipient isn't registered."));
      const illegal = ["exp", "xp", "level", "premiumDays"].find((k) => rw[k]);
      if (illegal) return ctx.reply(tr(`❌ *${illegal}* hanya bisa diberikan owner.`, `❌ *${illegal}* can only be given by the owner.`));

      const r = getRpg(user);
      for (const [id, n] of Object.entries(rw.items ?? {})) {
        if (ITEMS[id].unique) return ctx.reply(tr(`❌ ${ITEMS[id].name} tidak bisa dipindahkan.`, `❌ ${ITEMS[id].name} can't be transferred.`));
        if (count(r, id) < n) return ctx.reply(tr(`❌ ${ITEMS[id].name} di tasmu cuma ${count(r, id)}.`, `❌ You only have ${count(r, id)} ${ITEMS[id].name}.`));
      }
      if ((rw.gold ?? 0) > r.gold) return ctx.reply(tr(`❌ Gold di dompetmu cuma ${r.gold}.`, `❌ You only have ${r.gold} Gold in your wallet.`));
      if ((rw.diamond ?? 0) > r.diamond) return ctx.reply(tr(`❌ Diamond-mu cuma ${r.diamond}.`, `❌ You only have ${r.diamond} Diamond.`));
      if ((rw.limit ?? 0) > user.limit) return ctx.reply(tr(`❌ Limit-mu cuma ${user.limit}.`, `❌ You only have ${user.limit} Limit.`));

      r.gold -= rw.gold ?? 0;
      r.diamond -= rw.diamond ?? 0;
      user.limit -= rw.limit ?? 0;
      for (const [id, n] of Object.entries(rw.items ?? {})) takeItem(r, id, n);
    }

    grant(target, rw);
    db.save("users");
    await ctx.reply(
      [tr(`🎁 *GIVE* — dari @${numberOf(ctx.senderId)} untuk @${numberOf(targetId)}`, `🎁 *GIVE* — from @${numberOf(ctx.senderId)} to @${numberOf(targetId)}`), ...describe(rw)].join("\n"),
      { mentions: [ctx.senderId, targetId] },
    );
  },
});
