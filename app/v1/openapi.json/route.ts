import { ok } from "@/lib/xplot/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "XPLOT",
    version: "1.0.0",
    description:
      "Read-only equity profile, health, and coverage API for Robinhood Stock Tokens. Responses include as_of, ages, and disclaimer. Examples are shapes, not live prices.",
  },
  paths: {
    "/v1/equities": { get: { summary: "List equities" } },
    "/v1/equities/{id}": { get: { summary: "Canonical profile" } },
    "/v1/equities/{id}/health": { get: { summary: "Health" } },
    "/v1/equities/{id}/session": { get: { summary: "Session" } },
    "/v1/equities/{id}/deviation": { get: { summary: "Deviation series" } },
    "/v1/coverage": { get: { summary: "Coverage" } },
    "/v1/coverage/issues": { get: { summary: "Open coverage issues" } },
    "/v1/verify": { get: { summary: "Verify an address" } },
    "/v1/status": { get: { summary: "Collector status" } },
  },
};

export function GET() {
  return ok(spec);
}
