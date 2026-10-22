import * as M from "#lib/market";
import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { fmt, tr } from "#lib/tr";
import { numberOf } from "#lib/utils";

/*
 * 🏪 .market — pasar antar pemain.
 *   .market [item] [hal] · sell <id item> <jumlah> <harga per buah> · buy <no> [jumlah] · mine · cancel <no>
 */
const ERR = {
  untradable: () => tr("🚫 Item ini tidak bisa diperdagangkan.", "🚫 This item can't be traded."),
  qty: () => tr("❌ Jumlah tidak valid.", "❌ Invalid amount."),
  price: () => tr(`❌ Harga per buah 1–${fmt(M.CFG.maxPrice)} Gold.`, `❌ Price per item must be 1–${fmt(M.CFG.maxPrice)} Gold.`),
  have: () => tr("🎒 Jumlah item di tasmu kurang.", "🎒 You don't have enough of that item."),
  equipped: () => tr("⚔️ Item itu sedang dipakai — lepas dulu (*.unequip*).", "⚔️ That item is equipped — unequip it first (*.unequip*)."),
  limit: (e) => tr(`📦 Maksimal ${e.max} listing aktif.`, `📦 Max ${e.max} active listings.`),
  gone: () => tr("❌ Listing tidak ditemukan (sudah terjual / dibatalkan).", "❌ Listing not found (sold or cancelled)."),
  own: () => tr("😅 Tidak bisa membeli barang sendiri.", "😅 You can't buy your own listing."),
  gold: (e) => tr(`💰 Gold di dompet kurang (butuh ${fmt(e.cost)}).`, `💰 Not enough Gold in your wallet (need ${fmt(e.cost)}).`),
  notYours: () => tr("🚫 Itu bukan listing-mu.", "🚫 That isn't your listing."),
};
const line = (l) => `*#${l.id}* ${game.ITEMS[l.item].name} ×${l.qty} — ${fmt(l.price)} G/${tr("buah", "ea")} · ${l.name}`;

export default definePlugin({
  name: "market",
  aliases: ["pasar", "mp"],
  category: "rpg",
  ownHelp: true,
  description: "Player market: sell items to other players, buy what they list",
  usage: "market [item] · sell <item> <qty> <price> · buy <no> [qty] · mine · cancel <no>",
  async run(env) {
    const { ctx, user } = env, p = ctx.pfx, me = ctx.senderId, r = game.getRpg(user);
    const name = user.reg?.name ?? ctx.pushName ?? numberOf(me);
    const sub = (ctx.args[0] ?? "").toLowerCase();

    if (sub === "help") return ctx.reply(tr(
      `🏪 *PASAR PEMAIN*\n› *${p}market* — lihat listing (termurah dulu) · *${p}market <item>* — filter\n› *${p}market sell <id item> <jumlah> <harga/buah>* — jual (pajak ${M.CFG.tax * 100}%)\n› *${p}market buy <no> [jumlah]* — beli\n› *${p}market mine* — listing-mu · *${p}market cancel <no>* — tarik kembali\n_Barang kedaluwarsa ${M.CFG.ttl / 86_400_000} hari dikembalikan ke penjual._`,
      `🏪 *PLAYER MARKET*\n› *${p}market* — browse listings (cheapest first) · *${p}market <item>* — filter\n› *${p}market sell <item id> <qty> <price each>* — sell (${M.CFG.tax * 100}% tax)\n› *${p}market buy <no> [qty]* — buy\n› *${p}market mine* — your listings · *${p}market cancel <no>* — take it back\n_Listings expire after ${M.CFG.ttl / 86_400_000} days and return to the seller._`,
    ));

    if (sub === "sell" || sub === "jual") {
      const id = game.findItem(ctx.args[1] ?? "");
      if (!id) return ctx.reply(tr(`❓ Pakai: *${p}market sell <id item> <jumlah> <harga/buah>* — contoh: *${p}market sell potionhp 5 150*`, `❓ Use: *${p}market sell <item id> <qty> <price each>* — e.g. *${p}market sell potionhp 5 150*`));
      const res = M.sell(me, name, r, id, Number(ctx.args[2]), Number(String(ctx.args[3] ?? "").replace(/[.,]/g, "")));
      if (res.error) return ctx.reply(ERR[res.error](res));
      return ctx.reply(tr(`🏪 Terpasang!\n${line(res.listing)}\n_Pembeli membayar, kamu terima ${100 - M.CFG.tax * 100}% (pajak ${M.CFG.tax * 100}%)._`, `🏪 Listed!\n${line(res.listing)}\n_When bought you receive ${100 - M.CFG.tax * 100}% (${M.CFG.tax * 100}% tax)._`));
    }

    if (sub === "buy" || sub === "beli") {
      const res = M.buy(me, r, Number(String(ctx.args[1] ?? "").replace("#", "")), Number(ctx.args[2]));
      if (res.error) return ctx.reply(ERR[res.error](res));
      return ctx.reply(tr(`🛒 Dibeli: ${game.ITEMS[res.listing.item].name} ×${res.n} — ${fmt(res.cost)} Gold\n_Penjual @${numberOf(res.seller)} menerima ${fmt(res.net)} Gold._`, `🛒 Bought: ${game.ITEMS[res.listing.item].name} ×${res.n} — ${fmt(res.cost)} Gold\n_Seller @${numberOf(res.seller)} received ${fmt(res.net)} Gold._`), { mentions: [res.seller] });
    }

    if (sub === "cancel" || sub === "batal" || sub === "tarik") {
      const res = M.cancel(me, Number(String(ctx.args[1] ?? "").replace("#", "")));
      return ctx.reply(res.error ? ERR[res.error]() : tr(`↩️ Listing #${res.listing.id} dibatalkan — item kembali ke tas.`, `↩️ Listing #${res.listing.id} cancelled — item returned to your bag.`));
    }

    if (sub === "mine" || sub === "saya") {
      const mine = M.listings({ seller: me });
      return ctx.reply(mine.length ? [`🏪 ${tr("Listing-mu", "Your listings")}:`, ...mine.map(line)].join("\n") : tr("🏪 Kamu belum menjual apa pun.", "🏪 You aren't selling anything."));
    }

    // browse: .market [item] [hal]
    const asPage = /^\d+$/.test(sub);
    const item = !sub || asPage ? null : game.findItem(sub);
    if (sub && !asPage && !item) return ctx.reply(tr(`❓ Item "${sub}" tidak dikenal. *${p}market help* untuk bantuan.`, `❓ Unknown item "${sub}". *${p}market help* for help.`));
    const all = M.listings({ item });
    const page = Math.max(1, Number(asPage ? sub : ctx.args[1]) || 1), pages = Math.max(1, Math.ceil(all.length / M.CFG.perPage));
    if (!all.length) return ctx.reply(tr(`🏪 Pasar kosong${item ? ` untuk ${game.ITEMS[item].name}` : ""}. Jual barangmu: *${p}market sell <item> <jumlah> <harga>*`, `🏪 The market is empty${item ? ` for ${game.ITEMS[item].name}` : ""}. List yours: *${p}market sell <item> <qty> <price>*`));
    return ctx.reply([`🏪 *${tr("PASAR", "MARKET")}* ${page}/${pages} (${all.length})`, ...all.slice((page - 1) * M.CFG.perPage, page * M.CFG.perPage).map(line), "", tr(`Beli: *${p}market buy <no> [jumlah]*`, `Buy: *${p}market buy <no> [qty]*`)].join("\n"));
  },
});
