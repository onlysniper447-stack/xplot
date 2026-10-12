import { fail, ok } from "@/lib/xplot/http";
import { envelope, verifyAddress } from "@/lib/xplot/read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim() ?? "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return fail("BAD_ADDRESS", "Pass a 20-byte hex address in the address query parameter.");
  }
  const result = await verifyAddress(address);
  if (!result.verified) {
    return ok(await envelope({ verified: false, address, message: "Not verified. This may be a lookalike token." }));
  }
  return ok(
    await envelope({
      verified: true,
      address,
      message: `Verified: ${result.equity.id} (Robinhood Stock Token)`,
      equity: result.equity,
    }),
  );
}
