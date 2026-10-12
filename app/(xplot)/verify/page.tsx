import { verifyAddress } from "@/lib/xplot/read";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ address?: string }> }) {
  const { address = "" } = await searchParams;
  const trimmed = address.trim();
  const valid = /^0x[0-9a-fA-F]{40}$/.test(trimmed);
  const result = valid ? await verifyAddress(trimmed) : null;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Verify a token</h1>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Paste an address. XPLOT checks it against the Robinhood asset registry. This does not connect a wallet.
      </p>
      <form className="flex flex-col gap-3 sm:flex-row" action="/verify">
        <label className="sr-only" htmlFor="address">Address</label>
        <input
          id="address"
          name="address"
          defaultValue={trimmed}
          placeholder="0x…"
          className="xplot-card mono h-11 flex-1 rounded-full px-4 text-sm"
        />
        <button type="submit" className="h-11 rounded-full px-4 text-sm">
          Check
        </button>
      </form>
      {trimmed && !valid ? <p className="text-sm">That is not a 20-byte hex address.</p> : null}
      {result && !result.verified ? (
        <p className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--bad)", color: "var(--bad)" }} role="status">
          <span aria-hidden="true">■ </span>
          Not verified. This may be a lookalike token.
        </p>
      ) : null}
      {result?.verified ? (
        <p className="rounded-xl border p-4 text-sm" role="status" style={{ borderColor: "var(--ok)", color: "var(--ok)" }}>
          <span aria-hidden="true">● </span>
          Verified: {result.equity.id} (Robinhood Stock Token)
        </p>
      ) : null}
    </div>
  );
}
