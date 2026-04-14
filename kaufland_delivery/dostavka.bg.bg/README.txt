SoulFlame Доставки x Kaufland - локален пакет

Какво има вътре:
- index.html -> главната страница
- assets/config.js -> % надценка, +1€ доставка, logo URL
- data/products-data.js -> продуктите за директно зареждане в браузъра
- data/products.json -> JSON версия на таблицата
- data/kaufland_bg_public_offers_snapshot_203.xlsx -> изходната таблица
- sync-products.py / sync-products.bat -> презаписват data файловете от XLSX

Как работи:
1. Отвори index.html
2. Добави продукти в количката
3. Въведи име, телефон, адрес
4. Изпрати поръчката през WhatsApp или копирай текста

Какво е променено:
- бутонът URL е заменен с AR
- зоната на продукта вече е подготвена да показва реална product image
- ако в таблицата няма image URL, сайтът показва чист placeholder вместо голямо повтарящо се Kaufland лого
- AR Preview отваря голям преглед на продукта и бутон към източника

Важно:
- Пакетът в момента е вързан към наличната таблица с 203 оферти.
- За реални снимки за всеки продукт добави колона Image URL / Снимка URL в Excel файла и пусни sync-products.bat
- Ако имаш отделен Product URL, добави колона Product URL / Продукт URL
- % надценка се сменя в assets/config.js
