/*
 * Miyako - BA — event non-pesan
 * Author  : ZavedyaID
 * GitHub  : https://github.com/ZavedyaID/Miyako-BA
 * License : MIT
 *
 * Sambutan grup, buka/tutup grup, anti-delete, dan tolak panggilan.
 */

import { extractMessageContent, proto } from "#lib/baileys";
import { config } from "#lib/config";
import { db } from "#lib/database";
import { groups } from "#lib/groups";
import { logger } from "#lib/logger";
import { cardPayload, fetchAvatar, renderCard } from "#lib/cards";
import { bare, messageCache, numberOf, truncate } from "#lib/utils";
import { handleMessages } from "./handler.js";
import { t as tl } from "#lib/i18n";

const REVOKE = proto?.WebMessageInfo?.StubType?.REVOKE ?? 1;

const guard = (name, handler) => async (...args) => {
  try {
    await handler(...args);
  } catch (err) {
    logger.error(`${name}: ${err.message}`);
  }
};

/*
 * Notifikasi anggota grup (masing-masing punya saklar sendiri, atur lewat .on):
 *   welcome    → anggota masuk          goodbye → anggota keluar / dikeluarkan
 *   adminNotif → promote / demote
 * Teks kustom: .set group welcome|goodbye <teks>  (variabel @user @subject @count @desc @author)
 */
// Teks bawaan ada di config/lang (ev.add / ev.leave / ev.kicked / ev.promote / ev.demote); teks kustom grup tetap lewat .set group welcome|goodbye
const defaultText = (kind) => tl(`ev.${kind}`);

const displayName = (jid, rawId) => db.users[jid]?.name ?? db.users[rawId]?.name ?? numberOf(jid);

const renderMemberCard = async (sock, kind, { jid, rawId, meta }) => {
  try {
    const avatar = await fetchAvatar(sock, jid);
    return await renderCard(kind, { name: displayName(jid, rawId), fallbackName: numberOf(jid), group: meta?.subject ?? "Grup", count: meta?.participants?.length ?? 0, avatar });
  } catch (err) {
    logger.warn(`${kind} card failed to render: ${err.message}`);
    return null;
  }
};

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

const onParticipants = (sock) => async ({ id, author, authorPn, action, participants }) => {
  groups.forget(id);
  const chat = db.groups[id];
  if (!chat) return;

  const enabled = { add: chat.welcome, remove: chat.goodbye, promote: chat.adminNotif, demote: chat.adminNotif }[action];
  if (!enabled) return;

  const meta = await groups.get(sock, id);
  const by = authorPn ?? author;

  for (const entry of participants) {
    const jid = typeof entry === "string" ? entry : (entry.phoneNumber ?? entry.id);
    const rawId = typeof entry === "string" ? entry : entry.id;
    const selfLeft = action === "remove" && (!by || [rawId, jid].some((x) => x && by && bare(x) === bare(by)));

    const kind = action === "remove" ? (selfLeft ? "leave" : "kicked") : action;
    const custom = { add: chat.sWelcome, leave: chat.sBye, kicked: chat.sBye }[kind];
    const template = custom || defaultText(kind);

    const text = template
      .replaceAll("@user", `@${numberOf(jid)}`)
      .replaceAll("@subject", meta?.subject ?? "")
      .replaceAll("@count", String(meta?.participants?.length ?? 0))
      .replaceAll("@desc", meta?.desc ?? "")
      .replaceAll("@author", by ? `@${numberOf(by)}` : "admin");
    const mentions = [jid, by].filter(Boolean);

    // Welcome / goodbye: kartu gambar (link preview besar) berisi foto profil, nama, grup, dan jumlah anggota.
    // Gagal merender → foto profil + teks, lalu teks saja.
    let sent = false;
    if (action === "add" || action === "remove") {
      const card = await renderMemberCard(sock, action === "add" ? "welcome" : "goodbye", { jid, rawId, meta });
      if (card) {
        const style = db.settings.cardStyle ?? "preview";
        const info = { text, mentions, title: action === "add" ? "👋 Selamat datang!" : "👋 Sampai jumpa!", body: meta?.subject ?? config.name };
        // Gaya pilihan dulu; kalau WhatsApp menolak, coba gaya satunya sebelum menyerah.
        for (const attempt of style === "image" ? ["image", "preview"] : ["preview", "image"]) {
          sent = await sock.sendMessage(id, cardPayload(card, { ...info, style: attempt })).then(
            () => true,
            (err) => {
              logger.warn(`${action} card (${attempt}) failed to send: ${err.message}`);
              return false;
            },
          );
          if (sent) break;
        }
      }
      if (!sent) {
        const url = await withTimeout(sock.profilePictureUrl(jid, "image").catch(() => null), 5000);
        if (url) sent = await sock.sendMessage(id, { image: { url }, caption: text, mentions }).then(() => true, () => false);
      }
    }
    if (!sent) await sock.sendMessage(id, { text, mentions }).catch((err) => logger.warn(`notif ${action}: ${err.message}`));
  }
};

const onGroupsUpdate = (sock) => (updates) => {
  for (const update of updates) {
    if (!update.id) continue;
    groups.patch(update.id, update);
    if (!db.groups[update.id]) continue;

    // Perubahan yang dibuat bot sendiri (.open/.close/.set group chat) sudah dibalas oleh command-nya.
    if (update.announce !== undefined && groups.isSilenced(update.id)) continue;

    if (update.announce === true) {
      sock.sendMessage(update.id, { text: tl("evt.events.1") }).catch(() => {});
    } else if (update.announce === false) {
      sock.sendMessage(update.id, { text: tl("evt.events.2") }).catch(() => {});
    }
  }
};

const onMessagesUpdate = (sock) => (updates) => {
  for (const { key, update } of updates) {
    if (update?.messageStubType !== REVOKE) continue;
    if (!key?.remoteJid?.endsWith("@g.us") || key.fromMe || !db.groups[key.remoteJid]?.delete) continue;

    const original = messageCache.get(key.id);
    const content = original?.message && extractMessageContent(original.message);
    const author = original?.key?.participant ?? key.participant;
    if (!author) continue;

    const snippet =
      content?.conversation ||
      content?.extendedTextMessage?.text ||
      content?.imageMessage?.caption ||
      content?.videoMessage?.caption ||
      "";

    const text = tl("ev.delete", { n: numberOf(author), snippet: snippet ? `:\n\n${truncate(snippet, 1000)}` : "." });
    sock.sendMessage(key.remoteJid, { text, mentions: [author] }).catch(() => {});
  }
};

const onCall = (sock) => (calls) => {
  if (!config.features?.antiCall) return;

  for (const call of calls) {
    if (call.status !== "offer") continue;
    sock.rejectCall(call.id, call.from).catch(() => {});
    sock.sendMessage(call.from, { text: tl("evt.events.3") }).catch(() => {});
  }
};

export const attachEvents = (sock) => {
  const { ev } = sock;
  ev.on("messages.upsert", handleMessages(sock));
  ev.on("messages.update", guard("messages.update", onMessagesUpdate(sock)));
  ev.on("group-participants.update", guard("participants", onParticipants(sock)));
  ev.on("groups.upsert", guard("groups.upsert", (list) => list.forEach((meta) => groups.set(meta.id, meta))));
  ev.on("groups.update", guard("groups.update", onGroupsUpdate(sock)));
  ev.on("call", guard("call", onCall(sock)));
};
