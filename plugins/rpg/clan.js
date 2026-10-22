import * as C from "#lib/clan";
import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { announce, rememberSock } from "#lib/sched";
import { fmt, tr } from "#lib/tr";
import { numberOf } from "#lib/utils";
import { db } from "#lib/database";

/*
 * 🏰 KLAN + ⚔️ WAR KLAN (lib/clan.js).
 *   .clan create <nama> · info [nama] · list · members · join <nama> · invite @tag · accept · leave · kick @tag
 *         promote/demote @tag · transfer @tag · open/close · desc <teks> · setchat · donate <gold|all> · upgrade · daily · disband yes
 *   .clan war <klan> · war search · war accept · war decline  (leader/officer)
 *   .war — status war · .war attack <no> (alias .attack / .serang) · .war roster · .war surrender
 */
const ROLE_ICON = { leader: "👑", officer: "⭐", member: "•" };
const tag = (jid) => `@${numberOf(jid)}`;
const who = (ctx) => ctx.mentionedJid?.[0] ?? ctx.quotedSender ?? null;
const rpgOf = (env) => game.getRpg(env.user);
const mins = (ms) => `${Math.max(1, Math.ceil(ms / 60_000))} ${tr("mnt", "min")}`;
const hours = (ms) => (ms >= 3_600_000 ? `${Math.floor(ms / 3_600_000)}${tr("j", "h")} ${Math.floor((ms % 3_600_000) / 60_000)}m` : mins(ms));

const ERR = {
  inClan: () => tr("⚠️ Kamu sudah punya klan / pemain itu sudah di klan.", "⚠️ You (or they) are already in a clan."),
  noClan: (a, b) => { const p = typeof a === "string" ? a : b; return tr(`⚠️ Kamu belum punya klan. Buat: *${p}clan create <nama>* atau gabung: *${p}clan list*`, `⚠️ You have no clan. Create: *${p}clan create <name>* or join: *${p}clan list*`); },
  badName: () => tr("❌ Nama klan 3–16 karakter (huruf/angka/spasi).", "❌ Clan name must be 3–16 chars (letters/numbers/spaces)."),
  taken: () => tr("❌ Nama klan sudah dipakai.", "❌ That clan name is taken."),
  level: (e) => tr(`❌ Butuh level ${e.need} untuk membuat klan.`, `❌ You need level ${e.need} to create a clan.`),
  gold: (e) => (e.need ? tr(`❌ Butuh ${fmt(e.need)} Gold di dompet.`, `❌ You need ${fmt(e.need)} Gold in your wallet.`) : tr("❌ Gold di dompetmu kurang.", "❌ Not enough Gold in your wallet.")),
  full: () => tr("❌ Klan sudah penuh. Upgrade level klan untuk menambah kapasitas.", "❌ The clan is full. Upgrade the clan level for more slots."),
  closed: () => tr("🔒 Klan ini tertutup — butuh undangan.", "🔒 This clan is invite-only."),
  perm: () => tr("🚫 Hanya leader/officer yang bisa melakukan ini.", "🚫 Only the leader/officers can do this."),
  leaderOnly: () => tr("🚫 Hanya leader klan.", "🚫 Leader only."),
  leaderLeave: (_, p) => tr(`👑 Leader tidak bisa keluar. *${p}clan transfer @tag* dulu atau *${p}clan disband yes*.`, `👑 The leader can't leave. *${p}clan transfer @tag* first or *${p}clan disband yes*.`),
  inWar: () => tr("⚔️ Tidak bisa saat klan sedang war.", "⚔️ Not possible while the clan is at war."),
  targetInWar: () => tr("⚔️ Klan lawan sedang war.", "⚔️ The target clan is at war."),
  notMember: () => tr("❌ Dia bukan anggota klanmu.", "❌ They aren't in your clan."),
  self: () => tr("😅 Tidak bisa pada diri sendiri.", "😅 Can't do that to yourself."),
  rank: () => tr("🚫 Pangkatmu tidak cukup.", "🚫 Your rank isn't high enough."),
  maxOfficers: () => tr(`❌ Officer maksimal ${C.CFG.maxOfficers}.`, `❌ Max ${C.CFG.maxOfficers} officers.`),
  targetInClan: () => tr("⚠️ Dia sudah punya klan.", "⚠️ They already have a clan."),
  min: (e) => tr(`❌ Donasi minimal ${fmt(e.min)} Gold.`, `❌ Minimum donation is ${fmt(e.min)} Gold.`),
  max: () => tr("🏆 Klan sudah level maksimal.", "🏆 The clan is at max level."),
  treasury: (e) => tr(`❌ Kas klan kurang — butuh ${fmt(e.cost)} Gold.`, `❌ Not enough in the treasury — need ${fmt(e.cost)} Gold.`),
  done: () => tr("✅ Check-in hari ini sudah diambil. Besok lagi!", "✅ You've already checked in today. Come back tomorrow!"),
  tooSmall: (e) => tr(`❌ Kedua klan minimal ${e.min} anggota untuk war.`, `❌ Both clans need at least ${e.min} members for a war.`),
  self2: () => tr("😅 Tidak bisa menantang klan sendiri.", "😅 You can't challenge your own clan."),
  none: () => tr("❌ Tidak ada tantangan war yang menunggu.", "❌ No pending war challenge."),
  gone: () => tr("❌ Tantangan sudah tidak berlaku.", "❌ The challenge is no longer valid."),
};
const err = (e, p) => (ERR[e.error] ?? (() => `❌ ${e.error}`))(e, p);

const notify = (sock, clan, text, mentions = []) => announce([clan.chat], text, mentions);

const bonusOf = (c) => `+${Math.round(game.CLAN_PERK * c.lvl * 100)}%`;
const infoText = (c) => {
  const leader = Object.entries(c.members).find(([, m]) => m.role === "leader")?.[0];
  const war = C.warOf(c);
  const lines = [
    `🏰 *${c.name}* [${c.tag}] — Lv ${c.lvl}`,
    `👑 ${leader ? tag(leader) : "-"}  ·  👥 ${C.size(c)}/${C.memberCap(c)}  ·  ${c.open ? "🔓" : "🔒"}`,
    `💰 ${tr("Kas", "Treasury")}: ${fmt(c.treasury)}${c.lvl < C.CFG.maxLevel ? ` / ${fmt(C.upgradeCost(c))}` : ""}  ·  🏆 ${c.trophies}  ·  ⚔️ ${c.wins}W-${c.losses}L`,
    `🎯 ${tr("Bonus anggota", "Member bonus")}: ${bonusOf(c)} HP/ATK/DEF`,
  ];
  if (c.desc) lines.push(`📜 ${c.desc}`);
  if (war) lines.push(`🔥 ${tr("Sedang war", "At war")}: ${C.table()[war.a === c.id ? war.b : war.a]?.name}`);
  if (c.log.length) lines.push("", ...c.log.slice(0, 4).map((l) => `› ${l.text}`));
  return { text: lines.join("\n"), mentions: leader ? [leader] : [] };
};

const HELP = (p) => tr(
  `🏰 *KLAN & WAR*\n*Dasar*\n› *${p}clan create <nama>* — buat klan (${fmt(C.CFG.createCost)} Gold, Lv ${C.CFG.minLevel}+)\n› *${p}clan list* · *info [nama]* · *members*\n› *${p}clan join <nama>* · *invite @tag* · *accept* · *leave*\n› *${p}clan donate <gold|all>* — isi kas · *upgrade* — naikkan level (+2% HP/ATK/DEF per level)\n› *${p}clan daily* — check-in harian\n*Kelola (leader/officer)*\n› *kick @tag* · *promote/demote @tag* · *transfer @tag* · *open/close* · *desc <teks>* · *setchat* · *disband yes*\n*⚔️ War klan*\n› *${p}clan war <nama klan>* — tantang · *war search* — cari lawan otomatis · *war accept/decline*\n› *${p}war* — status · *${p}war attack <no>* (alias *${p}attack <no>*) · *${p}war roster* · *${p}war surrender*\n› Tiap anggota ${C.CFG.warAttacks}× serang, jeda ${C.CFG.warAttackCd / 60_000} mnt. Bintang terbanyak menang; hadiah Gold acak 500–2000 untuk yang ikut menyerang.`,
  `🏰 *CLAN & WAR*\n*Basics*\n› *${p}clan create <name>* — make a clan (${fmt(C.CFG.createCost)} Gold, Lv ${C.CFG.minLevel}+)\n› *${p}clan list* · *info [name]* · *members*\n› *${p}clan join <name>* · *invite @tag* · *accept* · *leave*\n› *${p}clan donate <gold|all>* — fund the treasury · *upgrade* — level up (+2% HP/ATK/DEF per level)\n› *${p}clan daily* — daily check-in\n*Manage (leader/officer)*\n› *kick @tag* · *promote/demote @tag* · *transfer @tag* · *open/close* · *desc <text>* · *setchat* · *disband yes*\n*⚔️ Clan war*\n› *${p}clan war <clan name>* — challenge · *war search* — auto matchmaking · *war accept/decline*\n› *${p}war* — status · *${p}war attack <no>* (alias *${p}attack <no>*) · *${p}war roster* · *${p}war surrender*\n› Each member gets ${C.CFG.warAttacks} attacks, ${C.CFG.warAttackCd / 60_000} min apart. Most stars wins; random 500–2000 Gold for everyone who attacked.`,
);

const rosterText = (war, clanId, { viewer } = {}) => {
  const foe = war.a === clanId ? war.b : war.a;
  const lines = [`🎯 *${C.table()[foe]?.name ?? foe}* — ${tr("pilih target", "pick a target")}:`];
  war.rosters[foe].forEach((d, i) => lines.push(`${i + 1}. ${d.name} · ⚡${d.power} · ${"⭐".repeat(d.stars) || "☆"}${d.stars === 3 ? " ✅" : ""}`));
  void viewer;
  return lines.join("\n");
};

const warStatus = (war, clanId, jid) => {
  const A = C.table()[war.a], B = C.table()[war.b], mine = war.rosters[clanId].find((m) => m.jid === jid);
  const lines = [
    `⚔️ *${A?.name}*  ⭐${C.stars(war, war.a)}  vs  ⭐${C.stars(war, war.b)}  *${B?.name}*`,
    `⏳ ${tr("Sisa waktu", "Time left")}: ${hours(Math.max(0, war.end - Date.now()))}`,
  ];
  if (mine) lines.push(`🗡️ ${tr("Seranganmu", "Your attacks")}: ${C.CFG.warAttacks - mine.att}/${C.CFG.warAttacks}${mine.last + C.CFG.warAttackCd > Date.now() ? ` · ${tr("jeda", "cooldown")} ${mins(mine.last + C.CFG.warAttackCd - Date.now())}` : ""}`);
  else lines.push(tr("ℹ️ Kamu tidak termasuk roster war ini (hanya anggota terkuat saat war dimulai).", "ℹ️ You're not on this war's roster (only the strongest members at the start)."));
  lines.push("", rosterText(war, clanId));
  if (war.log.length) lines.push("", ...war.log.slice(0, 4).map((l) => `› ${l.by} → ${l.foe}: ${"⭐".repeat(l.stars) || "💥"}`));
  return lines.join("\n");
};

/* ── .clan ───────────────────────────────────────────────────────────────── */
const clanCmd = definePlugin({
  name: "clan",
  aliases: ["guild", "klan"],
  category: "rpg",
  ownHelp: true,
  description: "Clans: create/join, treasury, level perks and clan wars",
  usage: "clan create|join|info|list|donate|war ...",
  async run(env) {
    const { ctx, sock, user } = env, p = ctx.pfx, me = ctx.senderId, r = rpgOf(env);
    rememberSock(sock);
    for (const out of C.settleDue()) await announce(Object.values(out.war.chats), C.settleText(out), out.payouts.map((x) => x.jid));
    const sub = (ctx.args[0] ?? "").toLowerCase(), rest = ctx.args.slice(1).join(" ");
    const mine = C.clanOf(me);
    const target = who(ctx);
    const need = () => (mine ? null : ctx.reply(ERR.noClan(p)));

    if (!sub || sub === "help") return ctx.reply(!sub && mine ? `${infoText(mine).text}\n\n_${tr(`Ketik *${p}clan help* untuk semua perintah.`, `Type *${p}clan help* for all commands.`)}_` : HELP(p), { mentions: mine ? infoText(mine).mentions : [] });

    if (sub === "create" || sub === "buat") {
      if (!ctx.isGroup) return ctx.reply(tr("🏰 Buat klan di grup (pengumuman klan akan dikirim ke grup itu).", "🏰 Create the clan in a group (clan announcements go there)."));
      const res = C.createClan(me, rest, r, ctx.chatId);
      if (res.error) return ctx.reply(err(res, p));
      return ctx.reply(tr(`🏰 Klan *${res.clan.name}* [${res.clan.tag}] berdiri!\n👑 Kamu leader. Ajak teman: *${p}clan invite @tag* — mereka *${p}clan accept*\n💰 Isi kas: *${p}clan donate <gold>* lalu *${p}clan upgrade*`, `🏰 Clan *${res.clan.name}* [${res.clan.tag}] founded!\n👑 You're the leader. Invite friends: *${p}clan invite @tag* — they *${p}clan accept*\n💰 Fund it: *${p}clan donate <gold>* then *${p}clan upgrade*`));
    }

    if (sub === "info" || sub === "profil") {
      const c = rest ? C.getClan(rest) : mine;
      if (!c) return ctx.reply(rest ? tr("❌ Klan tidak ditemukan.", "❌ Clan not found.") : ERR.noClan(p));
      const i = infoText(c);
      return ctx.reply(i.text, { mentions: i.mentions });
    }

    if (sub === "list" || sub === "top" || sub === "rank") {
      const top = C.topClans(10);
      if (!top.length) return ctx.reply(tr(`🏰 Belum ada klan. Jadilah yang pertama: *${p}clan create <nama>*`, `🏰 No clans yet. Be the first: *${p}clan create <name>*`));
      return ctx.reply([`🏆 *${tr("Peringkat Klan", "Clan Ranking")}*`, ...top.map((c, i) => `${i + 1}. ${c.open ? "🔓" : "🔒"} *${c.name}* [${c.tag}] Lv${c.lvl} · 👥${C.size(c)}/${C.memberCap(c)} · 🏆${c.trophies}`), "", tr(`Gabung: *${p}clan join <nama>*`, `Join: *${p}clan join <name>*`)].join("\n"));
    }

    if (sub === "members" || sub === "anggota") {
      if (need()) return need();
      const list = C.ranked(mine);
      return ctx.reply([`👥 *${mine.name}* (${list.length}/${C.memberCap(mine)})`, ...list.map((m, i) => `${i + 1}. ${ROLE_ICON[m.role]} ${tag(m.jid)} · Lv${m.lvl} · ⚡${m.power} · 💰${fmt(mine.members[m.jid].contrib)}`)].join("\n"), { mentions: list.map((m) => m.jid) });
    }

    if (sub === "join" || sub === "gabung") {
      const c = rest ? C.getClan(rest) : C.invitesFor(me)[0];
      if (!c) return ctx.reply(rest ? tr("❌ Klan tidak ditemukan.", "❌ Clan not found.") : tr(`❌ Tulis nama klan: *${p}clan join <nama>*`, `❌ Name the clan: *${p}clan join <name>*`));
      const res = C.joinClan(me, c, r);
      if (res.error) return ctx.reply(err(res, p));
      return ctx.reply(tr(`✅ Kamu bergabung ke *${c.name}*! Bonus +${Math.round(game.CLAN_PERK * c.lvl * 100)}% HP/ATK/DEF aktif.`, `✅ You joined *${c.name}*! +${Math.round(game.CLAN_PERK * c.lvl * 100)}% HP/ATK/DEF bonus is active.`));
    }

    if (sub === "accept" || sub === "terima") {
      const c = rest ? C.getClan(rest) : C.invitesFor(me)[0];
      if (!c) return ctx.reply(tr("❌ Tidak ada undangan klan untukmu.", "❌ You have no clan invitations."));
      const res = C.joinClan(me, c, r);
      return ctx.reply(res.error ? err(res, p) : tr(`✅ Kamu bergabung ke *${c.name}*!`, `✅ You joined *${c.name}*!`));
    }

    if (need()) return need();

    if (sub === "invite" || sub === "undang") {
      if (!target) return ctx.reply(tr(`❌ Tag orangnya: *${p}clan invite @tag*`, `❌ Tag them: *${p}clan invite @tag*`));
      const res = C.invite(mine, me, target);
      return ctx.reply(res.error ? err(res, p) : tr(`📨 ${tag(target)} diundang ke *${mine.name}*. Jawab: *${p}clan accept* (berlaku ${C.CFG.inviteMs / 60_000} mnt)`, `📨 ${tag(target)} was invited to *${mine.name}*. Reply: *${p}clan accept* (valid ${C.CFG.inviteMs / 60_000} min)`), { mentions: [target] });
    }

    if (sub === "leave" || sub === "keluar") {
      const name = mine.name, res = C.leaveClan(me);
      return ctx.reply(res.error ? err(res, p) : res.disbanded ? tr(`🏚️ Klan *${name}* dibubarkan (kamu anggota terakhir).`, `🏚️ Clan *${name}* was disbanded (you were the last member).`) : tr(`🚪 Kamu keluar dari *${name}*.`, `🚪 You left *${name}*.`));
    }

    if (sub === "kick") {
      if (!target) return ctx.reply(tr(`❌ Tag orangnya: *${p}clan kick @tag*`, `❌ Tag them: *${p}clan kick @tag*`));
      const res = C.kick(mine, me, target);
      return ctx.reply(res.error ? err(res, p) : tr(`🥾 ${tag(target)} dikeluarkan dari klan.`, `🥾 ${tag(target)} was kicked from the clan.`), { mentions: [target] });
    }

    if (["promote", "demote", "transfer"].includes(sub)) {
      if (!target) return ctx.reply(tr(`❌ Tag orangnya: *${p}clan ${sub} @tag*`, `❌ Tag them: *${p}clan ${sub} @tag*`));
      const role = sub === "promote" ? "officer" : sub === "demote" ? "member" : "leader";
      const res = C.setRole(mine, me, target, role);
      return ctx.reply(res.error ? err(res, p) : `${ROLE_ICON[role]} ${tag(target)} → *${role}*`, { mentions: [target] });
    }

    if (sub === "open" || sub === "close" || sub === "buka" || sub === "tutup") {
      if (!C.canManage(mine, me)) return ctx.reply(err({ error: "perm" }, p));
      mine.open = sub === "open" || sub === "buka";
      db.save("clans");
      return ctx.reply(mine.open ? tr("🔓 Klan terbuka — siapa pun bisa gabung.", "🔓 Clan is open — anyone can join.") : tr("🔒 Klan tertutup — hanya lewat undangan.", "🔒 Clan is closed — invite only."));
    }

    if (sub === "desc" || sub === "deskripsi") {
      if (!C.canManage(mine, me)) return ctx.reply(err({ error: "perm" }, p));
      mine.desc = rest.slice(0, 120);
      db.save("clans");
      return ctx.reply(tr("📜 Deskripsi klan diperbarui.", "📜 Clan description updated."));
    }

    if (sub === "setchat") {
      if (!C.canManage(mine, me)) return ctx.reply(err({ error: "perm" }, p));
      if (!ctx.isGroup) return ctx.reply(tr("🏰 Jalankan di grup yang ingin menerima pengumuman klan.", "🏰 Run this in the group that should receive clan announcements."));
      mine.chat = ctx.chatId;
      db.save("clans");
      return ctx.reply(tr("📣 Grup ini sekarang menerima pengumuman klan & war.", "📣 This group now receives clan & war announcements."));
    }

    if (sub === "donate" || sub === "donasi") {
      const amt = /^(all|semua)$/i.test(rest) ? r.gold : Number(String(rest).replace(/[.,]/g, ""));
      const res = C.donate(mine, me, r, amt);
      return ctx.reply(res.error ? err(res, p) : tr(`💰 Kamu donasi ${fmt(res.amt)} Gold. Kas klan: ${fmt(mine.treasury)}`, `💰 You donated ${fmt(res.amt)} Gold. Treasury: ${fmt(mine.treasury)}`));
    }

    if (sub === "upgrade") {
      const res = C.upgrade(mine, me);
      return ctx.reply(res.error ? err(res, p) : tr(`⬆️ *${mine.name}* naik ke Lv ${mine.lvl}! Bonus anggota ${bonusOf(mine)} HP/ATK/DEF, kapasitas ${C.memberCap(mine)}.`, `⬆️ *${mine.name}* reached Lv ${mine.lvl}! Member bonus ${bonusOf(mine)} HP/ATK/DEF, capacity ${C.memberCap(mine)}.`));
    }

    if (sub === "daily" || sub === "checkin") {
      const res = C.dailyClaim(mine, me, r);
      return ctx.reply(res.error ? err(res, p) : tr(`📅 Check-in klan: +${fmt(res.gold)} Gold · +${res.xp} XP (kas klan +250)`, `📅 Clan check-in: +${fmt(res.gold)} Gold · +${res.xp} XP (treasury +250)`));
    }

    if (sub === "disband" || sub === "bubar") {
      if (!/^(yes|ya|y)$/i.test(rest)) return ctx.reply(tr(`⚠️ Membubarkan klan permanen (kas hilang). Ketik *${p}clan disband yes*`, `⚠️ Disbanding is permanent (treasury is lost). Type *${p}clan disband yes*`));
      const name = mine.name, res = C.disband(mine, me);
      return ctx.reply(res.error ? err(res, p) : tr(`🏚️ Klan *${name}* dibubarkan.`, `🏚️ Clan *${name}* was disbanded.`));
    }

    /* ── war ── */
    if (sub === "war") {
      const w = (ctx.args[1] ?? "").toLowerCase();
      if (!w) return ctx.reply(warPlugin.statusFor(env, mine));
      if (w === "search" || w === "cari") {
        const res = C.searchWar(mine, me);
        if (res.error) return ctx.reply(err(res, p));
        if (res.started) return warPlugin.announceStart(env, res.war);
        return ctx.reply(tr(`🔎 *${mine.name}* mencari lawan (${C.CFG.queueMs / 60_000} mnt). Begitu klan lain juga mencari, war dimulai otomatis.`, `🔎 *${mine.name}* is looking for an opponent (${C.CFG.queueMs / 60_000} min). The war starts automatically when another clan searches.`));
      }
      if (w === "cancel" || w === "batal") { C.cancelSearch(mine); return ctx.reply(tr("🔎 Pencarian lawan dibatalkan.", "🔎 Matchmaking cancelled.")); }
      if (w === "accept" || w === "terima") {
        const res = C.acceptWar(mine, me);
        return res.error ? ctx.reply(err(res, p)) : warPlugin.announceStart(env, res.war);
      }
      if (w === "decline" || w === "tolak") {
        const res = C.declineWar(mine, me);
        if (res.error) return ctx.reply(err(res, p));
        if (res.from) await notify(sock, res.from, tr(`❌ *${mine.name}* menolak tantangan war.`, `❌ *${mine.name}* declined the war challenge.`));
        return ctx.reply(tr("❌ Tantangan war ditolak.", "❌ War challenge declined."));
      }
      const foe = C.getClan(ctx.args.slice(1).join(" "));
      if (!foe) return ctx.reply(tr(`❌ Klan tidak ditemukan. Lihat: *${p}clan list*`, `❌ Clan not found. See: *${p}clan list*`));
      if (foe.id === mine.id) return ctx.reply(ERR.self2());
      const res = C.declareWar(mine, me, foe);
      if (res.error) return ctx.reply(err(res, p));
      if (res.started) return warPlugin.announceStart(env, res.war);
      await notify(sock, foe, tr(`⚔️ Klan *${mine.name}* menantang *${foe.name}* war!\nLeader/officer: *${p}clan war accept* atau *${p}clan war decline* (${C.CFG.challengeMs / 60_000} mnt)`, `⚔️ Clan *${mine.name}* challenges *${foe.name}* to war!\nLeader/officers: *${p}clan war accept* or *${p}clan war decline* (${C.CFG.challengeMs / 60_000} min)`));
      return ctx.reply(tr(`⚔️ Tantangan war dikirim ke *${foe.name}*. Menunggu jawaban (${C.CFG.challengeMs / 60_000} mnt).`, `⚔️ War challenge sent to *${foe.name}*. Waiting for a reply (${C.CFG.challengeMs / 60_000} min).`));
    }

    return ctx.reply(tr("❓ Perintah klan tidak jelas. Ini semua perintahnya:\n\n", "❓ Unclear clan command. Here are all of them:\n\n") + HELP(p));
    void user;
  },
});

/* ── .war ────────────────────────────────────────────────────────────────── */
const warPlugin = definePlugin({
  name: "war",
  aliases: ["attack", "serang", "perang"],
  category: "rpg",
  ownHelp: true,
  description: "Clan war: status, attack an enemy, roster, surrender",
  usage: "war · war attack <no> · attack <no>",
  statusFor(env, clan) {
    const war = C.warOf(clan);
    if (!war) return tr(`⚔️ Klan *${clan.name}* tidak sedang war.\nTantang: *${env.ctx.pfx}clan war <nama klan>* atau *${env.ctx.pfx}clan war search*`, `⚔️ *${clan.name}* isn't at war.\nChallenge: *${env.ctx.pfx}clan war <clan name>* or *${env.ctx.pfx}clan war search*`);
    return warStatus(war, clan.id, env.ctx.senderId);
  },
  async announceStart(env, war) {
    const A = C.table()[war.a], B = C.table()[war.b], p = env.ctx.pfx;
    const text = tr(
      `⚔️ *WAR KLAN DIMULAI!*\n🏰 *${A.name}* vs *${B.name}*\n👥 ${war.rosters[war.a].length} vs ${war.rosters[war.b].length} pemain · ⏳ ${hours(war.end - Date.now())}\n\nTiap anggota roster ${C.CFG.warAttacks}× serang: *${p}war attack <no musuh>*\nLihat target: *${p}war*`,
      `⚔️ *CLAN WAR STARTED!*\n🏰 *${A.name}* vs *${B.name}*\n👥 ${war.rosters[war.a].length} vs ${war.rosters[war.b].length} players · ⏳ ${hours(war.end - Date.now())}\n\nEach roster member has ${C.CFG.warAttacks} attacks: *${p}war attack <enemy no>*\nSee targets: *${p}war*`,
    );
    await announce([A.chat, B.chat, env.ctx.chatId], text);
  },
  async run(env) {
    const { ctx, sock } = env, p = ctx.pfx, me = ctx.senderId;
    rememberSock(sock);
    for (const out of C.settleDue()) await announce(Object.values(out.war.chats), C.settleText(out), out.payouts.map((x) => x.jid));
    const mine = C.clanOf(me);
    if (!mine) return ctx.reply(ERR.noClan(p));
    // `.attack 3` / `.serang 3` = `.war attack 3`
    const viaAlias = ["attack", "serang"].includes(ctx.command);
    const args = viaAlias ? ["attack", ...ctx.args] : ctx.args;
    const sub = (args[0] ?? "").toLowerCase();
    const war = C.warOf(mine);

    if (!sub || sub === "status") return ctx.reply(warPlugin.statusFor(env, mine));
    if (!war) return ctx.reply(warPlugin.statusFor(env, mine));

    if (sub === "roster" || sub === "target") return ctx.reply(rosterText(war, mine.id));

    if (sub === "surrender" || sub === "menyerah") {
      if (mine.members[me].role !== "leader") return ctx.reply(ERR.leaderOnly());
      if (!/^(yes|ya|y)$/i.test(args[1] ?? "")) return ctx.reply(tr(`🏳️ Menyerah = klan kalah. Ketik *${p}war surrender yes*`, `🏳️ Surrender = the clan loses. Type *${p}war surrender yes*`));
      const out = C.settleWar(war, { loser: mine.id });
      return announce([...Object.values(out.war.chats), ctx.chatId], C.settleText(out), out.payouts.map((x) => x.jid));
    }

    if (sub === "attack" || sub === "serang" || sub === "hit") {
      const rank = Number(args[1]);
      if (!Number.isInteger(rank) || rank < 1) return ctx.reply(`${rosterText(war, mine.id)}\n\n${tr(`Serang: *${p}war attack <no>*`, `Attack: *${p}war attack <no>*`)}`);
      const res = C.attackWar(war, mine.id, me, rank);
      if (res.error === "cooldown") return ctx.reply(tr(`⏳ Tunggu ${mins(res.ms)} lagi.`, `⏳ Wait ${mins(res.ms)} more.`));
      if (res.error === "noAttacks") return ctx.reply(tr("🗡️ Seranganmu sudah habis.", "🗡️ You're out of attacks."));
      if (res.error === "notInRoster") return ctx.reply(tr("ℹ️ Kamu tidak ada di roster war ini.", "ℹ️ You aren't on this war's roster."));
      if (res.error === "badRank") return ctx.reply(`${tr("❌ Nomor musuh tidak valid.", "❌ Invalid enemy number.")}\n\n${rosterText(war, mine.id)}`);
      if (res.error) return ctx.reply(`❌ ${res.error}`);
      const verdict = res.win ? tr(`🏆 MENANG — ${"⭐".repeat(res.stars)} (sisa HP ${Math.round(res.hpLeft * 100)}%)`, `🏆 WIN — ${"⭐".repeat(res.stars)} (${Math.round(res.hpLeft * 100)}% HP left)`) : tr(`💥 KALAH — merusak ${Math.round(res.dmgPct * 100)}% HP musuh`, `💥 LOST — dealt ${Math.round(res.dmgPct * 100)}% of their HP`);
      const gain = res.gained ? tr(` (+${res.gained} ⭐ untuk klan)`, ` (+${res.gained} ⭐ for the clan)`) : tr(" (tidak menambah bintang)", " (no new stars)");
      await ctx.reply(`⚔️ ${tag(me)} → *${res.foe.name}*\n${verdict}${gain}\n🗡️ ${tr("Sisa seranganmu", "Attacks left")}: ${res.left}\n\n⭐ ${C.stars(war, war.a)} - ${C.stars(war, war.b)}`, { mentions: [me] });
      if (C.warDone(war)) for (const out of C.settleDue()) await announce([...Object.values(out.war.chats), ctx.chatId], C.settleText(out), out.payouts.map((x) => x.jid));
      return undefined;
    }

    return ctx.reply(tr(`❓ Pakai: *${p}war* · *${p}war attack <no>* · *${p}war roster* · *${p}war surrender*`, `❓ Use: *${p}war* · *${p}war attack <no>* · *${p}war roster* · *${p}war surrender*`));
  },
});

export default [clanCmd, warPlugin];
