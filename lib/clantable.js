import fs from "node:fs";
import path from "node:path";
import { config } from "#lib/config";
import { db } from "#lib/database";

/*
 * Akses tabel klan yang TAHAN database lama: bila lib/database.js di server belum memuat tabel "clans" (mis. file belum ikut diperbarui),
 * tabel dibuat / dimuat dari database/clans.json saat pertama dipakai — sehingga `db.clans` tidak pernah undefined.
 */
export const clansTable = () => {
  if (!db.clans) {
    const file = path.join(config.paths.database, "clans.json");
    try { db.clans = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {}; } catch { db.clans = {}; }
  }
  return db.clans;
};
