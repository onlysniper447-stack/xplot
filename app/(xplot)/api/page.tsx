export const metadata = { title: "API" };

const rows = [
  ["GET /v1/equities", "List, with tier, prices, spread, and alert state"],
  ["GET /v1/equities/{id}", "Canonical profile and markets by lane"],
  ["GET /v1/equities/{id}/health", "Session, oracle state, spread, coverage"],
  ["GET /v1/equities/{id}/session", "Session and source"],
  ["GET /v1/equities/{id}/deviation?range=1d|7d|30d", "Stored prints only"],
  ["GET /v1/coverage", "Counts and per-token tier"],
  ["GET /v1/coverage/issues", "Open coverage issues"],
  ["GET /v1/verify?address=0x…", "Registry check"],
  ["GET /v1/status", "Collector and coverage counts"],
];

export default function ApiPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Developer API</h1>
      <p className="max-w-2xl text-sm" style={{ color: "var(--muted)" }}>
        Read-only JSON. Every response includes as_of, ages, and the disclaimer. The handlers read the local database. They do not call a chain or a venue.
      </p>
      <table className="xplot-table w-full text-left">
        <thead>
          <tr style={{ color: "var(--muted)" }}>
            <th scope="col" className="py-2">Endpoint</th>
            <th scope="col">Purpose</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([path, purpose]) => (
            <tr key={path} className="border-t" style={{ borderColor: "var(--border)" }}>
              <th scope="row" className="mono py-2 font-normal">{path}</th>
              <td>{purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm">
        <a className="underline" href="/v1/openapi.json">OpenAPI document</a>
      </p>
      <pre className="xplot-card mono overflow-x-auto rounded-xl p-3 text-xs">{`curl http://localhost:3000/v1/equities/NVDA/health`}</pre>
    </div>
  );
}
