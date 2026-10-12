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
import { messageCache, numberOf, truncate } from "#lib/utils";
import { handleMessages } from "./handler.js";

const REVOKE = proto?.WebMessageInfo?.StubType?.REVOKE ?? 1;

const guard = (name, handler) => async (...args) => {
  try {
    await handler(...args);
  } catch (err) {
    logger.error(`${name}: ${err.message}`);
  }
};

const onParticipants = (sock) => async ({ id, action, participants }) => {
  groups.forget(id);
  const chat = db.groups[id];
  if (!chat?.welcome) return;

  const meta = await groups.get(sock, id);

  for (const entry of participants) {
    const jid = typeof entry === "string" ? entry : (entry.phoneNumber ?? entry.id);
    const fill = (template) =>
      template
        .replaceAll("@user", `@${numberOf(jid)}`)
        .replaceAll("@subject", meta?.subject ?? "")
        .replaceAll("@count", String(meta?.participants?.length ?? 0));

    const text = {
      add: fill(chat.sWelcome || "Selamat datang @user! 👋"),
      remove: fill(chat.sBye || "Sampai jumpa @user! 👋"),
      promote: fill("⚡ @user sekarang *Admin*!"),
      demote: fill("📉 @user bukan *Admin* lagi."),
    }[action];

    if (text) sock.sendMessage(id, { text, mentions: [jid] }).catch(() => {});
  }
};

const onGroupsUpdate = (sock) => (updates) => {
  for (const update of updates) {
    if (!update.id) continue;
    groups.patch(update.id, update);
    if (!db.groups[update.id]) continue;

    if (update.announce === true) {
      sock.sendMessage(update.id, { text: "🔒 Grup *ditutup* — hanya admin yang bisa mengirim pesan." }).catch(() => {});
    } else if (update.announce === false) {
      sock.sendMessage(update.id, { text: "🔓 Grup *dibuka* — semua anggota bisa mengirim pesan." }).catch(() => {});
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

    const text = `🗑️ @${numberOf(author)} menghapus pesan${snippet ? `:\n\n${truncate(snippet, 1000)}` : "."}`;
    sock.sendMessage(key.remoteJid, { text, mentions: [author] }).catch(() => {});
  }
};

const onCall = (sock) => (calls) => {
  if (!config.features?.antiCall) return;

  for (const call of calls) {
    if (call.status !== "offer") continue;
    sock.rejectCall(call.id, call.from).catch(() => {});
    sock.sendMessage(call.from, { text: "📵 Panggilan tidak diterima. Silakan kirim pesan teks." }).catch(() => {});
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
