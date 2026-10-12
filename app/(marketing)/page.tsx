import Link from "next/link";
import { DataField } from "@/components/marketing/data-field";

const features = [
  {
    title: "Verify",
    body: "Cryptographically verify source data and provenance",
  },
  {
    title: "Timestamp",
    body: "Trusted timestamps anchor data at the moment it enters the network",
  },
  {
    title: "Attest",
    body: "Independent attestations confirm data integrity",
  },
];

const problems = [
  "Prints arrive from venues that do not share one clock.",
  "Provenance is easy to lose after the fact.",
  "A closed session can be mistaken for a live price.",
];

const solutions = [
  "One canonical profile for each tokenized stock.",
  "Source, time, and coverage stay with the print.",
  "The desk is read-only. It does not submit an order.",
];

export default function HomePage() {
  return (
    <div>
      <DataField />
      <section className="px-5 pb-20 pt-14 md:px-12 md:pb-28 md:pt-24">
        <h1 className="max-w-4xl text-4xl leading-[1.08] tracking-tight text-[#111111] sm:text-6xl md:text-7xl" style={{ fontFamily: "var(--font-m-serif), Georgia, serif" }}>
          The <span className="bg-[#202320] px-1.5 text-[#FF8000] box-decoration-clone">intelligence</span> data layer for tokenized stocks.
        </h1>
        <div className="xplot-draw mt-8 h-px w-40 bg-[#FF8000] md:w-64" />
        <p className="mt-8 max-w-xl text-base leading-7 text-[#5C564E] md:text-lg">
          XPLOT is the verifiable data and trust layer for tokenized stocks. We verify, timestamp, and attest to market data so institutions can trade with confidence.
        </p>
        <Link
          href="/markets"
          className="mt-10 inline-flex h-12 items-center bg-[#FF8000] px-5 text-sm font-semibold text-[#111111] no-underline hover:bg-[#E67300]"
        >
          Explore markets →
        </Link>
      </section>

      <section aria-label="Capabilities" className="grid gap-4 px-5 md:grid-cols-3 md:px-12">
        {features.map((feature) => (
          <article key={feature.title} className="bg-[#202320] p-8 text-[#E6E1D6]">
            <h2 className="text-lg font-medium text-[#FF8000]">{feature.title}</h2>
            <p className="mt-4 text-sm leading-6 text-[#B7B2A8]">{feature.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-16 px-5 py-24 md:grid-cols-2 md:gap-20 md:px-12 md:py-32">
        <div>
          <h2 className="text-xs font-medium tracking-[0.16em] text-[#C2410C]">Problems</h2>
          <p className="mt-4 max-w-md text-3xl leading-tight tracking-tight text-[#111111]">
            Fragmented data. Weak trust. Limited transparency.
          </p>
          <ul className="mt-8 space-y-4 text-sm leading-6 text-[#5C564E]">
            {problems.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-px w-4 shrink-0 bg-[#FF8000]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-medium tracking-[0.16em] text-[#C2410C]">Solutions</h2>
          <p className="mt-4 max-w-md text-3xl leading-tight tracking-tight text-[#111111]">
            One layer. Verifiable data. Institutional trust.
          </p>
          <ul className="mt-8 space-y-4 text-sm leading-6 text-[#5C564E]">
            {solutions.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-px w-4 shrink-0 bg-[#FF8000]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
