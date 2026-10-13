import { isOwnerIdentity } from "#lib/config";
import { db } from "#lib/database";
import { bare, isLid, isPn, numberOf, toPn } from "#lib/utils";

/*
 * Pembantu command grup & owner: menentukan "siapa targetnya" dan mencocokkannya
 * dengan daftar anggota grup (yang bisa berisi PN maupun LID).
 */

export const identitiesOf = (participant) => [participant.id, participant.lid, participant.phoneNumber].filter(Boolean).map(bare);

// JID yang dipakai untuk mention (sama seperti events.js: nomor telepon bila ada).
export const mentionJid = (participant) => bare(participant.phoneNumber ?? participant.id);

export const findParticipant = (meta, jid) => {
  const target = bare(jid);
  return meta?.participants?.find((p) => identitiesOf(p).includes(target)) ?? null;
};

export const isOwnerParticipant = (participant) =>
  isOwnerIdentity({
    pn: [participant.phoneNumber, participant.id].find(isPn),
    lid: [participant.lid, participant.id].find(isLid),
  }) ||
  db.isExtraOwner({
    pn: [participant.phoneNumber, participant.id].find(isPn),
    lid: [participant.lid, participant.id].find(isLid),
  });

// 0812… → 62812…, buang karakter non-angka. Mengembalikan null bila bukan nomor.
export const normalizeNumber = (value) => {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
};

/*
 * Target dari mention, pesan yang di-reply, atau nomor di argumen (urutan itu).
 * Nomor di argumen hanya dipakai bila tidak ada mention / reply
 * (label @mention di teks bisa berupa LID dan bukan nomor telepon).
 */
export const targetsOf = (ctx, { fromArgs = true } = {}) => {
  const found = new Set();
  for (const jid of ctx.mentionedJid ?? []) found.add(bare(jid));
  if (ctx.quotedSender) found.add(bare(ctx.quotedSender));

  if (!found.size && fromArgs) {
    for (const arg of ctx.args) {
      if (/^@?\+?[\d\s-]{8,}$/.test(arg)) {
        const number = normalizeNumber(arg);
        if (number) found.add(toPn(number));
      }
    }
  }
  return [...found];
};

// "30", "perm" → hari (0 = permanen); null bila bukan durasi.
export const parseDays = (value) => {
  if (/^(perm|permanen|selamanya|forever)$/i.test(value ?? "")) return 0;
  return /^\d{1,4}$/.test(value ?? "") ? Number(value) : null;
};

export const tag = (jid) => `@${numberOf(jid)}`;

// Teks dari kode status groupParticipantsUpdate
export const PARTICIPANT_STATUS = {
  200: "berhasil",
  401: "nomor memblokir bot",
  403: "privasi — tidak bisa ditambahkan langsung",
  404: "nomor tidak terdaftar",
  406: "tidak diizinkan",
  408: "baru saja keluar dari grup",
  409: "sudah ada di grup",
  500: "gagal (server WhatsApp)",
};
