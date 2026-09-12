(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  let financeTab = "overview";

  function financeHeader(host, wrap) {
    let shell = $(".finance-module-head", host);
    if (shell) return shell;
    shell = document.createElement("div");
    shell.className = "finance-module-head";
    shell.innerHTML = `
      <div class="finance-module-title">
        <div><h2>Financeiro</h2><p>Recebimentos, pagamentos, caixa e resultados da Brindes On.</p></div>
        <button type="button" class="button secondary" data-open-reports>Ver relatórios</button>
      </div>
      <div class="finance-module-tabs" role="tablist">
        <button type="button" data-fin-tab="overview">Visão geral</button>
        <button type="button" data-fin-tab="receivables">Contas a receber</button>
        <button type="button" data-fin-tab="entries">Lançamentos</button>
        <button type="button" data-fin-tab="results">Resultados e DRE</button>
      </div>`;
    host.insertBefore(shell, wrap);
    $("[data-open-reports]", shell).onclick = () => $("#reports-nav")?.click();
    shell.querySelectorAll("[data-fin-tab]").forEach((button) => {
      button.onclick = () => {
        financeTab = button.dataset.finTab;
        applyFinanceTab(host);
      };
    });
    return shell;
  }

  function mark(node, section) {
    if (!node) return;
    node.classList.add("finance-organized-section");
    node.dataset.financeSection = section;
  }

  function applyFinanceTab(host) {
    host.querySelectorAll("[data-fin-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.finTab === financeTab);
    });
    host.querySelectorAll(".finance-organized-section").forEach((section) => {
      section.classList.toggle("finance-section-hidden", section.dataset.financeSection !== financeTab);
    });
  }

  function organizeFinance() {
    const host = $("#view-financeiro");
    const wrap = $(".finance-wrap", host);
    if (!host || !wrap) return;
    financeHeader(host, wrap);
    mark($("#fin-kpis", wrap), "overview");
    mark($("#fin-accounts", wrap), "overview");
    mark($("#fin-cashflow", wrap), "overview");
    mark($("#fin-receivables", wrap)?.closest(".finance-card"), "receivables");
    mark($("#fin-save", wrap)?.closest(".finance-card"), "entries");
    mark($("#fin-list", wrap)?.closest(".finance-card"), "entries");
    mark($("#fin-result", wrap)?.closest(".finance-card"), "results");
    mark($("#fin-dre", wrap), "results");
    applyFinanceTab(host);
  }

  function organizeReports() {
    const host = $("#view-relatorios");
    const wrap = $(".reports-wrap", host);
    const first = $(".reports-card", wrap);
    if (!host || !wrap || !first || first.classList.contains("reports-main-filter")) return;
    first.classList.add("reports-main-filter");
    const title = $(".report-title h2", first);
    if (title) title.textContent = "Período e filtros";
  }

  let scheduled = false;
  function run() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      organizeFinance();
      organizeReports();
    });
  }
  const observer = new MutationObserver(run);
  function init() {
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("#view-financeiro [data-fin-tab]");
      if (!button) return;
      financeTab = button.dataset.finTab || "overview";
      organizeFinance();
      applyFinanceTab($("#view-financeiro"));
    });
    run();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
