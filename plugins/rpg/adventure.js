import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { sendResult } from "#lib/rpgui";

// Pembuat perintah aksi: cek stamina/HP → jalankan → kartu hasil.
const action = (spec) =>
  definePlugin({
    category: "rpg",
    access: { group: true },
    async run(env) {
      const { ctx, user, db } = env;
      const r = game.getRpg(user);
      if (r.lvl < (spec.minLevel ?? 1)) return ctx.reply(`🔒 ${spec.name} butuh level *${spec.minLevel}* (levelmu ${r.lvl}).`);
      const stop = game.preflight(r, spec.cost, spec.hp);
      if (stop) return ctx.reply(stop);
      const res = spec.play(r);
      db.save("users");
      await sendResult(env, r, res);
    },
    ...spec.meta,
  });

export default [
  action({ name: "Berburu", cost: 10, hp: true, play: game.hunt, meta: { name: "berburu", aliases: ["hunt", "buru"], description: "Berburu monster (10 stamina)", usage: "berburu" } }),
  action({ name: "Dungeon", cost: 30, hp: true, minLevel: 5, play: game.dungeon, meta: { name: "dungeon", aliases: ["dg", "ekspedisi"], description: "Dungeon 3 musuh + boss (30 stamina, Lv 5+)", usage: "dungeon" } }),
  action({ name: "Menambang", cost: 8, hp: false, play: game.mine, meta: { name: "nambang", aliases: ["mine", "tambang"], description: "Menambang bijih (8 stamina)", usage: "nambang" } }),
  action({ name: "Memancing", cost: 6, hp: false, play: game.fish, meta: { name: "mancing", aliases: ["fish", "pancing"], description: "Memancing ikan (6 stamina)", usage: "mancing" } }),
];
