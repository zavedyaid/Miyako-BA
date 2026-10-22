import * as casinoLib from "#lib/casino";
import * as clanLib from "#lib/clan";
import { logger } from "#lib/logger";
import * as raidLib from "#lib/raid";

/*
 * Penjadwal ringan untuk fitur multiplayer: tiap 20 dtk menyelesaikan war klan, raid, jackpot casino & permainan yang ditinggalkan lalu mengumumkan hasilnya
 * ke grup terkait. Socket diambil dari perintah terakhir (rememberSock). Pengaturan interval tahan hot-reload (globalThis).
 */
const S = (globalThis.__miyakoSched ??= { sock: null, timer: null, tick: null });

const send = async (jid, text, mentions = []) => {
  if (!S.sock || !jid) return;
  await S.sock.sendMessage(jid, { text, mentions }).catch((err) => logger.warn(`Sched: failed to send (${err.message})`));
};
export const announce = async (jids, text, mentions = []) => {
  for (const jid of new Set(jids.filter(Boolean))) await send(jid, text, mentions);
};

S.tick = async () => {
  try {
    for (const out of clanLib.settleDue()) await announce(Object.values(out.war.chats), clanLib.settleText(out), out.payouts.map((p) => p.jid));
    for (const out of raidLib.settleDue()) await announce([out.chat], out.text, out.mentions);
    for (const out of casinoLib.settlePots()) await announce([out.chat], out.text, out.mentions);
    for (const out of casinoLib.settleIdle()) await announce([out.chat], out.text, out.mentions);
  } catch (err) {
    logger.warn(`Sched: ${err.message}`);
  }
};

export const rememberSock = (sock) => {
  S.sock = sock;
  if (!S.timer) {
    S.timer = setInterval(() => S.tick?.(), 20_000);
    S.timer.unref?.();
  }
};
export const runNow = () => S.tick?.();
