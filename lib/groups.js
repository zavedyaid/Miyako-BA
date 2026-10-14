import { Cache, bare } from "#lib/utils";

const identitiesOf = (participant) => [participant.id, participant.lid, participant.phoneNumber].filter(Boolean).map(bare);

export const isAdminIn = (meta, ...jids) => {
  const admins = new Set(meta?.participants?.filter((p) => p.admin).flatMap(identitiesOf));
  return jids.filter(Boolean).some((jid) => admins.has(bare(jid)));
};

export const botIdentities = (sock) => [sock.user?.id, sock.user?.lid].filter(Boolean).map(bare);

class GroupDirectory {
  #cache = new Cache({ max: 500, ttl: 5 * 60_000 });

  peek(jid) {
    return this.#cache.get(jid);
  }

  async get(sock, jid) {
    return this.peek(jid) ?? this.refresh(sock, jid);
  }

  async refresh(sock, jid) {
    try {
      return this.#cache.set(jid, await sock.groupMetadata(jid));
    } catch {
      return null;
    }
  }

  set(jid, meta) {
    this.#cache.set(jid, meta);
  }

  patch(jid, update) {
    const cached = this.peek(jid);
    if (cached) this.#cache.set(jid, { ...cached, ...update });
  }

  forget(jid) {
    this.#cache.delete(jid);
  }

  // Tandai grup "baru diubah oleh bot" agar event groups.update tidak mengumumkan ulang (pesan dobel).
  #silenced = new Map();

  silence(jid, ms = 15_000) {
    this.#silenced.set(jid, Date.now() + ms);
  }

  isSilenced(jid) {
    const until = this.#silenced.get(jid);
    if (!until) return false;
    if (until < Date.now()) {
      this.#silenced.delete(jid);
      return false;
    }
    return true;
  }
}

export const groups = new GroupDirectory();

export const inspectGroup = async ({ sock, ctx }) => {
  const meta = await groups.get(sock, ctx.chatId);
  return {
    meta,
    isAdmin: isAdminIn(meta, ctx.senderPn, ctx.senderLid, ctx.senderId),
    isBotAdmin: isAdminIn(meta, ...botIdentities(sock)),
  };
};
