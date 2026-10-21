import { config } from "#lib/config";

/*
 * Jejak pesan ATM per akun (kunci = Nomor Serial): kartu ATM, pesan "cek chat pribadi", permintaan PIN, dsb.
 * Saat kartu ATM baru dikirim (.atm / .deposit / .tarik / .transfer), semua pesan ATM sebelumnya + pesan perintah
 * pemain dihapus supaya chat tidak penuh. Matikan: features.atmCleanChat = false
 */
const trail = (globalThis.__miyakoAtmTrail ??= new Map());
const snOf = (env) => env.user?.reg?.sn ?? null;
export const atmClean = () => config.features?.atmCleanChat !== false;

export const trackAtm = (env, sent) => {
  const sn = snOf(env), key = sent?.key;
  if (!sn || !key?.id) return sent;
  const list = trail.get(sn) ?? [];
  list.push({ remoteJid: key.remoteJid, id: key.id, fromMe: true, participant: key.participant });
  trail.set(sn, list.slice(-12));
  return sent;
};

export const takeTrail = (env) => {
  const sn = snOf(env), list = sn ? (trail.get(sn) ?? []) : [];
  if (sn) trail.set(sn, []);
  return list;
};

export const wipeKeys = (sock, keys) => {
  for (const key of keys) sock.sendMessage(key.remoteJid, { delete: key }).catch(() => {});
};
