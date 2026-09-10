(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  let settingsTab = "company";

  function organizeDashboard() {
    const host = $("#view-dashboard");
    const dashboard = $(".dashboard-pro", host);
    if (!host || !dashboard) return;
    dashboard.classList.add("dashboard-organized");
    let actions = $(".dashboard-quick-actions", host);
    if (!actions) {
      actions = document.createElement("section");
      actions.className = "dashboard-quick-actions";
      actions.innerHTML = `
        <div><strong>Acesso rápido</strong><span>Comece uma tarefa</span></div>
        <button type="button" data-go="quote">+ Orçamento</button>
        <button type="button" data-go="order">+ Pedido</button>
        <button type="button" data-go="product">+ Produto</button>
        <button type="button" data-go="production">Produção</button>`;
      host.insertBefore(actions, dashboard);
      $("[data-go=quote]", actions).onclick = () => $("#quotes-nav")?.click();
      $("[data-go=order]", actions).onclick = () => $('.nav-item[data-view="novo"]')?.click();
      $("[data-go=product]", actions).onclick = () => {
        $("#products-nav")?.click();
        setTimeout(() => $("[data-new-product]")?.click(), 350);
      };
      $("[data-go=production]", actions).onclick = () => $('.nav-item[data-view="producao"]')?.click();
    }
  }

  function settingsHeader(host, wrap) {
    let header = $(".settings-module-head", host);
    if (header) return header;
    header = document.createElement("div");
    header.className = "settings-module-head";
    header.innerHTML = `
      <div><h2>Configurações</h2><p>Empresa, equipe, automações e segurança.</p></div>
      <div class="settings-module-tabs" role="tablist">
        <button type="button" data-settings-tab="company">Empresa</button>
        <button type="button" data-settings-tab="users">Usuários</button>
        <button type="button" data-settings-tab="automation">Automações</button>
        <button type="button" data-settings-tab="security">Segurança e histórico</button>
      </div>`;
    host.insertBefore(header, wrap);
    header.querySelectorAll("[data-settings-tab]").forEach((button) => {
      button.onclick = () => {
        settingsTab = button.dataset.settingsTab;
        applySettings(host);
      };
    });
    return header;
  }

  function markSettings(card, section) {
    if (!card) return;
    card.classList.add("settings-organized-card");
    card.dataset.settingsSection = section;
  }

  function applySettings(host) {
    host.querySelectorAll("[data-settings-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.settingsTab === settingsTab);
    });
    host.querySelectorAll(".settings-organized-card").forEach((card) => {
      card.classList.toggle("settings-section-hidden", card.dataset.settingsSection !== settingsTab);
    });
  }

  function organizeSettings() {
    const host = $("#view-configuracoes");
    const wrap = $(".settings-wrap", host);
    if (!host || !wrap) return;
    settingsHeader(host, wrap);
    markSettings($("#set-save", wrap)?.closest(".settings-card"), "company");
    markSettings($("#users-list", wrap)?.closest(".settings-card"), "users");
    markSettings($(".automation-list", wrap)?.closest(".settings-card"), "automation");
    markSettings($("#trash-list", wrap)?.closest(".settings-card"), "security");
    markSettings($("#audit-list", wrap)?.closest(".settings-card"), "security");
    applySettings(host);
  }

  function organizeIntegrations() {
    const host = $("#view-integracoes");
    const grid = $(".shopee-sync-grid", host);
    if (!host || !grid || grid.dataset.organized === "1") return;
    grid.dataset.organized = "1";
    grid.querySelectorAll("article").forEach((card) => {
      const name = $("h3", card)?.textContent || "Canal";
      card.classList.add("integration-channel-card");
      card.insertAdjacentHTML("afterbegin", `<span class="integration-letter">${name.charAt(0)}</span>`);
    });
  }

  let scheduled = false;
  function run() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      organizeDashboard();
      organizeSettings();
      organizeIntegrations();
    });
  }
  const observer = new MutationObserver(run);
  function init() {
    observer.observe(document.body, { childList: true, subtree: true });
    run();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
