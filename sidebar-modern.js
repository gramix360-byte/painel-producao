(() => {
  const icons = {
    dashboard: "⌂",
    customers: "♙",
    products: "◇",
    quotes: "▤",
    novo: "🛒",
    pedidos: "▣",
    phases: "≡",
    producao: "⚙",
    expedicao: "➜",
    shipping: "▰",
    purchases: "▱",
    finance: "▥",
    reports: "◔",
    marketing: "◁",
    sync: "↻",
    integrations: "↗",
    settings: "⚙",
  };
  const groupIcons = {
    inicio: "⌂",
    vendas: "▤",
    produtos: "◇",
    producao: "⚙",
    financeiro: "▥",
    marketing: "◁",
    canais: "↻",
    admin: "⚙",
  };
  function ensureAsset(tag, attrs) {
    const key = attrs.href || attrs.src;
    if ([...document.querySelectorAll(tag)].some((node) => (node.href || node.src || "").includes(key))) return;
    const node = document.createElement(tag);
    Object.assign(node, attrs);
    document.head.appendChild(node);
  }
  function loadOrganization() {
    ["koda-olist", "sales-organizer", "catalog-organizer", "operations-organizer", "finance-organizer", "admin-organizer"].forEach((name) =>
      ensureAsset("link", { rel: "stylesheet", href: `./${name}.css` }),
    );
    ["sales-organizer", "catalog-organizer", "operations-organizer", "finance-organizer", "admin-organizer"].forEach((name) =>
      ensureAsset("script", { src: `./${name}.js` }),
    );
  }
  function textSpan(btn, key) {
    if (!btn) return null;
    if (!btn.querySelector(".sidebar-icon"))
      btn.innerHTML = `<span class="sidebar-icon">${icons[key] || "•"}</span><span>${btn.textContent.trim()}</span>`;
    return btn;
  }
  function makeGroup(nav, key, title, buttons, { single = false } = {}) {
    const valid = buttons.filter(Boolean);
    if (!valid.length) return null;
    const g = document.createElement("div");
    g.className = "sidebar-group" + (single ? " sidebar-group-single" : "");
    g.dataset.group = key;
    const h = document.createElement("button");
    h.type = "button";
    h.className = "sidebar-group-toggle";
    h.innerHTML = `<span class="sidebar-group-icon">${groupIcons[key] || "•"}</span><span class="sidebar-group-label">${title}</span>${single ? "" : '<span class="sidebar-group-arrow">›</span>'}`;
    g.appendChild(h);
    const body = document.createElement("div");
    body.className = "sidebar-group-items";
    if (single) {
      body.hidden = true;
      body.style.display = "none";
      body.setAttribute("aria-hidden", "true");
    }
    valid.forEach((b) => body.appendChild(b));
    g.appendChild(body);
    nav.appendChild(g);
    if (single) {
      h.onclick = () => valid[0]?.click();
    } else
      h.onclick = () => {
        const opening = !g.classList.contains("open");
        nav
          .querySelectorAll(".sidebar-group.open")
          .forEach((x) => x !== g && x.classList.remove("open"));
        g.classList.toggle("open", opening);
        localStorage.setItem("koda-sidebar-group", opening ? key : "");
      };
    return g;
  }
  function mount() {
    loadOrganization();
    const side = document.querySelector(".sidebar"),
      nav = document.getElementById("nav");
    if (!side || !nav || side.dataset.modern === "2") return;
    side.dataset.modern = "2";
    side.querySelector(".sidebar-search")?.remove();
    side.querySelector(".sidebar-footer")?.remove();
    document.querySelector(".sidebar-collapse")?.remove();
    const map = {
      dashboard: document.querySelector('.nav-item[data-view="dashboard"]'),
      customers: document.getElementById("customers-nav"),
      products: document.getElementById("products-nav"),
      quotes: document.getElementById("quotes-nav"),
      novo: document.querySelector('.nav-item[data-view="novo"]'),
      phases: document.getElementById("phases-nav"),
      producao: document.querySelector('.nav-item[data-view="producao"]'),
      shipping: document.getElementById("shipping-nav"),
      pedidos: document.querySelector('.nav-item[data-view="pedidos"]'),
      purchases: document.getElementById("purchases-nav"),
      finance: document.getElementById("finance-nav"),
      reports: document.getElementById("reports-nav"),
      marketing: document.getElementById("marketing-nav"),
      sync: document.querySelector('.nav-item[data-view="sync"]'),
      integrations: document.getElementById("integrations-nav"),
      settings: document.getElementById("settings-nav"),
    };
    Object.entries(map).forEach(([k, b]) => textSpan(b, k));
    nav.innerHTML = "";
    const search = document.createElement("button");
    search.className = "sidebar-search";
    search.type = "button";
    search.innerHTML =
      "<span>⌕</span><span>Buscar no sistema...</span><kbd>Ctrl K</kbd>";
    search.onclick = () => window.KodaSearch?.open?.();
    side.insertBefore(search, nav);
    makeGroup(nav, "inicio", "Visão geral", [map.dashboard], { single: true });
    makeGroup(nav, "vendas", "Vendas", [
      map.quotes,
      map.pedidos,
      map.customers,
      map.novo,
    ]);
    makeGroup(nav, "produtos", "Produtos", [map.products, map.purchases]);
    makeGroup(nav, "producao", "Produção", [map.producao], { single: true });
    makeGroup(nav, "expedicao", "Expedição", [map.shipping], { single: true });
    makeGroup(nav, "financeiro", "Financeiro", [map.finance, map.reports]);
    makeGroup(nav, "canais", "Integrações", [map.integrations]);
    makeGroup(nav, "admin", "Mais", [map.marketing, map.settings]);
    const footer = document.createElement("div");
    footer.className = "sidebar-footer";
    footer.innerHTML =
      '<div class="sidebar-user"><div class="sidebar-avatar">B</div><div><strong>Brindes On</strong><small>Administrativo</small></div></div><button type="button" class="sidebar-logout"><span class="sidebar-icon">↪</span><span>Sair do sistema</span></button>';
    side.appendChild(footer);
    footer.querySelector(".sidebar-logout").onclick = () =>
      document.getElementById("logout-button")?.click();
    const collapse = document.createElement("button");
    collapse.className = "sidebar-collapse";
    collapse.type = "button";
    collapse.textContent = "‹";
    collapse.title = "Recolher menu";
    collapse.onclick = () => {
      side.classList.toggle("collapsed");
      collapse.textContent = side.classList.contains("collapsed") ? "›" : "‹";
      localStorage.setItem(
        "koda-sidebar-collapsed",
        side.classList.contains("collapsed") ? "1" : "0",
      );
    };
    side.insertAdjacentElement("afterend", collapse);
    if (localStorage.getItem("koda-sidebar-collapsed") === "1") {
      side.classList.add("collapsed");
      collapse.textContent = "›";
    }
    const saved = localStorage.getItem("koda-sidebar-group");
    if (saved)
      nav
        .querySelector(`.sidebar-group[data-group="${saved}"]`)
        ?.classList.add("open");
    function syncActive(btn) {
      nav.querySelectorAll(".sidebar-group").forEach((g) => {
        const has = g.contains(btn);
        if (has && !g.classList.contains("sidebar-group-single")) {
          nav
            .querySelectorAll(".sidebar-group.open")
            .forEach((x) => x !== g && x.classList.remove("open"));
          g.classList.add("open");
          localStorage.setItem("koda-sidebar-group", g.dataset.group || "");
        }
      });
    }
    document.addEventListener(
      "click",
      (e) => {
        const b = e.target.closest("#nav .sidebar-group-items button");
        if (!b) return;
        nav
          .querySelectorAll(".sidebar-group-items button")
          .forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        syncActive(b);
      },
      true,
    );
    const current = nav.querySelector(".sidebar-group-items button.active");
    if (current) syncActive(current);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
