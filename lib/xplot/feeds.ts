/** Pull a ticker out of a Chainlink Robinhood equity feed name. Crypto feeds return null. */
export function tickerFromEquityFeed(name: string, marketHours: string | undefined): string | null {
  if (!marketHours || !/equit/i.test(marketHours)) return null;
  const slash = name.match(/^Robinhood\s+([A-Z][A-Z0-9.]*)\s*\/\s*USD$/i);
  if (slash) return slash[1].toUpperCase();
  const dash = name.match(/^Robinhood\s+([A-Z][A-Z0-9.]*)-USD$/i);
  if (dash) return dash[1].toUpperCase();
  return null;
}

export function isEtfName(name: string): boolean {
  return /ETF|iShares|SPDR|Invesco|ProShares|VanEck|Direxion/i.test(name);
}
