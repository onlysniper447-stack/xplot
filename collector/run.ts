import { redact } from "../lib/db/client";
import { runTick } from "../lib/collector/tick";

const once = process.argv.includes("--once");
const PERIOD_MS = 60_000;

async function loop() {
  for (;;) {
    const started = Date.now();
    try {
      await runTick();
    } catch (error) {
      console.error(redact(error));
    }
    if (once) return;
    const wait = Math.max(0, PERIOD_MS - (Date.now() - started));
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

loop();
