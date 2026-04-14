(function () {
  const CONFIG = window.SOULFLAME_CONFIG || {};
  const storageKey = "kaufland_delivery_cart_eur_v2";

  let PRODUCTS = normalizeProducts(window.KAUFLAND_PRODUCTS || []);
  const cart = loadCart();
  let currentArProductId = null;

  let lastProductsSignature = JSON.stringify(
    PRODUCTS.map((p) => [
      p.id,
      p.promo_price_bgn,
      p.regular_price_bgn,
      p.image_url,
      p.name,
      p.category,
      p.validity,
    ])
  );

  const els = {
    heroLogo: document.getElementById("heroLogo"),
    syncInfoBtn: document.getElementById("syncInfoBtn"),
    kpiProducts: document.getElementById("kpiProducts"),
    kpiMarkup: document.getElementById("kpiMarkup"),
    kpiDelivery: document.getElementById("kpiDelivery"),
    kpiSource: document.getElementById("kpiSource"),

    searchInput: document.getElementById("searchInput"),
    categorySelect: document.getElementById("categorySelect"),
    sortSelect: document.getElementById("sortSelect"),
    resetBtn: document.getElementById("resetBtn"),
    resultsInfo: document.getElementById("resultsInfo"),
    catalogGrid: document.getElementById("catalogGrid"),

    cartList: document.getElementById("cartList"),
    cartCountBadge: document.getElementById("cartCountBadge"),
    subtotalBgn: document.getElementById("subtotalBgn"),
    markupBgn: document.getElementById("markupBgn"),
    deliveryBgn: document.getElementById("deliveryBgn"),
    grandTotalBgn: document.getElementById("grandTotalBgn"),

    customerName: document.getElementById("customerName"),
    customerPhone: document.getElementById("customerPhone"),
    customerAddress: document.getElementById("customerAddress"),
    customerNotes: document.getElementById("customerNotes"),

    sendWhatsAppBtn: document.getElementById("sendWhatsAppBtn"),
    copyOrderBtn: document.getElementById("copyOrderBtn"),
    downloadOrderBtn: document.getElementById("downloadOrderBtn"),
    clearCartBtn: document.getElementById("clearCartBtn"),

    toast: document.getElementById("toast"),

    arModal: document.getElementById("arModal"),
    closeArBtn: document.getElementById("closeArBtn"),
    arStage: document.getElementById("arStage"),
    arName: document.getElementById("arName"),
    arCategory: document.getElementById("arCategory"),
    arPrice: document.getElementById("arPrice"),
    arOldPrice: document.getElementById("arOldPrice"),
    arValidity: document.getElementById("arValidity"),
    arDiscount: document.getElementById("arDiscount"),
    arImageState: document.getElementById("arImageState"),
    openSourceBtn: document.getElementById("openSourceBtn"),
    addFromArBtn: document.getElementById("addFromArBtn"),
  };

  if (els.heroLogo) {
    els.heroLogo.src =
      CONFIG.kauflandLogoUrl || "./assets/kaufland-logo-fallback.svg";
    els.heroLogo.onerror = function () {
      this.src = "./assets/kaufland-logo-fallback.svg";
    };
  }

  updateKpis();
  initFilters();
  bindEvents();
  renderCatalog();
  renderCart();
  startLiveRefresh();

  function bindEvents() {
    els.searchInput?.addEventListener("input", renderCatalog);
    els.categorySelect?.addEventListener("change", renderCatalog);
    els.sortSelect?.addEventListener("change", renderCatalog);
    els.resetBtn?.addEventListener("click", resetFilters);

    els.clearCartBtn?.addEventListener("click", clearCart);
    els.copyOrderBtn?.addEventListener("click", copyOrderSummary);
    els.downloadOrderBtn?.addEventListener("click", downloadOrderJson);
    els.sendWhatsAppBtn?.addEventListener("click", sendWhatsAppOrder);

    els.syncInfoBtn?.addEventListener("click", async () => {
      const ok = confirm(
        "Това ще презареди локалния products-data.js и ще обнови каталога."
      );
      if (ok) {
        await refreshProductsFromFile(true);
      }
    });

    els.closeArBtn?.addEventListener("click", closeArModal);

    els.arModal?.addEventListener("click", (e) => {
      if (e.target && e.target.hasAttribute("data-close-ar")) {
        closeArModal();
      }
    });

    els.addFromArBtn?.addEventListener("click", () => {
      if (!currentArProductId) return;
      addToCart(currentArProductId);
      closeArModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && els.arModal && !els.arModal.hidden) {
        closeArModal();
      }
    });
  }

  function updateKpis() {
    if (els.kpiProducts) {
      els.kpiProducts.textContent = PRODUCTS.length.toLocaleString("bg-BG");
    }
    if (els.kpiMarkup) {
      els.kpiMarkup.textContent = `${num(CONFIG.markupPercent || 0)}%`;
    }
    if (els.kpiDelivery) {
      els.kpiDelivery.textContent = formatEUR(CONFIG.deliveryFeeEur || 0);
    }
    if (els.kpiSource) {
      els.kpiSource.textContent = CONFIG.dataSourceName || "JS";
    }
  }

  function initFilters() {
    if (!els.categorySelect) return;

    const currentValue = els.categorySelect.value || "all";
    const categories = [
      "Всички",
      ...new Set(PRODUCTS.map((p) => p.category).filter(Boolean)),
    ];

    els.categorySelect.innerHTML = categories
      .map((cat) => {
        const value = cat === "Всички" ? "all" : escapeAttr(cat);
        return `<option value="${value}">${escapeHtml(cat)}</option>`;
      })
      .join("");

    const exists = categories.some(
      (c) => (c === "Всички" ? "all" : c) === currentValue
    );
    els.categorySelect.value = exists ? currentValue : "all";
  }

  function resetFilters() {
    if (els.searchInput) els.searchInput.value = "";
    if (els.categorySelect) els.categorySelect.value = "all";
    if (els.sortSelect) els.sortSelect.value = "discount-desc";
    renderCatalog();
  }

  function getFilteredProducts() {
    const q = cleanText(els.searchInput?.value || "").toLowerCase();
    const category = els.categorySelect?.value || "all";

    let list = PRODUCTS.filter((p) => {
      const haystack = [
        p.name,
        p.category,
        p.validity,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesQuery = !q || haystack.includes(q);
      const matchesCategory = category === "all" || p.category === category;

      return matchesQuery && matchesCategory;
    });

    switch (els.sortSelect?.value) {
      case "promo-asc":
        list.sort((a, b) => eurValue(a.promo_price_bgn) - eurValue(b.promo_price_bgn));
        break;
      case "promo-desc":
        list.sort((a, b) => eurValue(b.promo_price_bgn) - eurValue(a.promo_price_bgn));
        break;
      case "name-asc":
        list.sort((a, b) => String(a.name).localeCompare(String(b.name), "bg"));
        break;
      default:
        list.sort((a, b) => num(b.discount_percent) - num(a.discount_percent));
        break;
    }

    return list;
  }

  function renderCatalog() {
    const list = getFilteredProducts();

    if (els.resultsInfo) {
      els.resultsInfo.textContent = `Показани продукти: ${list.length} / ${PRODUCTS.length}`;
    }

    if (!els.catalogGrid) return;

    if (!list.length) {
      els.catalogGrid.innerHTML =
        `<div class="panel empty-state">Няма продукти по този филтър.</div>`;
      return;
    }

    els.catalogGrid.innerHTML = list
      .map((product) => {
        const media = renderProductMedia(product, "card");
        const priceHtml = renderPriceNow(product.promo_price_bgn);
        const oldPriceHtml = renderOldPrice(product.regular_price_bgn);

        return `
          <article class="card" id="card-${escapeAttr(product.id)}">
            <div class="card-head">
              <div class="card-top-copy">
                <div class="card-cat">${escapeHtml(product.category || "Оферта")}</div>
                <div class="card-validity">${escapeHtml(product.validity || "")}</div>
              </div>

              <div class="logo-pill">
                <img
                  src="${escapeAttr(CONFIG.kauflandLogoUrl || "./assets/kaufland-logo-fallback.svg")}"
                  alt="Kaufland"
                  onerror="this.src='./assets/kaufland-logo-fallback.svg'"
                />
                <span class="small">Kaufland</span>
              </div>
            </div>

            <div class="product-image">
              ${media}
            </div>

            <div class="product-copy">
              <div class="product-name" title="${escapeAttr(product.name)}">
                ${escapeHtml(product.name)}
              </div>
            </div>

            <div class="price-row">
              ${priceHtml}
              ${oldPriceHtml}
            </div>

            <div class="meta">
              <span></span>
              <span class="discount-badge">${escapeHtml(product.discount_label || "")}</span>
            </div>

            <div class="card-actions">
              <button class="btn-primary add-btn" data-add="${escapeAttr(product.id)}">Добави</button>
              <button class="btn-outline ar-btn" data-ar="${escapeAttr(product.id)}">AR</button>
            </div>
          </article>
        `;
      })
      .join("");

    els.catalogGrid.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const productId = btn.getAttribute("data-add");
        const card = btn.closest(".card");
        triggerCardEffect(card);
        addToCart(productId);
      });
    });

    els.catalogGrid.querySelectorAll("[data-ar]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openArModal(btn.getAttribute("data-ar"));
      });
    });
  }

  function renderPriceNow(priceBgn) {
    const eur = bgnToEur(priceBgn);
    if (!eur || eur <= 0) {
      return `<div class="price-now price-missing">Няма цена</div>`;
    }
    return `<div class="price-now">${formatEUR(eur)}</div>`;
  }

  function renderOldPrice(priceBgn) {
    const eur = bgnToEur(priceBgn);
    if (!eur || eur <= 0) return "";
    return `<div class="price-old">${formatEUR(eur)}</div>`;
  }

  function hasRealImage(product) {
    const url = cleanText(product?.image_url || "");
    return (
      !!url &&
      !/kl-logo|logo-footer|kaufland-logo-fallback\.svg/i.test(url) &&
      !String(product?.image_type || "").includes("fallback") &&
      !String(product?.image_type || "").includes("missing")
    );
  }

  function renderProductMedia(product, size) {
    const imgClasses = size === "ar" ? "media-img media-img-ar" : "media-img";

    if (hasRealImage(product)) {
      return `
        <div class="media-stack">
          <img
            class="${imgClasses}"
            src="${escapeAttr(product.image_url)}"
            alt="${escapeAttr(product.name)}"
            onerror="this.style.display='none'; this.nextElementSibling.classList.remove('is-hidden');"
          />
          ${renderFallbackMedia(product).replace(
            'product-fallback',
            'product-fallback is-hidden'
          )}
        </div>
      `;
    }

    return renderFallbackMedia(product);
  }

  function renderFallbackMedia(product) {
    return `
      <div class="product-fallback">
        <div class="fallback-top">
          <img
            src="${escapeAttr(CONFIG.kauflandLogoUrl || "./assets/kaufland-logo-fallback.svg")}"
            alt="Kaufland"
            onerror="this.src='./assets/kaufland-logo-fallback.svg'"
          />
          <span>${escapeHtml(product.category || "Оферта")}</span>
        </div>
        <div class="fallback-name">${escapeHtml(product.name)}</div>
        <div class="fallback-sub">Няма реална снимка за този продукт</div>
      </div>
    `;
  }

  function openArModal(productId) {
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product || !els.arModal) return;

    currentArProductId = product.id;

    if (els.arStage) {
      els.arStage.innerHTML = renderProductMedia(product, "ar");
    }

    if (els.arName) els.arName.textContent = product.name || "";
    if (els.arCategory) els.arCategory.textContent = product.category || "";

    if (els.arPrice) {
      const eur = bgnToEur(product.promo_price_bgn);
      els.arPrice.textContent = eur > 0 ? formatEUR(eur) : "Няма цена";
      els.arPrice.classList.toggle("price-missing", !(eur > 0));
    }

    if (els.arOldPrice) {
      const eurOld = bgnToEur(product.regular_price_bgn);
      els.arOldPrice.textContent = eurOld > 0 ? formatEUR(eurOld) : "";
    }

    if (els.arValidity) els.arValidity.textContent = product.validity || "";
    if (els.arDiscount) els.arDiscount.textContent = product.discount_label || "";

    if (els.arImageState) {
      els.arImageState.textContent = hasRealImage(product)
        ? "Показана е реална снимка."
        : "Липсва реална снимка.";
    }

    if (els.openSourceBtn) {
      const href = product.product_url || product.source_url || "#";
      els.openSourceBtn.href = href;
      els.openSourceBtn.classList.toggle(
        "disabled-link",
        href === "#"
      );
    }

    els.arModal.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeArModal() {
    if (!els.arModal) return;
    els.arModal.hidden = true;
    currentArProductId = null;
    document.body.classList.remove("modal-open");
  }

  function loadCart() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(storageKey, JSON.stringify(cart));
  }

  function addToCart(productId) {
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) return;

    const existing = cart.find((item) => item.id === productId);

    if (existing) {
      existing.qty += 1;
      existing.price_bgn = num(product.promo_price_bgn);
      existing.regular_price_bgn = num(product.regular_price_bgn);
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        category: product.category,
        price_bgn: num(product.promo_price_bgn),
        regular_price_bgn: num(product.regular_price_bgn),
        source_url: product.source_url,
        image_url: product.image_url,
        qty: 1,
      });
    }

    saveCart();
    renderCart();
    showToast("Добавено в количката");
  }

  function changeQty(productId, delta) {
    const item = cart.find((x) => x.id === productId);
    if (!item) return;

    item.qty += delta;

    if (item.qty <= 0) {
      const idx = cart.findIndex((x) => x.id === productId);
      if (idx >= 0) cart.splice(idx, 1);
    }

    saveCart();
    renderCart();
  }

  function clearCart() {
    cart.length = 0;
    saveCart();
    renderCart();
    showToast("Количката е изчистена");
  }

  function renderCart() {
    if (!els.cartList) return;

    if (!cart.length) {
      els.cartList.innerHTML =
        `<div class="empty-state">Количката е празна. Добави продукти от каталога.</div>`;
    } else {
      els.cartList.innerHTML = cart
        .map((item) => {
          const lineTotalEur = bgnToEur(item.price_bgn) * item.qty;
          return `
            <div class="cart-item">
              <div class="cart-item-top">
                <div class="cart-item-name">${escapeHtml(item.name)}</div>
                <div class="cart-item-price">${lineTotalEur > 0 ? formatEUR(lineTotalEur) : "Няма цена"}</div>
              </div>
              <div class="small">${escapeHtml(item.category || "")}</div>
              <div class="qty-row">
                <button class="qty-btn" data-qty="${escapeAttr(item.id)}" data-delta="-1">−</button>
                <span class="qty-value">${item.qty}</span>
                <button class="qty-btn" data-qty="${escapeAttr(item.id)}" data-delta="1">+</button>
              </div>
            </div>
          `;
        })
        .join("");

      els.cartList.querySelectorAll("[data-qty]").forEach((btn) => {
        btn.addEventListener("click", () => {
          changeQty(
            btn.getAttribute("data-qty"),
            Number(btn.getAttribute("data-delta"))
          );
        });
      });
    }

    const subtotalEur = cart.reduce((sum, item) => {
      const eur = bgnToEur(item.price_bgn);
      return sum + (eur > 0 ? eur * item.qty : 0);
    }, 0);

    const markupEur = subtotalEur * ((CONFIG.markupPercent || 0) / 100);
    const deliveryEur = cart.length ? num(CONFIG.deliveryFeeEur || 0) : 0;
    const grandEur = subtotalEur + markupEur + deliveryEur;

    if (els.subtotalBgn) els.subtotalBgn.textContent = formatEUR(subtotalEur);
    if (els.markupBgn) els.markupBgn.textContent = formatEUR(markupEur);
    if (els.deliveryBgn) els.deliveryBgn.textContent = formatEUR(deliveryEur);
    if (els.grandTotalBgn) els.grandTotalBgn.textContent = formatEUR(grandEur);

    if (els.cartCountBadge) {
      els.cartCountBadge.textContent = String(
        cart.reduce((sum, item) => sum + item.qty, 0)
      );
    }

    els.cartList?.classList.remove("flash");
    void els.cartList?.offsetWidth;
    els.cartList?.classList.add("flash");
  }

  function buildOrderObject() {
    const subtotalEur = cart.reduce((sum, item) => {
      const eur = bgnToEur(item.price_bgn);
      return sum + (eur > 0 ? eur * item.qty : 0);
    }, 0);

    const markupEur = subtotalEur * ((CONFIG.markupPercent || 0) / 100);
    const deliveryEur = cart.length ? num(CONFIG.deliveryFeeEur || 0) : 0;
    const grandEur = subtotalEur + markupEur + deliveryEur;

    return {
      created_at: new Date().toISOString(),
      company: CONFIG.companyName || "Kaufland Delivery",
      currency: "EUR",
      customer: {
        name: cleanText(els.customerName?.value || ""),
        phone: cleanText(els.customerPhone?.value || ""),
        address: cleanText(els.customerAddress?.value || ""),
        notes: cleanText(els.customerNotes?.value || ""),
      },
      pricing: {
        subtotal_eur: round2(subtotalEur),
        markup_percent: num(CONFIG.markupPercent || 0),
        markup_eur: round2(markupEur),
        delivery_eur: round2(deliveryEur),
        total_eur: round2(grandEur),
      },
      items: cart.map((item) => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
        unit_price_eur: round2(bgnToEur(item.price_bgn)),
        line_total_eur: round2(bgnToEur(item.price_bgn) * item.qty),
        image_url: item.image_url,
        source_url: item.source_url,
      })),
    };
  }

  function buildOrderText() {
    const order = buildOrderObject();
    const lines = [];

    lines.push(`${order.company}`);
    lines.push("Нова поръчка");
    lines.push("");

    if (order.customer.name) lines.push(`Име: ${order.customer.name}`);
    if (order.customer.phone) lines.push(`Телефон: ${order.customer.phone}`);
    if (order.customer.address) lines.push(`Адрес: ${order.customer.address}`);
    if (order.customer.notes) lines.push(`Бележка: ${order.customer.notes}`);

    lines.push("");
    lines.push("Продукти:");

    order.items.forEach((item, idx) => {
      lines.push(
        `${idx + 1}. ${item.name} x${item.qty} — ${item.line_total_eur.toFixed(2)} €`
      );
    });

    lines.push("");
    lines.push(`Kaufland сума: ${order.pricing.subtotal_eur.toFixed(2)} €`);
    lines.push(`Надценка ${order.pricing.markup_percent}%: ${order.pricing.markup_eur.toFixed(2)} €`);
    lines.push(`Доставка: ${order.pricing.delivery_eur.toFixed(2)} €`);
    lines.push(`Крайна сума: ${order.pricing.total_eur.toFixed(2)} €`);

    return lines.join("\n");
  }

  async function copyOrderSummary() {
    if (!cart.length) {
      showToast("Количката е празна");
      return;
    }

    try {
      await navigator.clipboard.writeText(buildOrderText());
      showToast("Поръчката е копирана");
    } catch {
      showToast("Не успях да копирам поръчката");
    }
  }

  function downloadOrderJson() {
    if (!cart.length) {
      showToast("Количката е празна");
      return;
    }

    const blob = new Blob([JSON.stringify(buildOrderObject(), null, 2)], {
      type: "application/json;charset=utf-8",
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kaufland-delivery-order-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    showToast("Свален е JSON");
  }

  function sendWhatsAppOrder() {
    if (!cart.length) {
      showToast("Количката е празна");
      return;
    }

    const text = encodeURIComponent(buildOrderText());
    window.open(
      (CONFIG.whatsappBase || "https://wa.me/?text=") + text,
      "_blank"
    );
  }

  function startLiveRefresh() {
    setInterval(() => {
      refreshProductsFromFile(false);
    }, 60000);
  }

  async function refreshProductsFromFile(forceToast) {
    try {
      const url = `./products-data.js?ts=${Date.now()}`;
      const text = await fetch(url, { cache: "no-store" }).then((r) => r.text());

      const sandbox = {};
      new Function("window", `${text}; return window.KAUFLAND_PRODUCTS;`)(sandbox);

      const incoming = normalizeProducts(sandbox.KAUFLAND_PRODUCTS || []);
      const signature = JSON.stringify(
        incoming.map((p) => [
          p.id,
          p.promo_price_bgn,
          p.regular_price_bgn,
          p.image_url,
          p.name,
          p.category,
          p.validity,
        ])
      );

      if (signature !== lastProductsSignature && incoming.length) {
        PRODUCTS = incoming;
        lastProductsSignature = signature;
        updateKpis();
        initFilters();
        refreshCartPrices();
        renderCatalog();
        renderCart();
        showToast(`Обновени продукти: ${incoming.length}`);
      } else if (forceToast) {
        showToast("Няма нови промени");
      }
    } catch {
      if (forceToast) {
        showToast("Не успях да презаредя products-data.js");
      }
    }
  }

  function refreshCartPrices() {
    cart.forEach((item) => {
      const p = PRODUCTS.find((x) => x.id === item.id);
      if (!p) return;
      item.price_bgn = num(p.promo_price_bgn);
      item.regular_price_bgn = num(p.regular_price_bgn);
      item.image_url = p.image_url;
      item.source_url = p.source_url;
    });

    saveCart();
  }

  function triggerCardEffect(card) {
    if (!card) return;
    card.classList.remove("is-popping");
    void card.offsetWidth;
    card.classList.add("is-popping");
    setTimeout(() => {
      card.classList.remove("is-popping");
    }, 1000);
  }

  function normalizeProducts(list) {
    return (Array.isArray(list) ? list : []).map((raw, idx) => {
      const sourceBlob = [
        raw.name,
        raw.product_name,
        raw.title,
        raw.category,
        raw.source_category,
        raw.validity,
        raw.discount_label,
      ]
        .filter(Boolean)
        .join(" ");

      const promo = parsePrice(
        raw.promo_price_bgn ?? raw.price ?? raw.promoPrice ?? raw.promo_price
      );

      const regular = parsePrice(
        raw.regular_price_bgn ??
          raw.oldPrice ??
          raw.regular_price ??
          raw.original_price_bgn
      );

      const cleanCategory = sanitizeCategory(
        raw.category || raw.source_category || sourceBlob
      );

      const cleanValidity = sanitizeValidity(
        raw.validity || sourceBlob
      );

      const cleanName = sanitizeProductName(
        raw.name || raw.product_name || raw.title || sourceBlob
      );

      const discountPercent = extractDiscountPercent(
        raw.discount_label,
        promo,
        regular
      );

      return {
        ...raw,
        id: String(raw.id || `product-${idx + 1}`),
        name: cleanName,
        category: cleanCategory,
        validity: cleanValidity,
        promo_price_bgn: promo,
        regular_price_bgn: regular,
        discount_percent: discountPercent,
        discount_label:
          cleanText(raw.discount_label || "") ||
          (discountPercent > 0 ? `-${discountPercent}%` : ""),
        source_url: raw.source_url || raw.product_url || "",
        product_url: raw.product_url || raw.source_url || "",
        image_url: raw.image_url || "",
        image_type: raw.image_type || "",
      };
    });
  }

  function sanitizeCategory(value) {
    const s = String(value || "").replace(/\s+/g, " ").trim();

    const known = [
      "Актуални оферти",
      "Kaufland Card",
      "Плодове и зеленчуци",
      "Месо и колбаси",
      "Риба",
      "Млечни продукти",
      "Основни храни",
      "Напитки",
      "Дрогерия и дом",
      "Дом и техника",
      "Тематични оферти",
      "Вкусът на Европа",
      "Домашни потреби",
    ];

    for (const item of known) {
      if (s.toLowerCase().includes(item.toLowerCase())) return item;
    }

    if (/kaufland card/i.test(s)) return "Kaufland Card";
    if (/домашни потреби|дом|техника/i.test(s)) return "Домашни потреби";
    if (/млечни/i.test(s)) return "Млечни продукти";
    if (/основни храни/i.test(s)) return "Основни храни";
    if (/напитки|алкохолни|безалкохолни/i.test(s)) return "Напитки";

    return "Оферти";
  }

  function sanitizeValidity(value) {
    const s = String(value || "").replace(/\s+/g, " ").trim();

    const m1 = s.match(/Валидно от\s*\d{1,2}\.\d{1,2}\.\d{4}\s*до\s*\d{1,2}\.\d{1,2}\.\d{4}/i);
    if (m1) return m1[0];

    const m2 = s.match(/Валидно от\s*\d{1,2}\.\d{1,2}\.\d{4}/i);
    if (m2) return m2[0];

    const m3 = s.match(/Валидни на\s*\d{1,2}\.\d{1,2}\.\d{4}/i);
    if (m3) return m3[0];

    return "";
  }

  function sanitizeProductName(value) {
    let s = String(value || "");

    s = s.replace(/\|/g, " ");
    s = s.replace(/Валидно от\s*\d{1,2}\.\d{1,2}\.\d{4}\s*до\s*\d{1,2}\.\d{1,2}\.\d{4}/gi, " ");
    s = s.replace(/Валидни на\s*\d{1,2}\.\d{1,2}\.\d{4}/gi, " ");
    s = s.replace(/Валидно от\s*\d{1,2}\.\d{1,2}\.\d{4}/gi, " ");

    s = s.replace(/-\s*\d{1,3}\s*%\s*отстъпка\s*с\s*kaufland\s*card/gi, " ");
    s = s.replace(/-\s*\d{1,3}\s*%/g, " ");
    s = s.replace(/\d{1,4}(?:[.,]\d{1,2})?\s*€/gi, " ");
    s = s.replace(/\d{1,4}(?:[.,]\d{1,2})?\s*лв\.?/gi, " ");

    s = s.replace(/Актуални оферти/gi, " ");
    s = s.replace(/Kaufland Card/gi, " ");
    s = s.replace(/Плодове и зеленчуци/gi, " ");
    s = s.replace(/Месо и колбаси/gi, " ");
    s = s.replace(/Млечни продукти/gi, " ");
    s = s.replace(/Основни храни/gi, " ");
    s = s.replace(/Напитки/gi, " ");
    s = s.replace(/Дрогерия и дом/gi, " ");
    s = s.replace(/Дом и техника/gi, " ");
    s = s.replace(/Тематични оферти/gi, " ");
    s = s.replace(/Вкусът на Европа/gi, " ");
    s = s.replace(/Домашни потреби/gi, " ");

    s = s.replace(/\s+/g, " ").trim();

    return s || "Продукт";
  }

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function parsePrice(value) {
    if (typeof value === "number" && Number.isFinite(value)) return round2(value);
    if (value == null) return null;

    let s = String(value).trim();
    if (!s) return null;

    s = s
      .replace(/лв\.?/gi, "")
      .replace(/eur|€/gi, "")
      .replace(/\s+/g, "");

    if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(s)) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(,\d{3})*\.\d{1,2}$/.test(s)) {
      s = s.replace(/,/g, "");
    } else if (s.includes(",") && !s.includes(".")) {
      s = s.replace(",", ".");
    } else if (s.includes(",") && s.includes(".")) {
      s = s.replace(/,/g, "");
    }

    const m = s.match(/-?\d+(?:\.\d+)?/);
    return m ? round2(Number(m[0])) : null;
  }

  function extractDiscountPercent(label, promo, regular) {
    const m = String(label || "").match(/(\d{1,3})/);
    if (m) return Number(m[1]);

    if (promo > 0 && regular > 0 && regular > promo) {
      return Math.round((1 - promo / regular) * 100);
    }

    return 0;
  }

  function bgnToEur(value) {
    const n = num(value);
    const rate = num(CONFIG.eurToBgnRate || 1.95583);
    if (!n || n <= 0 || !rate) return 0;
    return round2(n / rate);
  }

  function eurValue(valueBgn) {
    return bgnToEur(valueBgn);
  }

  function formatEUR(value) {
    return `${num(value).toFixed(2)} €`;
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function round2(value) {
    return Math.round(num(value) * 100) / 100;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  let toastTimer;
  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove("show");
    }, 1800);
  }
})();