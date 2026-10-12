import Link from "next/link";

const links = [
  { href: "/platform", label: "Platform" },
  { href: "/markets", label: "Markets" },
  { href: "/resources", label: "Resources" },
  { href: "/about", label: "About" },
];

export function MarketingNav() {
  return (
    <header className="relative z-10 flex flex-col gap-5 px-5 py-6 md:flex-row md:items-center md:justify-between md:px-12">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm font-semibold tracking-[0.18em] text-[#111111] no-underline">
          XPLOT
        </Link>
        <div className="md:hidden">
          <ExploreMarkets />
        </div>
      </div>
      <nav aria-label="Primary" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#111111]">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="no-underline hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="hidden md:block">
        <ExploreMarkets />
      </div>
    </header>
  );
}

function ExploreMarkets() {
  return (
    <Link
      href="/markets"
      className="inline-flex h-11 items-center bg-[#FF8000] px-4 text-sm font-semibold text-[#111111] no-underline hover:bg-[#E67300]"
    >
      Explore markets
    </Link>
  );
}

export function MarketingFooter() {
  return (
    <footer className="relative z-10 px-5 py-12 text-sm leading-6 text-[#5C564E] md:px-12">
      <p>Read-only. No wallet. A stock token is an issuer note with economic exposure only.</p>
    </footer>
  );
}
