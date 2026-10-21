import { definePlugin } from "#lib/plugins";
import { t } from "#lib/i18n";
import * as game from "#lib/rpg";
import { sendCard } from "#lib/rpgui";
import { fetchAvatar } from "#lib/cards";
import { numberOf } from "#lib/utils";

// Foto profil di-cache 10 menit supaya .leaderboard berulang tidak menunggu WhatsApp.
const avatarCache = (globalThis.__miyakoLbAvatars ??= new Map());
const avatarOf = async (sock, jid) => {
  const hit = avatarCache.get(jid);
  if (hit && Date.now() - hit.at < 600_000) return hit.buf;
  const buf = await fetchAvatar(sock, jid);
  avatarCache.set(jid, { at: Date.now(), buf });
  return buf;
};

const MEDAL = ["🥇", "🥈", "🥉"];
const RANK_COLOR = ["0xffc857", "0xc9d4e0", "0xd9925a"];

/*
 * .leaderboard [kategori] — papan peringkat bergambar (kartu).
 * Kategori: petualang, uang, gold, bank, berlian, limit, level, kill, dungeon, orderan, duel, suit, chess, balap (alias bahasa Inggris juga bisa).
 */
export default definePlugin({
  name: "leaderboard",
  aliases: ["top", "lb", "peringkat"],
  category: "rpg",
  access: { group: true },
  description: "Rankings: adventurer / money / limit / gold / etc. (card)",
  usage: "leaderboard [petualang|uang|limit|gold|berlian|level|kill|orderan|suit|chess|...]",
  async run(env) {
    const { ctx } = env, p = ctx.pfx;
    const key = game.resolveBoard(ctx.args[0]);
    const kinds = Object.keys(game.LEADERBOARDS).join(" · ");
    if (!key) return ctx.reply(t("lb.unknown", { q: ctx.args[0], list: kinds, p }));

    const board = game.LEADERBOARDS[key];
    const { top, total, me } = game.boardOf(key, ctx.senderId, 10);
    if (!top.length) return ctx.reply(t("lb.empty", { label: board.label }));

    const caption = [
      t("lb.title", { label: board.label.toUpperCase() }),
      "",
      ...top.map((x) => `${MEDAL[x.rank - 1] ?? `${x.rank}.`} *${x.name}* — ${x.main}`),
      "",
      me ? t("lb.me", { rank: me.rank, total, main: me.main }) : t("lb.noMe", { total }),
      t("lb.others", { list: kinds }),
      t("lb.example", { p }),
    ].join("\n");

    // Foto profil tiap pemain menggantikan ikon bintang/koin (tanpa foto → lingkaran berwarna + huruf awal).
    const avatars = await Promise.all(top.map((x) => avatarOf(env.sock, x.jid).catch(() => null)));
    const items = top.map((x, i) => ({ name: `#${x.rank} ${x.name}`, rawName: x.name, l2: x.sub, l3: x.main, avatar: avatars[i] ?? null, icon: board.icon, color: RANK_COLOR[x.rank - 1] ?? "0x5aa9ff" }));

    await sendCard(env, "grid", {
      title: t("lb.title", { label: board.label.toUpperCase() }).replace(/[*🏆]/g, "").trim(),
      subtitle: t("lb.cardSub", { n: top.length, p }),
      badge: "TOP 10",
      chips: [board.label, t("lb.players", { n: total }), me ? t("lb.youRank", { r: me.rank }) : t("lb.notRanked"), "Miyako - BA"],
      items,
      name: "Leaderboard",
    }, caption);
  },
});
