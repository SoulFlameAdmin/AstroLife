# -*- coding: utf-8 -*-
import csv
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse, urlunparse

try:
    import requests
    from bs4 import BeautifulSoup
except Exception:
    print("Missing dependencies. Install with: py -3 -m pip install requests beautifulsoup4")
    raise

BASE_URL = "https://www.masterhaus.bg"
SITEMAP_URL = BASE_URL + "/bg/sitemap"
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
META_PATH = os.path.join(DATA_DIR, "meta.json")
PRODUCTS_JSON_PATH = os.path.join(DATA_DIR, "products.json")
PRODUCTS_CSV_PATH = os.path.join(DATA_DIR, "products.csv")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    "Accept-Language": "bg-BG,bg;q=0.9,en;q=0.8",
}

REQUEST_TIMEOUT = 30
MAX_WORKERS = 8
SAVE_EVERY = 100

session = requests.Session()
session.headers.update(HEADERS)

def now_iso():
    return datetime.now().astimezone().isoformat()

def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)

def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def save_meta(payload):
    current = load_json(META_PATH, {})
    current.update(payload)
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(current, f, ensure_ascii=False, indent=2)

def write_products(products):
    tmp_json = PRODUCTS_JSON_PATH + ".tmp"
    tmp_csv = PRODUCTS_CSV_PATH + ".tmp"

    with open(tmp_json, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)

    fieldnames = [
        "title", "price_bgn", "price_eur", "category", "item_number",
        "availability", "url", "image", "scraped_at"
    ]
    with open(tmp_csv, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in products:
            writer.writerow({k: row.get(k, "") for k in fieldnames})

    os.replace(tmp_json, PRODUCTS_JSON_PATH)
    os.replace(tmp_csv, PRODUCTS_CSV_PATH)

def fetch(url):
    r = session.get(url, timeout=REQUEST_TIMEOUT)
    r.raise_for_status()
    return r.text

def get_soup(url):
    html = fetch(url)
    return BeautifulSoup(html, "html.parser")

def normalize_url(url):
    if not url:
        return ""
    url = urljoin(BASE_URL, url)
    parsed = urlparse(url)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", parsed.query, ""))

def is_category_url(url):
    path = urlparse(url).path
    return "/bg/products/" in path and "/bg/product/" not in path

def is_product_url(url):
    path = urlparse(url).path
    return "/bg/product/" in path

def category_label_from_url(url):
    path = urlparse(url).path.strip("/")
    parts = path.split("/")
    if not parts:
        return ""
    return parts[-1].replace("-", " ").strip().title()

def collect_category_urls():
    candidates = set([
        BASE_URL + "/bg/promotions",
    ])

    for source_url in [SITEMAP_URL, BASE_URL + "/bg", BASE_URL]:
        try:
            soup = get_soup(source_url)
        except Exception:
            continue

        for a in soup.find_all("a", href=True):
            href = normalize_url(a["href"])
            if not href:
                continue
            if is_category_url(href):
                candidates.add(href)

    cleaned = []
    for url in sorted(candidates):
        if url not in cleaned:
            cleaned.append(url)
    return cleaned

def crawl_listing_pages(start_url, product_urls, visited_pages):
    queue = [start_url]
    local_seen = set()

    while queue:
        current = queue.pop(0)
        current = normalize_url(current)
        if current in local_seen:
            continue
        local_seen.add(current)
        visited_pages.add(current)

        try:
            soup = get_soup(current)
        except Exception as exc:
            save_meta({
                "status": "running",
                "message": f"Грешка при листинг: {current}\n{exc}",
                "listing_pages_visited": len(visited_pages),
                "product_urls_found": len(product_urls),
            })
            continue

        # Product links
        for a in soup.find_all("a", href=True):
            href = normalize_url(a["href"])
            if is_product_url(href):
                product_urls.add(href)

        # Same category pagination links
        current_path = urlparse(start_url).path.rstrip("/")
        for a in soup.find_all("a", href=True):
            href = normalize_url(a["href"])
            if not href:
                continue
            parsed = urlparse(href)
            if parsed.path.rstrip("/") == current_path and "page=" in parsed.query:
                if href not in local_seen:
                    queue.append(href)

        save_meta({
            "status": "running",
            "message": f"Обхождам листинги...\nКатегория: {start_url}\nПосетени листинги: {len(visited_pages)}\nНамерени продуктови URL: {len(product_urls)}",
            "listing_pages_visited": len(visited_pages),
            "product_urls_found": len(product_urls),
        })

def clean_text(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", value).strip()

def soup_text(soup):
    return clean_text(soup.get_text(" ", strip=True))

def parse_price_block(text):
    text = text.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text)

    patterns = [
        r"(\d+)[\s,\.]*(\d{2})\s*€\s*(\d+)[\s,\.]*(\d{2})\s*(?:лв|lv)\s*(?:Онлайн цена|Online Price)",
        r"(\d+)[\s,\.]*(\d{2})\s*€\s*(\d+)[\s,\.]*(\d{2})\s*(?:лв|lv)",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            eur = float(f"{m.group(1)}.{m.group(2)}")
            bgn = float(f"{m.group(3)}.{m.group(4)}")
            return eur, bgn
    return None, None

def parse_item_number(text):
    patterns = [
        r"Артикул №\s*([A-Za-z0-9\-/]+)",
        r"Item №\s*([A-Za-z0-9\-/]+)",
        r"Артикулен №\s*([A-Za-z0-9\-/]+)",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return ""

def pick_image(soup):
    for selector in [
        ('meta', {'property': 'og:image'}, 'content'),
        ('meta', {'name': 'twitter:image'}, 'content'),
    ]:
        tag = soup.find(selector[0], selector[1])
        if tag and tag.get(selector[2]):
            return normalize_url(tag.get(selector[2]))
    for img in soup.find_all("img", src=True):
        src = normalize_url(img["src"])
        if "placeholder" in src.lower():
            continue
        if src:
            return src
    return ""

def pick_title(soup):
    h1 = soup.find("h1")
    if h1:
        return clean_text(h1.get_text(" ", strip=True))
    title_tag = soup.find("meta", {"property": "og:title"})
    if title_tag and title_tag.get("content"):
        title = title_tag["content"]
        title = re.sub(r"\s*[⋆|]\s*MASTERHAUS.*$", "", title, flags=re.IGNORECASE)
        return clean_text(title)
    if soup.title and soup.title.string:
        return clean_text(soup.title.string)
    return ""

def pick_category(text, url):
    # Try from breadcrumb-like text
    if "/bg/promotions" in url:
        return "Промоции"
    m = re.search(r"Начало\s*/\s*Продукти\s*/\s*(.*?)\s*/\s*(.*?)\s*/", text, flags=re.IGNORECASE)
    if m:
        return clean_text(m.group(2))
    m2 = re.search(r"Home\s*/\s*Products\s*/\s*(.*?)\s*/\s*(.*?)\s*/", text, flags=re.IGNORECASE)
    if m2:
        return clean_text(m2.group(2))
    return category_label_from_url(url)

def pick_availability(text):
    checks = [
        "Product not available",
        "Продуктът не е наличен",
        "Product available",
        "Продуктът е наличен",
        "Online Price",
        "Онлайн цена",
        "От брошура",
        "Винаги ниска цена",
        "Продукт по запитване",
    ]
    for label in checks:
        if label.lower() in text.lower():
            return label
    return ""

def parse_product(url):
    soup = get_soup(url)
    text = soup_text(soup)
    head_text = text[:3000]

    title = pick_title(soup)
    item_number = parse_item_number(head_text)
    price_eur, price_bgn = parse_price_block(head_text)
    image = pick_image(soup)
    category = pick_category(head_text, url)
    availability = pick_availability(head_text)

    return {
        "title": title,
        "price_bgn": price_bgn,
        "price_eur": price_eur,
        "category": category,
        "item_number": item_number,
        "availability": availability,
        "url": url,
        "image": image,
        "scraped_at": now_iso(),
    }

def main():
    ensure_data_dir()
    started_at = now_iso()
    save_meta({
        "status": "running",
        "message": "Стартиране на scraper...",
        "started_at": started_at,
        "last_updated": started_at,
        "categories_found": 0,
        "listing_pages_visited": 0,
        "product_urls_found": 0,
        "products_saved": 0,
    })

    categories = collect_category_urls()
    save_meta({
        "status": "running",
        "message": f"Намерени категории: {len(categories)}",
        "categories_found": len(categories),
    })

    product_urls = set()
    visited_pages = set()

    for idx, category_url in enumerate(categories, start=1):
        save_meta({
            "status": "running",
            "message": f"Обработвам категории {idx}/{len(categories)}...\n{category_url}",
            "categories_found": len(categories),
            "listing_pages_visited": len(visited_pages),
            "product_urls_found": len(product_urls),
        })
        crawl_listing_pages(category_url, product_urls, visited_pages)

    product_urls = sorted(product_urls)
    save_meta({
        "status": "running",
        "message": f"Намерени продуктови страници: {len(product_urls)}\nЗапочва четене на продуктите...",
        "categories_found": len(categories),
        "listing_pages_visited": len(visited_pages),
        "product_urls_found": len(product_urls),
    })

    products = []
    seen = set()
    completed = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        future_map = {pool.submit(parse_product, url): url for url in product_urls}
        for future in as_completed(future_map):
            url = future_map[future]
            completed += 1
            try:
                product = future.result()
                key = product.get("url") or url
                if key not in seen and product.get("title"):
                    seen.add(key)
                    products.append(product)
            except Exception as exc:
                save_meta({
                    "status": "running",
                    "message": f"Грешка при продукт:\n{url}\n{exc}\nЗавършени: {completed}/{len(product_urls)}",
                    "categories_found": len(categories),
                    "listing_pages_visited": len(visited_pages),
                    "product_urls_found": len(product_urls),
                    "products_saved": len(products),
                })

            if completed % SAVE_EVERY == 0:
                products.sort(key=lambda x: (x.get("category") or "", x.get("title") or ""))
                write_products(products)
                save_meta({
                    "status": "running",
                    "message": f"Записани междинни данни.\nГотови продукти: {len(products)} / {len(product_urls)}",
                    "categories_found": len(categories),
                    "listing_pages_visited": len(visited_pages),
                    "product_urls_found": len(product_urls),
                    "products_saved": len(products),
                    "last_updated": now_iso(),
                })

    products.sort(key=lambda x: (x.get("category") or "", x.get("title") or ""))
    write_products(products)

    finished_at = now_iso()
    save_meta({
        "status": "finished",
        "message": f"Готово.\nКатегории: {len(categories)}\nЛистинги: {len(visited_pages)}\nПродуктови URL: {len(product_urls)}\nЗаписани продукти: {len(products)}",
        "categories_found": len(categories),
        "listing_pages_visited": len(visited_pages),
        "product_urls_found": len(product_urls),
        "products_saved": len(products),
        "last_updated": finished_at,
    })
    print("Finished. Saved products:", len(products))

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        save_meta({
            "status": "idle",
            "message": "Спряно ръчно от потребителя.",
            "last_updated": now_iso(),
        })
        print("Stopped by user.")
        sys.exit(1)
    except Exception as exc:
        save_meta({
            "status": "error",
            "message": f"Критична грешка:\n{exc}",
            "last_updated": now_iso(),
        })
        print("Fatal error:", exc)
        raise
