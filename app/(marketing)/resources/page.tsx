import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Resources" };

const links = [
  { href: "/api", label: "API reference" },
  { href: "/v1/openapi.json", label: "OpenAPI document" },
  { href: "/coverage", label: "Coverage report" },
  { href: "/verify", label: "Address check" },
];

export default function ResourcesPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16 md:px-12 md:py-24">
      <h1 className="text-3xl tracking-tight">Resources</h1>
      <p className="mt-6 max-w-xl text-base leading-7 text-[#5C564E]">
        Read-only interfaces. Handlers return stored records. They do not quote a swap and they do not sign a transaction.
      </p>
      <ul className="mt-10 space-y-4 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-[#111111] underline decoration-[#FF8000] underline-offset-4">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
