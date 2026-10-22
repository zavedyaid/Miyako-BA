import { db } from "#lib/database";
import * as game from "#lib/rpg";

/*
 * 🏪 PASAR PEMAIN — jual-beli item antar pemain. Barang yang dijual disimpan (escrow) sampai terjual / dibatalkan / kedaluwarsa (3 hari,
 * dikembalikan ke penjual). Pajak 5% dipotong dari hasil penjualan. Data: db.settings.market.
 */
export const CFG = { tax: 0.05, maxPerSeller: 8, maxPrice: 10_000_000, ttl: 3 * 86_400_000, perPage: 8 };
const now = () => Date.now();
const store = () => (db.settings.market ??= { seq: 0, items: [] });
const NOT_TRADABLE = new Set(["atm"]);

export const tradable = (id) => Boolean(game.ITEMS[id]) && !NOT_TRADABLE.has(id) && !game.ITEMS[id].unique;

// Item kedaluwarsa dikembalikan ke penjual
export const sweep = () => {
  const m = store();
  const keep = [];
  for (const l of m.items) {
    if (l.at + CFG.ttl > now()) { keep.push(l); continue; }
    const u = db.users[l.seller];
    if (u) game.addItem(game.getRpg(u), l.item, l.qty);
  }
  if (keep.length !== m.items.length) { m.items = keep; db.save("settings"); db.save("users"); }
};

export const listings = ({ item = null, seller = null } = {}) => {
  sweep();
  return store().items.filter((l) => (!item || l.item === item) && (!seller || l.seller === seller)).sort((a, b) => a.price - b.price || a.at - b.at);
};

export const sell = (jid, name, r, item, qty, price) => {
  sweep();
  if (!tradable(item)) return { error: "untradable" };
  if (!Number.isInteger(qty) || qty < 1) return { error: "qty" };
  if (!Number.isInteger(price) || price < 1 || price > CFG.maxPrice) return { error: "price" };
  if (game.count(r, item) < qty) return { error: "have" };
  if (game.ITEMS[item].type === "weapon" || game.ITEMS[item].type === "armor") {
    if (r.equip.weapon === item && game.count(r, item) - qty < 1) return { error: "equipped" };
    if (r.equip.armor === item && game.count(r, item) - qty < 1) return { error: "equipped" };
  }
  if (store().items.filter((l) => l.seller === jid).length >= CFG.maxPerSeller) return { error: "limit", max: CFG.maxPerSeller };
  game.takeItem(r, item, qty);
  const m = store(), listing = { id: ++m.seq, seller: jid, name, item, qty, price, at: now() };
  m.items.push(listing);
  db.save("settings"); db.save("users");
  return { listing };
};

export const buy = (jid, r, id, qty) => {
  sweep();
  const m = store(), l = m.items.find((x) => x.id === id);
  if (!l) return { error: "gone" };
  if (l.seller === jid) return { error: "own" };
  const n = Math.min(Math.max(1, Math.floor(qty) || l.qty), l.qty), cost = n * l.price;
  if (r.gold < cost) return { error: "gold", cost };
  r.gold -= cost;
  game.addItem(r, l.item, n);
  l.qty -= n;
  if (l.qty <= 0) m.items = m.items.filter((x) => x !== l);
  const tax = Math.round(cost * CFG.tax), net = cost - tax;
  const su = db.users[l.seller];
  if (su) game.getRpg(su).gold += net;
  db.save("settings"); db.save("users");
  return { ok: true, n, cost, tax, net, listing: l, seller: l.seller };
};

export const cancel = (jid, id) => {
  const m = store(), l = m.items.find((x) => x.id === id);
  if (!l) return { error: "gone" };
  if (l.seller !== jid) return { error: "notYours" };
  m.items = m.items.filter((x) => x !== l);
  game.addItem(game.getRpg(db.users[jid]), l.item, l.qty);
  db.save("settings"); db.save("users");
  return { ok: true, listing: l };
};
