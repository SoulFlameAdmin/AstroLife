
from pathlib import Path
import json
import re
import openpyxl

ROOT = Path(__file__).resolve().parent
XLSX = ROOT / "data" / "kaufland_bg_public_offers_snapshot_203.xlsx"
OUT_JSON = ROOT / "data" / "products.json"
OUT_JS = ROOT / "data" / "products-data.js"
KAUFLAND_LOGO_URL = "https://www.kaufland.bg/etc.clientlibs/kaufland/clientlibs/clientlib-klsite/resources/frontend/img/kl-logo-footer-eb57fce80e.svg"

CATEGORY_MAP = {
    'Плодове и зеленчуци': 'Плодове и зеленчуци',
    'Месо, птиче месо, колбаси': 'Месо и колбаси',
    'Прясна риба': 'Риба',
    'Млечни продукти': 'Млечни продукти',
    'Алкохолни и безалкохолни напитки': 'Напитки',
    'Основни храни, пекарна и замразени продукти': 'Основни храни',
    'Дрогерия, храна за домашни любимци и битова химия': 'Дрогерия и дом',
    'Ел. уреди, дом, спорт, градина и работилница': 'Дом и техника',
    'Kaufland Card': 'Kaufland Card',
    'Допълнителни тематични оферти': 'Тематични оферти',
    'Общи актуални предложения': 'Актуални оферти'
}

def parse_bgn(v):
    if v is None:
        return None
    s = str(v).replace('ЛВ.', '').replace('ЛВ', '').replace(' ', '').replace('.', '').replace(',', '.')
    m = re.search(r'(\d+(?:\.\d+)?)', s)
    return float(m.group(1)) if m else None

def slugify(text):
    text = text.lower()
    repl = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l',
        'м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch',
        'ш':'sh','щ':'sht','ъ':'a','ь':'','ю':'yu','я':'ya'
    }
    out=[]
    for ch in text:
        if ch in repl:
            out.append(repl[ch])
        elif ch.isalnum():
            out.append(ch)
        else:
            out.append('-')
    s=''.join(out)
    s=re.sub('-+','-',s).strip('-')
    return s[:90]

def get_first_present(row, *candidates):
    row_lut = {str(k).strip().lower(): k for k in row.keys()}
    for candidate in candidates:
        key = row_lut.get(str(candidate).strip().lower())
        if key is None:
            continue
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None

def main():
    if not XLSX.exists():
        raise SystemExit(f"Missing input file: {XLSX}")

    wb = openpyxl.load_workbook(XLSX, data_only=True)
    ws = wb['Offers']
    rows = list(ws.iter_rows(values_only=True))
    headers = rows[0]
    data_rows = [dict(zip(headers, row)) for row in rows[1:] if len(row) > 1 and row[1]]

    products = []
    for i, row in enumerate(data_rows, start=1):
        name = str(row['Продукт']).strip()
        source = get_first_present(row, 'Източник', 'Source URL', 'URL', 'Source') or 'https://www.kaufland.bg/aktualni-predlozheniya/oferti.html'
        product_url = get_first_present(row, 'Product URL', 'Продукт URL', 'ProductURL', 'Продукт линк', 'Линк към продукт') or source
        image_url = get_first_present(row, 'Image URL', 'Снимка URL', 'Изображение URL', 'ImageURL', 'Снимка', 'Изображение')

        products.append({
            "id": f"kaufland-offer-{i:04d}-{slugify(name)}",
            "name": name,
            "category": CATEGORY_MAP.get(row['Категория'], row['Категория']),
            "source_category": row['Категория'],
            "promo_price_bgn": parse_bgn(row['Промо цена']),
            "regular_price_bgn": parse_bgn(row['Редовна цена']),
            "discount_label": row['Отстъпка'],
            "validity": row['Валидност'],
            "source_url": source,
            "product_url": product_url,
            "image_url": image_url or KAUFLAND_LOGO_URL,
            "image_type": "real" if image_url else "kaufland_logo_fallback"
        })

    OUT_JSON.write_text(json.dumps(products, ensure_ascii=False, indent=2), encoding='utf-8')
    OUT_JS.write_text("window.KAUFLAND_PRODUCTS = " + json.dumps(products, ensure_ascii=False, indent=2) + ";\n", encoding='utf-8')
    print(f"Synced {len(products)} products -> {OUT_JSON.name} and {OUT_JS.name}")

if __name__ == "__main__":
    main()
