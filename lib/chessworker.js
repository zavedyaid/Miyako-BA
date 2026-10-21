import { readFileSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";

// Memutar ulang permainan catur-vs-AI di thread terpisah supaya bot tidak tersendat.
try {
  const E = (0, eval)(readFileSync(workerData.file, "utf8"));
  parentPort.postMessage(E.replay(workerData.cfg, workerData.codes));
} catch (err) {
  parentPort.postMessage({ ok: false, error: String(err?.message ?? err) });
}
