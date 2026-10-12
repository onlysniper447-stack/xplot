import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16 md:px-12 md:py-24">
      <h1 className="text-3xl tracking-tight">About</h1>
      <p className="mt-6 max-w-xl text-base leading-7 text-[#5C564E]">
        XPLOT is a read-only data layer for stock tokens on Robinhood Chain. It keeps one profile per token and shows when a price is a live print, a last close, or missing.
      </p>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#5C564E]">
        A stock token is an issuer debt security. It gives economic exposure. It does not confer ownership or shareholder rights.
      </p>
      <p className="mt-10">
        <Link href="/markets" className="inline-flex h-12 items-center bg-[#FF8000] px-5 text-sm font-semibold text-[#111111] no-underline hover:bg-[#E67300]">
          Explore markets →
        </Link>
      </p>
    </article>
  );
}
