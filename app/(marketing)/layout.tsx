import { Inter, Newsreader } from "next/font/google";
import { MarketingFooter, MarketingNav } from "@/components/marketing/nav";

const sans = Inter({ subsets: ["latin"], variable: "--font-m-sans" });
const serif = Newsreader({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-m-serif" });

export const metadata = {
  description:
    "XPLOT is the verifiable data and trust layer for tokenized stocks. Read-only. No wallet.",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${sans.variable} ${serif.variable} relative min-h-dvh bg-[#F4F1E9] text-[#111111]`}
      style={{ fontFamily: "var(--font-m-sans), Inter, ui-sans-serif, sans-serif" }}
    >
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:bg-[#FF8000] focus:px-3 focus:py-2 focus:text-[#111111]"
      >
        Skip to content
      </a>
      <MarketingNav />
      <div id="content" className="relative z-10">
        {children}
      </div>
      <MarketingFooter />
    </div>
  );
}
