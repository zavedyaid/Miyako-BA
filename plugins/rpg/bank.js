import { db } from "#lib/database";
import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { sendAtm } from "#lib/rpgui";

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
  const p = env.ctx.prefix;
  if (game.hasAtm(r)) return false;
  env.ctx.reply(`🏧 Kamu belum punya *Kartu ATM*.\nBeli dulu: *${p}buy atm* (${fmt(game.ITEMS.atm.buy)} G)\nCek harga & stok di *${p}toko*.`);
  return true;
};
const needOpen = (env, r) => {
  const { ctx } = env, p = ctx.prefix;
  if (needAtm(env, r)) return true;
  if (game.atmIsOpen(ctx.senderId)) return false;
  ctx.reply(`🔒 ATM masih terkunci.\nBuka dulu: *${p}atm <Nomor Serial> <PIN>*\n_SN ada di ${p}profil / ${p}kartu · PIN diatur lewat chat pribadi: ${p}setpin_`);
  return true;
};

const atm = definePlugin({
  name: "atm",
  aliases: ["bank", "saldo", "rekening"],
  category: "rpg",
  access: { group: true },
  description: "ATM: buka dengan Nomor Serial + PIN (wajib beli Kartu ATM dulu)",
  usage: "atm <Nomor Serial> <PIN>",
  async run(env) {
    const { ctx, user } = env, p = ctx.prefix;
    const { r, gain } = open(env);
    if (needAtm(env, r)) return;

    const [sn, pin] = ctx.args;
    if (!sn || !pin) {
      return ctx.reply(
        [
          "🏧 *ATM MIYAKO*",
          "",
          `Ketik: *${p}atm <Nomor Serial> <PIN>*`,
          `• Nomor Serial → lihat di *${p}profil* atau *${p}kartu*`,
          game.hasPin(r) ? "• PIN → PIN yang kamu atur sebelumnya" : `• PIN → atur dulu di *chat pribadi*: *${p}setpin <4-6 angka>*`,
        ].join("\n"),
      );
    }

    // Pesan berisi PIN: hapus bila bot bisa (di grup, hanya kalau bot admin).
    if (ctx.isGroup) ctx.delete().catch(() => {});

    const wait = game.pinLockedMinutes(r);
    if (wait) return ctx.reply(`⛔ Terlalu banyak salah PIN. ATM terkunci *${wait} menit* lagi.`);
    if (!game.hasPin(r)) return ctx.reply(`🔑 Kamu belum punya PIN.\nAtur di *chat pribadi* bot: *${p}setpin <4-6 angka>*`);
    if (norm(sn) !== norm(user.reg?.sn)) return ctx.reply(`❌ Nomor Serial salah.\nCek di *${p}profil* atau *${p}kartu*.`);
    if (!game.checkPin(r, pin)) {
      const left = game.pinFailed(r);
      db.save("users");
      return ctx.reply(left ? `❌ PIN salah. Sisa percobaan: *${left}*` : "⛔ PIN salah 5×. ATM terkunci *10 menit*.");
    }

    game.pinOk(r);
    game.openAtm(ctx.senderId);
    db.save("users");
    await sendAtm(env, r, `✅ Success! ATM terbuka 10 menit.\n${interestNote(gain) || `${p}deposit <jumlah|all> · ${p}tarik <jumlah|all> · ${p}transfer @tag <jumlah>`}`.trim());
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
    const { ctx } = env, p = ctx.prefix;
    const r = game.getRpg(env.user);
    const [a, b] = ctx.args;
    if (!a) return ctx.reply(game.hasPin(r) ? `🔑 Ganti PIN: *${p}setpin <PIN lama> <PIN baru>*` : `🔑 Atur PIN ATM (4–6 angka): *${p}setpin 123456*`);

    if (game.hasPin(r)) {
      const wait = game.pinLockedMinutes(r);
      if (wait) return ctx.reply(`⛔ Terlalu banyak salah PIN. Coba lagi *${wait} menit* lagi.`);
      if (!b) return ctx.reply(`🔑 Kamu sudah punya PIN. Ganti: *${p}setpin <PIN lama> <PIN baru>*`);
      if (!game.checkPin(r, a)) {
        const left = game.pinFailed(r);
        db.save("users");
        return ctx.reply(left ? `❌ PIN lama salah. Sisa percobaan: *${left}*` : "⛔ PIN salah 5×. Dikunci *10 menit*.");
      }
    }
    const pin = game.hasPin(r) ? b : a;
    if (!game.validPin(pin)) return ctx.reply("❌ PIN harus *4–6 angka* (contoh: 123456).");
    game.setPin(r, pin);
    db.save("users");
    await ctx.reply(`✅ PIN ATM tersimpan.\nBuka ATM: *${p}atm <Nomor Serial> <PIN>* (SN di *${p}profil* / *${p}kartu*)`);
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
    if (!want) return ctx.reply(`🏧 Berapa? Contoh: *${ctx.prefix}deposit 1000*, *${ctx.prefix}deposit 2k*, *${ctx.prefix}deposit all*`);
    const room = game.bankCap(r) - r.bank;
    if (room <= 0) return ctx.reply(`🏦 Bankmu penuh (limit ${fmt(game.bankCap(r))}). Naik level untuk menambah limit.`);
    if (!r.gold) return ctx.reply("👛 Dompetmu kosong.");
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
    if (!want) return ctx.reply(`🏧 Berapa? Contoh: *${ctx.prefix}tarik 1000*, *${ctx.prefix}tarik all*`);
    if (!r.bank) return ctx.reply("🏦 Saldo banknya kosong.");
    const amt = game.withdraw(r, want);
    db.save("users");
    await sendAtm(env, r, `Tarik ${fmt(amt)} G berhasil. ${interestNote(gain)}`.trim());
  },
});

const WALLET = /^(dompet|wallet|gold)$/i, BANK = /^(bank|atm|rekening)$/i;
const where = (w) => (w === "bank" ? "bank" : "dompet");

const transfer = definePlugin({
  name: "transfer",
  aliases: ["tf", "kirim"],
  category: "rpg",
  access: { group: true },
  description: "Kirim gold dari dompet atau bank ke dompet / bank pemain lain (biaya 2%)",
  usage: "transfer @tag <jumlah|all> [dompet|bank] [dompet|bank]",
  async run(env) {
    const { ctx } = env, p = ctx.prefix, { r } = open(env);
    if (needOpen(env, r)) return;
    const targetId = ctx.mentionedJid[0] ?? ctx.quotedSender;
    const target = targetId && db.users[targetId];
    if (!target || targetId === ctx.senderId) {
      return ctx.reply(`💸 Tag / reply orangnya.\nContoh: *${p}tf @tag 1000* (dari dompet)\n*${p}tf @tag 1000 bank* (dari bank ke bank)\n*${p}tf @tag 1000 bank dompet* (dari bank ke dompet tujuan)`);
    }

    // Kata pertama = sumber saldo, kata kedua = tujuan (bila tidak ditulis, tujuan = sama dengan sumber).
    const places = ctx.args.filter((a) => WALLET.test(a) || BANK.test(a)).map((a) => (BANK.test(a) ? "bank" : "wallet"));
    const from = places[0] ?? "wallet", to = places[1] ?? from;
    const balance = from === "bank" ? r.bank : r.gold;
    const raw = ctx.args.find((a) => /^(\d|all$|semua$|habis$)/i.test(a));
    if (!raw) return ctx.reply("💸 Jumlahnya berapa?");
    const all = /^(all|semua|habis)$/i.test(raw);
    const amount = all ? Math.floor(balance / 1.02) : game.parseAmount(raw, balance);
    if (!amount) return ctx.reply(all ? `👛 Saldo ${where(from)}mu kosong.` : "💸 Jumlahnya berapa?");

    const fee = Math.max(1, Math.round(amount * 0.02));
    if (balance < amount + fee) return ctx.reply(`${from === "bank" ? "🏦" : "👛"} Saldo ${where(from)} kurang. Butuh *${fmt(amount + fee)}* (termasuk biaya 2%), saldo ${where(from)}mu ${fmt(balance)}.`);

    const tr = game.getRpg(target);
    if (to === "bank") {
      game.accrue(tr);
      const room = game.bankCap(tr) - tr.bank;
      if (amount > room) return ctx.reply(`🏦 Bank tujuan hanya muat ${fmt(Math.max(0, room))} lagi (limit ${fmt(game.bankCap(tr))}). Coba kirim ke *dompet*: *${p}tf @tag ${amount} ${where(from)} dompet*`);
    }

    if (from === "bank") r.bank -= amount + fee; else r.gold -= amount + fee;
    if (to === "bank") tr.bank += amount; else tr.gold += amount;
    db.save("users");
    await sendAtm(env, r, `Transfer ${fmt(amount)} G (${where(from)} → ${where(to)}) ke ${target.reg?.name ?? "pemain"} (biaya ${fmt(fee)} G)`, [targetId]);
  },
});

export default [atm, setpin, dep, wd, transfer];
