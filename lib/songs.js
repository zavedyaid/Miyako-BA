import { Cache } from "#lib/utils";

/*
 * Hasil pencarian .play: url → { title, author, duration, thumbnail }.
 * Dipakai .ytplay supaya tahu penyanyi/judul tanpa memanjangkan id baris list.
 */
export const songs = new Cache({ max: 500, ttl: 6 * 60 * 60 * 1000 });
