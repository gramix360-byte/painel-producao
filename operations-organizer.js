(() => {
  const $ = (selector, root = document) => root.querySelector(selector);

  function flow(active) {
    const steps = [
      ["pedido", "Pedido recebido"],
      ["criacao", "Criando arte"],
      ["aprovacao", "Aguardando aprovação"],
      ["arte", "Arte aprovada"],
      ["producao", "Em produção"],
      ["embalagem", "Embalado"],
      ["expedicao", "Enviado"],
      ["entregue", "Entregue"],
    ];
    const activeIndex = steps.findIndex(([key]) => key === active);
    return `<div class="operation-flow">${steps.map(([key, label], index) => `
      <span class="${key === active ? "active" : index < activeIndex ? "done" : ""}"><i>${index < activeIndex ? "✓" : index + 1}</i>${label}</span>`).join("")}</div>`;
  }

  function productionHeader(host) {
    let header = $(".operation-page-head", host);
    if (!header) {
      header = document.createElement("div");
      header.className = "operation-page-head";
      header.innerHTML = `
        <div class="operation-head-row">
          <div><h2>Produção</h2><p>Da criação da arte até o produto embalado e etiquetado.</p></div>
          <button type="button" class="button secondary" data-open-shipping>Ir para expedição →</button>
        </div>
        ${flow("producao")}`;
      host.prepend(header);
      $("[data-open-shipping]", header).onclick = () => $("#shipping-nav")?.click();
    }
  }

  function organizeProduction() {
    const host = $("#view-producao");
    const columns = $(".production-columns", host);
    if (!host || !columns) return;
    productionHeader(host);
    const titles = columns.querySelectorAll(".column-title h2");
    if (titles[0] && titles[0].textContent !== "Arte e preparação") titles[0].textContent = "Arte e preparação";
    if (titles[1] && titles[1].textContent !== "Em produção") titles[1].textContent = "Em produção";
    columns.querySelectorAll('.status-action[data-status="finalizado"]').forEach((button) => {
      if (button.dataset.operationLabel === "1") return;
      button.dataset.operationLabel = "1";
      button.textContent = "Embalado e etiquetado — Finalizar";
    });
  }

  function organizeShipping() {
    const host = $("#view-expedicao");
    const shell = $(".shipping-shell", host);
    if (!host || !shell || $(".operation-page-head", host)) return;
    const header = document.createElement("div");
    header.className = "operation-page-head";
    header.innerHTML = `
      <div class="operation-head-row">
        <div><h2>Expedição</h2><p>Pedidos embalados, enviados, rastreados e entregues.</p></div>
        <button type="button" class="button secondary" data-open-production>← Voltar para produção</button>
      </div>
      ${flow("expedicao")}`;
    host.insertBefore(header, shell);
    $("[data-open-production]", header).onclick = () => $('.nav-item[data-view="producao"]')?.click();
  }

  let scheduled = false;
  function run() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      organizeProduction();
      organizeShipping();
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
