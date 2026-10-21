import { Worker } from "node:worker_threads";
import { enginePath } from "#lib/gameengine";

const TIMEOUT = 60_000;

// → { ok, over, win, loss, draw, res, plies, moves } | { ok:false, error }
export const verifyChess = (cfg, codes) =>
  new Promise((resolve) => {
    let done = false;
    const worker = new Worker(new URL("./chessworker.js", import.meta.url), { workerData: { file: enginePath("chess-ai"), cfg, codes } });
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      resolve(value);
    };
    const timer = setTimeout(() => finish({ ok: false, error: "timeout" }), TIMEOUT);
    timer.unref?.();
    worker.once("message", finish);
    worker.once("error", (err) => finish({ ok: false, error: err.message }));
    worker.once("exit", () => finish({ ok: false, error: "worker exit" }));
  });
