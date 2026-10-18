import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { sendCard } from "#lib/rpgui";

const MEDAL = ["🥇", "🥈", "🥉"];
const RANK_COLOR = ["0xffc857", "0xc9d4e0", "0xd9925a"];

/*
 * .leaderboard [kategori] — papan peringkat bergambar (kartu).
 * Kategori: petualang, uang, gold, bank, berlian, limit, level, kill, dungeon, orderan, duel, suit, balap.
 */
export default definePlugin({
  name: "leaderboard",
  aliases: ["top", "lb", "peringkat", "rank"],
  category: "rpg",
  access: { group: true },
  description: "Papan peringkat: petualang / uang / limit / gold / dll (kartu)",
  usage: "leaderboard [petualang|uang|limit|gold|berlian|level|kill|orderan|suit|...]",
  async run(env) {
    const { ctx } = env, p = ctx.prefix;
    const key = game.resolveBoard(ctx.args[0]);
    const kinds = Object.keys(game.LEADERBOARDS).join(" · ");
    if (!key) return ctx.reply(`🏆 Kategori *${ctx.args[0]}* tidak ada.\n📋 Tersedia: ${kinds}\nContoh: *${p}leaderboard uang*`);

    const board = game.LEADERBOARDS[key];
    const { top, total, me } = game.boardOf(key, ctx.senderId, 10);
    if (!top.length) return ctx.reply(`🏆 Belum ada data untuk *${board.label}*.`);

    const caption = [
      `🏆 *LEADERBOARD ${board.label.toUpperCase()}*`,
      "",
      ...top.map((x) => `${MEDAL[x.rank - 1] ?? `${x.rank}.`} *${x.name}* — ${x.main}`),
      "",
      me ? `📍 Peringkatmu: *#${me.rank}* dari ${total} pemain (${me.main})` : `📍 Kamu belum masuk peringkat ini (${total} pemain).`,
      `📋 Kategori lain: ${kinds}`,
      `Contoh: *${p}leaderboard limit*`,
    ].join("\n");

    const items = top.map((x) => ({
      name: `#${x.rank} ${x.name}`,
      l2: x.sub,
      l3: x.main,
      icon: board.icon,
      color: RANK_COLOR[x.rank - 1] ?? "0x5aa9ff",
    }));

    await sendCard(env, "grid", {
      title: `LEADERBOARD ${board.label.toUpperCase()}`,
      subtitle: `Top ${top.length} pemain  ·  ${p}leaderboard <kategori>`,
      badge: "TOP 10",
      chips: [board.label, `${total} pemain`, me ? `Kamu #${me.rank}` : "Belum masuk", "Miyako - BA"],
      items,
      name: "Leaderboard",
    }, caption);
  },
});
