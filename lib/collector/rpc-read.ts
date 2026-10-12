/** Result of one RPC read. A failure is never a price. */
export type RpcRead<T> = { ok: true; value: T } | { ok: false; reason: string };

export function rpcReadFailure(error: unknown): { ok: false; reason: string } {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "read failed");
  const timedOut = name === "AbortError" || name === "TimeoutError" || /timeout|aborted/i.test(message);
  const reason = timedOut ? "RPC timeout" : message.replace(/\s+/g, " ").trim().slice(0, 180) || "read failed";
  return { ok: false, reason };
}

export function readValue<T>(result: RpcRead<T>): T | null {
  return result.ok ? result.value : null;
}
