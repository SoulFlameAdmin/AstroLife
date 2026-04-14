const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "products-data.js");
const OFFERS_URL = "https://www.kaufland.bg/aktualni-predlozheniya/oferti.html";

function readProductsData(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").trim();
  const jsonText = raw
    .replace(/^\s*window\.KAUFLAND_PRODUCTS\s*=\s*/i, "")
    .replace(/;\s*$/i, "");
  const data = JSON.parse(jsonText);
  if (!Array.isArray(data)) {
    throw new Error("products-data.js does not contain an array");
  }
  return data;
}

function writeProductsData(filePath, products) {
  const out =
    "window.KAUFLAND_PRODUCTS = " +
    JSON.stringify(products, null, 2) +
    ";\n";
  fs.writeFileSync(filePath, out, "utf8");
}

function decodeHtmlEntities(str) {
  return String(str || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToSearchableText(html) {
  let s = String(html || "");
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeHtmlEntities(s);
  return normalizeForSearch(s);
}

function normalizeForSearch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[„“”"']/g, "")
    .replace(/[®™]/g, "")
    .replace(/×/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value) {
  return normalizeForSearch(value).replace(/\s+/g, " ").trim();
}

function stripWeights(str) {
  return str
    .replace(/\b\d+[.,]?\d*\s*(кг|г|мл|л|бр\.?|см)\b/gi, " ")
    .replace(/\b\d+\s*x\s*\d+[.,]?\d*\s*(г|мл|л)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNameVariants(name) {
  const base = normalizeName(name);
  const variants = new Set();

  variants.add(base);
  variants.add(base.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/\bразлични видове\b/g, "").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/\bот свежата витрина\b/g, "").replace(/\s+/g, " ").trim());
  variants.add(base.replace(/\bцена с kaufland card\b/g, "").replace(/\s+/g, " ").trim());
  variants.add(stripWeights(base));

  for (const v of [...variants]) {
    if (!v) continue;
    variants.add(v.replace(/\bклас:\s*i\b/g, "").replace(/\s+/g, " ").trim());
    variants.add(v.replace(/\bбез кост,\s*с кожа\b/g, "").replace(/\s+/g, " ").trim());
    variants.add(v.replace(/\bpet\b/g, "").replace(/\s+/g, " ").trim());
  }

  return [...variants].filter(Boolean).sort((a, b) => b.length - a.length);
}

function extractPricesNear(text, startIndex, lookahead = 340) {
  const chunk = text.slice(startIndex, startIndex + lookahead);
  const matches = [...chunk.matchAll(/(\d{1,4}(?:[.,]\d{2})?)\s*лв\.?/gi)]
    .map((m) => Number(String(m[1]).replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!matches.length) return { promo: null, regular: null };

  const promo = matches[0] ?? null;
  let regular = matches[1] ?? null;

  if (regular !== null && promo !== null && regular < promo) {
    regular = null;
  }

  return { promo, regular };
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function chooseDiscountLabel(promo, regular, existingLabel) {
  if (existingLabel) return existingLabel;
  if (promo && regular && regular > promo) {
    const pct = Math.round((1 - promo / regular) * 100);
    return `-${pct}%`;
  }
  return null;
}

async function fetchOffersText() {
  const res = await fetch(OFFERS_URL, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "bg-BG,bg;q=0.9,en;q=0.8"
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch official offers page: ${res.status}`);
  }

  const html = await res.text();
  return htmlToSearchableText(html);
}

function hasRealPrice(product) {
  return (
    product.promo_price_bgn !== null &&
    product.promo_price_bgn !== undefined &&
    Number(product.promo_price_bgn) > 0
  );
}

async function main() {
  const products = readProductsData(DATA_FILE);
  const offersText = await fetchOffersText();

  let updated = 0;
  let stillMissing = 0;

  const nextProducts = products.map((product) => {
    const variants = buildNameVariants(product.name || "");
    let foundAt = -1;

    for (const v of variants) {
      if (!v || v.length < 4) continue;
      foundAt = offersText.indexOf(v);
      if (foundAt !== -1) break;
    }

    if (foundAt === -1) {
      if (!hasRealPrice(product)) stillMissing += 1;
      return product;
    }

    const prices = extractPricesNear(offersText, foundAt);
    const promo = prices.promo;
    const regular = prices.regular;

    if (promo === null) {
      if (!hasRealPrice(product)) stillMissing += 1;
      return product;
    }

    updated += 1;

    return {
      ...product,
      promo_price_bgn: round2(promo),
      regular_price_bgn:
        regular !== null ? round2(regular) : (product.regular_price_bgn ?? null),
      discount_label: chooseDiscountLabel(
        round2(promo),
        regular !== null ? round2(regular) : null,
        product.discount_label || null
      )
    };
  });

  writeProductsData(DATA_FILE, nextProducts);

  console.log("DONE");
  console.log("Updated from official offers page:", updated);
  console.log("Still missing current price:", stillMissing);
  console.log("Saved file:", DATA_FILE);
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});