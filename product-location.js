(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  let locations = new Map();

  async function headers() {
    const session = await window.PPAuth.getSession();
    return {
      apikey: window.PPAuth.key,
      Authorization: `Bearer ${session?.access_token || ""}`,
    };
  }

  function ensureField() {
    const form = $("#product-form");
    if (!form || $("#product-location")) return;
    const category = $("#product-category")?.closest("label");
    const field = document.createElement("label");
    field.innerHTML = 'Localização no estoque<input id="product-location" placeholder="Ex.: Prateleira A2">';
    category ? category.insertAdjacentElement("beforebegin", field) : form.appendChild(field);
  }

  async function loadLocations() {
    try {
      const response = await fetch(`${window.PPAuth.url}/rest/v1/products?select=id,sku,storage_location&deleted_at=is.null`, { headers: await headers() });
      if (!response.ok) return;
      const rows = await response.json();
      locations = new Map(rows.map((row) => [String(row.sku || ""), row.storage_location || ""]));
      decorateCards();
    } catch (error) {
      console.warn("Localização dos produtos", error);
    }
  }

  function decorateCards() {
    document.querySelectorAll("#product-list .product-card").forEach((card) => {
      const sku = card.dataset.productSku || "";
      const location = locations.get(sku);
      let badge = $(".product-location-badge", card);
      if (!location) {
        badge?.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "product-location-badge";
        $(".product-card-meta", card)?.appendChild(badge);
      }
      badge.textContent = `Local: ${location}`;
    });
  }

  async function fillEdit(id) {
    ensureField();
    try {
      const response = await fetch(`${window.PPAuth.url}/rest/v1/products?select=storage_location&id=eq.${encodeURIComponent(id)}&limit=1`, { headers: await headers() });
      const rows = response.ok ? await response.json() : [];
      const input = $("#product-location");
      if (input) input.value = rows[0]?.storage_location || "";
    } catch {}
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/rest/v1/products") && ["POST", "PATCH"].includes(init?.method) && init.body) {
      try {
        const body = JSON.parse(init.body);
        const location = $("#product-location")?.value.trim() || null;
        const inject = (row) => {
          const isProductFormSave = row
            && Object.prototype.hasOwnProperty.call(row, "name")
            && Object.prototype.hasOwnProperty.call(row, "low_stock_threshold");
          return isProductFormSave ? { ...row, storage_location: location } : row;
        };
        init = { ...init, body: JSON.stringify(Array.isArray(body) ? body.map(inject) : inject(body)) };
      } catch {}
    }
    return nativeFetch(input, init);
  };

  const observer = new MutationObserver(() => {
    ensureField();
    decorateCards();
  });
  document.addEventListener("DOMContentLoaded", () => {
    observer.observe(document.body, { childList: true, subtree: true });
    ensureField();
    $("#products-nav")?.addEventListener("click", () => setTimeout(loadLocations, 500));
    document.addEventListener("click", (event) => {
      const edit = event.target.closest(".product-edit");
      if (edit?.dataset.id) setTimeout(() => fillEdit(edit.dataset.id), 0);
    }, true);
    $("#product-form")?.addEventListener("reset", () => setTimeout(() => {
      const input = $("#product-location");
      if (input) input.value = "";
    }, 0));
    setTimeout(loadLocations, 900);
  });
  window.PPProductLocation = { refresh: loadLocations };
})();
