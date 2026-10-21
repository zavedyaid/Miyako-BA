import { t } from "#lib/i18n";
import { db } from "#lib/database";
import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { sendAtm } from "#lib/rpgui";
import { hasPending, requestAtm, submitPin } from "#lib/atmflow";
import { t as tl } from "#lib/i18n";

const fmt = (n) => Number(n).toLocaleString("id-ID");

// Buka rekening (otomatis) + masukkan bunga yang tertunda.
const open = (env) => {
  const r = game.getRpg(env.user);
  return { r, gain: game.accrue(r) };
};
const interestNote = (gain) => (gain ? `Bunga masuk: +${fmt(gain)} G` : "");
const norm = (text) => String(text ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();

/*
 * Alur ATM:  .buy atm  →  .setpin <PIN> (chat pribadi)  →  .atm <Nomor Serial> <PIN>  →  Success.
 * Nomor Serial (SN) ada di .profil / .kartu. Setelah Success, ATM terbuka 10 menit untuk deposit / tarik / transfer.
 */
const needAtm = (env, r) => {
  const p = env.ctx.pfx;
  if (game.hasAtm(r)) return false;
  env.ctx.reply(tl("rpg.bank.1", { p, v: fmt(game.ITEMS.atm.buy), p1: p }));
  return true;
};
const needOpen = (env, r) => {
  const { ctx } = env, p = ctx.pfx;
  if (needAtm(env, r)) return true;
  if (game.atmIsOpen(ctx.senderId)) return false;
  ctx.reply(`🔒 ATM masih terkunci.\nKetik *${p}atm* lalu masukkan PIN di chat pribadi.\n_Belum daftar? *${p}register atm*_`);
  return true;
};

const atm = definePlugin({
  name: "atm",
  ownHelp: true,
  aliases: ["bank", "saldo", "rekening"],
  category: "rpg",
  access: { group: true },
  description: "ATM: ketik .atm di grup, lalu ketik PIN-mu langsung di chat pribadi bot (wajib beli Kartu ATM dulu)",
  usage: "atm",
  async run(env) {
    const { ctx, user } = env, p = ctx.pfx;
    const { r, gain } = open(env);
    if (needAtm(env, r)) return;

    const [sn, pin] = ctx.args;
    // Sesi masih terbuka → .atm tanpa argumen langsung menampilkan ATM (tidak perlu SN + PIN lagi)
    if (!sn && !pin && game.atmIsOpen(ctx.senderId)) {
      db.save("users");
      return sendAtm(env, r, `🏧 ATM masih terbuka.\n${interestNote(gain) || `${p}deposit <jumlah|all> · ${p}tarik <jumlah|all> · ${p}transfer @tag <jumlah>`}`.trim());
    }
    // .atm saja → alur baru: PIN diisi lewat chat pribadi (kartu ATM muncul di grup tadi)
    if (!sn || !pin) return requestAtm(env, r);

    // Pesan berisi PIN: hapus bila bot bisa (di grup, hanya kalau bot admin).
    if (ctx.isGroup) ctx.delete().catch(() => {});

    const wait = game.pinLockedMinutes(r);
    if (wait) return ctx.reply(tl("rpg.bank.7", { wait }));
    if (!game.hasPin(r)) return ctx.reply(tl("rpg.bank.8", { p }));
    if (norm(sn) !== norm(user.reg?.sn)) return ctx.reply(tl("rpg.bank.9", { p, p1: p }));
    if (!game.checkPin(r, pin)) {
      const left = game.pinFailed(r);
      db.save("users");
      return ctx.reply(left ? tl("rpg.bank.10", { left }) : tl("rpg.bank.11"));
    }

    game.pinOk(r);
    game.openAtm(ctx.senderId);
    db.save("users");
    await sendAtm(env, r, `✅ Success! ATM terbuka 10 menit.\n${interestNote(gain) || `${p}deposit <jumlah|all> · ${p}tarik <jumlah|all> · ${p}transfer @tag <jumlah>`}`.trim());
  },
});

// PIN diketik LANGSUNG di chat pribadi (angka 4–6 digit, tanpa perintah) setelah .atm di grup.
// .atmpin <PIN> tetap bisa dipakai (disembunyikan dari menu).
const atmpin = definePlugin({
  name: "atmpin",
  aliases: ["kodepin"],
  category: "rpg",
  hidden: true,
  access: { private: true },
  description: "Masukkan PIN ATM (opsional — PIN cukup diketik langsung di chat pribadi)",
  usage: "atmpin <PIN>",
  run: (env) => submitPin(env),
  async passive(env) {
    const { ctx } = env;
    if (ctx.isGroup || ctx.fromMe || ctx.isCmd || !/^\d{4,6}$/.test((ctx.text ?? "").trim())) return;
    if (!hasPending(env)) return;
    return submitPin(env, ctx.text.trim());
  },
});

const setpin = definePlugin({
  name: "setpin",
  aliases: ["aturpin", "pinatm"],
  category: "rpg",
  description: "Atur / ganti PIN ATM (hanya di chat pribadi)",
  usage: "setpin <PIN baru> · setpin <PIN lama> <PIN baru>",
  access: { private: true },
  async run(env) {
    const { ctx } = env, p = ctx.pfx;
    const r = game.getRpg(env.user);
    const [a, b] = ctx.args;
    if (!a) return ctx.reply(game.hasPin(r) ? tl("rpg2.bank.1", { p }) : tl("bk3.1", { p }));

    if (game.hasPin(r)) {
      const wait = game.pinLockedMinutes(r);
      if (wait) return ctx.reply(tl("rpg.bank.12", { wait }));
      if (!b) return ctx.reply(tl("rpg.bank.13", { p }));
      if (!game.checkPin(r, a)) {
        const left = game.pinFailed(r);
        db.save("users");
        return ctx.reply(left ? tl("rpg.bank.14", { left }) : tl("rpg.bank.15"));
      }
    }
    const pin = game.hasPin(r) ? b : a;
    if (!game.validPin(pin)) return ctx.reply(tl("rpg.bank.16"));
    game.setPin(r, pin);
    db.save("users");
    await ctx.reply(tl("rpg.bank.17", { p, p1: p, p2: p }));
  },
});

const dep = definePlugin({
  name: "deposit",
  aliases: ["dep", "simpan", "setor"],
  category: "rpg",
  access: { group: true },
  description: "Setor gold dari dompet ke bank (bunga 1%/hari)",
  usage: "deposit <jumlah|all>",
  async run(env) {
    const { ctx } = env, { r, gain } = open(env);
    if (needOpen(env, r)) return;
    const want = game.parseAmount(ctx.args[0], r.gold);
    if (!want) return ctx.reply(tl("rpg.bank.18", { prefix: ctx.pfx, prefix1: ctx.pfx, prefix2: ctx.pfx }));
    const room = game.bankCap(r) - r.bank;
    if (room <= 0) return ctx.reply(tl("rpg.bank.19", { v: fmt(game.bankCap(r)) }));
    if (!r.gold) return ctx.reply(tl("rpg2.bank.2"));
    const amt = game.deposit(r, want);
    db.save("users");
    await sendAtm(env, r, `Setor ${fmt(amt)} G berhasil${amt < want ? " (dibatasi saldo / limit)" : ""}. ${interestNote(gain)}`.trim());
  },
});

const wd = definePlugin({
  name: "tarik",
  aliases: ["withdraw", "wd", "ambil"],
  category: "rpg",
  access: { group: true },
  description: "Tarik gold dari bank ke dompet",
  usage: "tarik <jumlah|all>",
  async run(env) {
    const { ctx } = env, { r, gain } = open(env);
    if (needOpen(env, r)) return;
    const want = game.parseAmount(ctx.args[0], r.bank);
    if (!want) return ctx.reply(tl("rpg.bank.20", { prefix: ctx.pfx, prefix1: ctx.pfx }));
    if (!r.bank) return ctx.reply(tl("rpg2.bank.3"));
    const amt = game.withdraw(r, want);
    db.save("users");
    await sendAtm(env, r, `Tarik ${fmt(amt)} G berhasil. ${interestNote(gain)}`.trim());
  },
});

const WALLET = /^(dompet|wallet|gold)$/i, BANK = /^(bank|atm|rekening)$/i;
const where = (w) => t(w === "bank" ? "tf.bank" : "tf.wallet");

const transfer = definePlugin({
  name: "transfer",
  aliases: ["tf", "kirim"],
  category: "rpg",
  access: { group: true },
  description: "Send Gold from your wallet or bank to another player's wallet / bank (2% fee)",
  usage: "transfer @tag <amount|all> [wallet|bank] [wallet|bank]",
  async run(env) {
    const { ctx } = env, p = ctx.pfx, { r } = open(env);
    if (needOpen(env, r)) return;
    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender;
    const target = targetId && db.users[targetId];
    if (!target || targetId === ctx.senderId) return ctx.reply(t("tf.noTarget", { p }));

    // Kata pertama = sumber saldo, kata kedua = tujuan (bila tidak ditulis, tujuan = sama dengan sumber).
    const places = ctx.args.filter((a) => WALLET.test(a) || BANK.test(a)).map((a) => (BANK.test(a) ? "bank" : "wallet"));
    const from = places[0] ?? "wallet", to = places[1] ?? from;
    const balance = from === "bank" ? r.bank : r.gold, icon = from === "bank" ? "🏦" : "👛";
    const raw = ctx.args.find((a) => /^(\d|all$|semua$|habis$)/i.test(a));
    if (!raw) return ctx.reply(t("tf.howMuch"));
    const all = /^(all|semua|habis)$/i.test(raw);
    const amount = all ? Math.floor(balance / 1.02) : game.parseAmount(raw, balance);
    if (!amount) return ctx.reply(all ? t("tf.empty", { icon, where: where(from) }) : t("tf.howMuch"));

    const fee = Math.max(1, Math.round(amount * 0.02));
    if (balance < amount + fee) return ctx.reply(t("tf.short", { icon, where: where(from), need: fmt(amount + fee), have: fmt(balance) }));

    const tr = game.getRpg(target);
    if (to === "bank") {
      game.accrue(tr);
      const room = game.bankCap(tr) - tr.bank;
      if (amount > room) return ctx.reply(t("tf.bankRoom", { room: fmt(Math.max(0, room)), cap: fmt(game.bankCap(tr)), p, amount, from: where(from) }));
    }

    if (from === "bank") r.bank -= amount + fee; else r.gold -= amount + fee;
    if (to === "bank") tr.bank += amount; else tr.gold += amount;
    db.save("users");
    await sendAtm(env, r, t("tf.done", { amount: fmt(amount), from: where(from), to: where(to), name: target.reg?.name ?? t("tf.player"), fee: fmt(fee) }), [targetId]);
  },
});

export default [atm, atmpin, setpin, dep, wd, transfer];
