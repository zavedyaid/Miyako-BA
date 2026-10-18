import { definePlugin } from "#lib/plugins";
import * as game from "#lib/rpg";
import { sendResult } from "#lib/rpgui";
import { duration } from "#lib/utils";

/*
 * Mode driver: .ojol / .gocar / .gofood — ambil pesanan, dapat gold + XP, kadang tip, berlian, dan item.
 * Rating bintang 1–5 menentukan bayaran; 5x bintang 5 berturut-turut = bonus; tiap 10 pesanan dapat peti, tiap 50 peti emas.
 */
const driver = (kind, meta) =>
  definePlugin({
    category: "rpg",
    access: { group: true },
    async run(env) {
      const { ctx, user, db } = env;
      const spec = game.TRIPS[kind], r = game.getRpg(user);
      if (r.lvl < spec.minLv) return ctx.reply(`🔒 ${spec.name} butuh level *${spec.minLv}* (levelmu ${r.lvl}).`);
      const left = game.cooldownLeft(r, kind, game.CD[kind]);
      if (left) return ctx.reply(`⏳ Pesanan ${spec.name} berikutnya masuk dalam *${duration(left)}*.`);
      const stop = game.preflight(r, spec.cost, false);
      if (stop) return ctx.reply(stop);
      const res = game.trip(r, kind);
      db.save("users");
      await sendResult(env, r, res);
    },
    ...meta,
  });

export default [
  driver("ojol", { name: "ojol", aliases: ["gojek", "ojek"], description: "Jadi driver ojol: antar penumpang (8 stamina, jeda 2 menit)", usage: "ojol" }),
  driver("gocar", { name: "gocar", aliases: ["taksi", "mobil"], description: "Jadi driver GoCar, bayaran lebih besar (14 stamina, Lv 3+, jeda 4 menit)", usage: "gocar" }),
  driver("gofood", { name: "gofood", aliases: ["antarmakanan", "kurir"], description: "Antar pesanan makanan (10 stamina, Lv 2+, jeda 3 menit)", usage: "gofood" }),
];
