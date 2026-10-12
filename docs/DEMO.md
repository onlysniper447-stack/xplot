# Demo script (about 3 minutes)

1. Open `/`. The market strip shows the NYSE cash session with an icon and words. The coverage strip counts every listed Stock Token.
2. Paste a random `0x` address into search. The page says it is not verified.
3. Search `NVDA`. Open the one canonical card at `/e/NVDA`.
4. Read the verdict. If the session is closed, the oracle cell says `last close`. If the session is pre-market, overnight, or regular hours, it does not pretend the print is a last close.
5. Show the instrument row: issuer note, economic exposure only, explorer link.
6. Open `/coverage`. Every chain-4663 asset from `/rhj/assets` has a tier.
7. From the equity page, copy the `curl` for `/v1/equities/NVDA/health`.
8. The weekend scorecard stays on "Not enough data yet" until a real reopening has been recorded.

Close: XPLOT is the verification and risk layer for Robinhood Chain stock tokens. It does not ask for a wallet.
