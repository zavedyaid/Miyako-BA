import { groups } from "#lib/groups";
import { t as tl } from "#lib/i18n";
import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { sendResult } from "#lib/rpgui";
import { tr } from "#lib/tr";

/*
 * .use  <item> [jumlah]        → pakai item apa pun dari tas: ramuan (HP/stamina), senjata/zirah (dipasang), peti (dibuka).
 * .open <peti> [jumlah|all]    → buka peti dari tas (maks 10 sekali buka).
 *   • .open tanpa argumen: admin grup → buka grup (fungsi lama .open/.buka, tetap jalan) · pemain biasa → buka peti
 *     yang dimiliki (kalau cuma punya satu jenis) / daftar peti.
 */
const CAP = 10;
const CRATE_IDS = ["petikayu", "petiemas", "petidiamond"];
const owned = (r) => CRATE_IDS.filter((id) => game.count(r, id) > 0);
const ownedLine = (r) => owned(r).map((id) => `${game.ITEMS[id].name} _(${id})_ ×${game.count(r, id)}`).join(", ") || "-";

const openCrates = async (env, r, id, want) => {
  const have = game.count(r, id);
  if (have <= 0) return env.ctx.reply(tr(`📦 Kamu tidak punya *${game.ITEMS[id].name}*.`, `📦 You don't have a *${game.ITEMS[id].name}*.`));
  const n = Math.min(want === "all" ? have : Math.max(1, Math.floor(Number(want)) || 1), have, CAP);
  const outs = [];
  for (let i = 0; i < n; i++) { game.takeItem(r, id, 1); outs.push(game.openCrate(r, id)); }
  env.db.save("users");
  await sendResult(env, r, { title: tl("rpg2.reward.1"), subtitle: `${game.ITEMS[id].name} x${n}`, badge: "TERBUKA", accent: "0xffd566", rows: game.crateRows(outs), ok: true });
};

const usePotion = async (env, r, id, want) => {
  const { ctx, db } = env, it = game.ITEMS[id], have = game.count(r, id);
  const n = Math.min(Math.max(1, Math.floor(Number(want)) || 1), 20);
  if (have < n) return ctx.reply(tl("rpg.shop.12", { name: it.name, v: have }));
  const { maxHp } = game.statsOf(r);
  game.takeItem(r, id, n);
  if (it.heal) r.hp = Math.min(maxHp, r.hp + it.heal * n);
  if (it.stamina) r.stamina = Math.min(game.STAMINA_MAX, r.stamina + it.stamina * n);
  db.save("users");
  await ctx.reply(tl("rpg.shop.13", { name: it.name, n, hp: r.hp, maxHp, stamina: r.stamina, STAMINA_MAX: game.STAMINA_MAX }));
};

const useGear = async (env, r, id) => {
  const { ctx, db } = env, it = game.ITEMS[id];
  r.equip[it.type] = id;
  db.save("users");
  const st = game.statsOf(r);
  await ctx.reply(tr(`✅ *${it.name}* terpasang.\n🗡️ ATK ${st.atk}  🛡️ DEF ${st.def}`, `✅ *${it.name}* equipped.\n🗡️ ATK ${st.atk}  🛡️ DEF ${st.def}`));
};

const use = definePlugin({
  name: "use",
  aliases: ["pakai", "minum", "gunakan"],
  category: "rpg",
  access: { group: true },
  description: "Pakai item dari tas: ramuan, senjata/zirah (dipasang), peti (dibuka)",
  usage: "use <id item> [jumlah]",
  async run(env) {
    const { ctx, user } = env, r = game.getRpg(user);
    const id = game.findItem(ctx.args[0] ?? "");
    if (!id || !game.ITEMS[id]) return ctx.reply(tr(`❓ Item tidak ketemu. Lihat id item di *${ctx.pfx}inv*.\nContoh: *${ctx.pfx}use potionhp 2*`, `❓ Item not found. Check item ids in *${ctx.pfx}inv*.\nExample: *${ctx.pfx}use potionhp 2*`));
    if (game.count(r, id) <= 0) return ctx.reply(tr(`🎒 Kamu tidak punya *${game.ITEMS[id].name}*.`, `🎒 You don't have *${game.ITEMS[id].name}*.`));
    const type = game.ITEMS[id].type;
    if (type === "potion") return usePotion(env, r, id, ctx.args[1]);
    if (type === "weapon" || type === "armor") return useGear(env, r, id);
    if (game.isCrate(id)) return openCrates(env, r, id, ctx.args[1]);
    return ctx.reply(tr(`🚫 *${game.ITEMS[id].name}* tidak bisa dipakai langsung.`, `🚫 *${game.ITEMS[id].name}* can't be used directly.`));
  },
});

const open = definePlugin({
  name: "open",
  aliases: ["buka"],
  category: "rpg",
  ownHelp: true,
  access: { group: true },
  description: "Buka peti dari tas · admin grup: .open tanpa argumen = buka grup",
  usage: "open <petikayu|petiemas|petidiamond> [jumlah|all]",
  async run(env) {
    const { ctx, user, sock, role } = env, p = ctx.pfx, r = game.getRpg(user);
    const [a, b] = ctx.args;
    const id = a ? game.findItem(a) : null;

    if (id && game.isCrate(id)) return openCrates(env, r, id, b);

    // .open tanpa argumen oleh admin grup → fungsi lama: buka grup (semua anggota bisa chat)
    if (!a && ctx.isGroup) {
      const { isAdmin, isBotAdmin } = await env.group();
      if (isAdmin || role.owner) {
        if (!isBotAdmin) return ctx.reply(tr("⚠️ Jadikan bot admin dulu supaya bisa membuka grup.", "⚠️ Make the bot an admin first so it can open the group."));
        groups.silence(ctx.chatId);
        await sock.groupSettingUpdate(ctx.chatId, "not_announcement");
        return ctx.reply(tl("grp.info.1"));
      }
    }

    const mine = owned(r);
    const countArg = /^(\d+|all|semua)$/i.test(a ?? "");
    if ((!a || countArg) && mine.length === 1) return openCrates(env, r, mine[0], /^semua$/i.test(a) ? "all" : a);
    if (!mine.length) return ctx.reply(tr(`📦 Kamu tidak punya peti.\nDapatkan dari *${p}daily*, *${p}weekly*, menang catur, atau petualangan.`, `📦 You have no crates.\nGet them from *${p}daily*, *${p}weekly*, chess wins or adventures.`));
    return ctx.reply(tr(`📦 *BUKA PETI*\nPeti kamu: ${ownedLine(r)}\n\nCara: *${p}open <id peti> [jumlah|all]*\nContoh: *${p}open ${mine[0]} 3*`, `📦 *OPEN CRATE*\nYour crates: ${ownedLine(r)}\n\nUsage: *${p}open <crate id> [amount|all]*\nExample: *${p}open ${mine[0]} 3*`));
  },
});

export default [use, open];
