import { runTick } from "../lib/collector/tick";

const once = process.argv.includes("--once");

async function loop() {
  for (;;) {
    try {
      await runTick();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
    if (once) return;
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}

loop();
