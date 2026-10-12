import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Platform" };

export default function PlatformPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16 md:px-12 md:py-24">
      <h1 className="text-3xl tracking-tight">Platform</h1>
      <p className="mt-6 max-w-xl text-base leading-7 text-[#5C564E]">
        XPLOT reads public market data and keeps the source, the time, and the coverage state on the same record. It does not connect a wallet and it does not submit an order.
      </p>
      <ul className="mt-10 space-y-6 text-sm leading-6 text-[#5C564E]">
        <li>
          <span className="block text-base text-[#111111]">Verify</span>
          Check an address against the Robinhood asset registry.
        </li>
        <li>
          <span className="block text-base text-[#111111]">Timestamp</span>
          Each stored print carries the time it was read.
        </li>
        <li>
          <span className="block text-base text-[#111111]">Attest</span>
          Coverage status records whether a feed and a spot pool were readable.
        </li>
      </ul>
      <p className="mt-10 flex flex-wrap gap-6 text-sm">
        <Link href="/verify" className="text-[#111111] underline decoration-[#FF8000] underline-offset-4">
          Verify an address
        </Link>
        <Link href="/coverage" className="text-[#111111] underline decoration-[#FF8000] underline-offset-4">
          Coverage
        </Link>
        <Link href="/markets" className="text-[#111111] underline decoration-[#FF8000] underline-offset-4">
          Markets
        </Link>
      </p>
    </article>
  );
}
