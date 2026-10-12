import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16 md:px-12 md:py-24">
      <h1 className="text-3xl tracking-tight">Log in</h1>
      <p className="mt-6 max-w-xl text-base leading-7 text-[#5C564E]">
        No account is required. XPLOT does not ask for credentials, connect a wallet, or hold a trading key.
      </p>
      <p className="mt-10">
        <Link href="/markets" className="inline-flex h-12 items-center bg-[#FF8000] px-5 text-sm font-semibold text-[#111111] no-underline hover:bg-[#E67300]">
          Explore markets →
        </Link>
      </p>
    </article>
  );
}
