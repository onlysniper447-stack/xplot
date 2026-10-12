import fs from "node:fs";
import path from "node:path";

const banned = [
  /from ["']wagmi["']/,
  /from ["']@rainbow-me\/rainbowkit["']/,
  /@walletconnect/,
  /sendTransaction/,
  /writeContract/,
  /privateKeyToAccount/,
];

const roots = ["app", "components", "lib", "collector", "packages"];
const hits = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full);
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      for (const pattern of banned) {
        if (pattern.test(text)) hits.push(`${full}: ${pattern}`);
      }
    }
  }
}

for (const root of roots) walk(root);
if (hits.length) {
  console.error(hits.join("\n"));
  process.exit(1);
}
console.log("readonly check ok");
