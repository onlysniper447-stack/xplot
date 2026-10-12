import { runTick } from "./tick";

let started = false;
let running = false;

export function startEmbeddedCollector() {
  if (started) return;
  started = true;
  const kick = () => {
    if (running) return;
    running = true;
    void runTick()
      .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
      })
      .finally(() => {
        running = false;
      });
  };
  kick();
  setInterval(kick, 60_000);
}
