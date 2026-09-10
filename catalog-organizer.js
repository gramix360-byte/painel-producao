(() => {
  const $ = (selector, root = document) => root.querySelector(selector);

  function organizeProducts() {
    const host = $("#view-produtos");
    const grid = $(".products-grid", host);
    if (!host || !grid || host.dataset.catalogOrganized === "1") return;
    host.dataset.catalogOrganized = "1";

    const form = $("#product-form", grid);
    const list = $(".product-list-panel", grid);
    const header = document.createElement("div");
    header.className = "catalog-page-head";
    header.innerHTML = `
      <div>
        <h2>Produtos</h2>
        <p>Cadastro, preços, estoque, etiquetas e fabricação.</p>
      </div>
      <div class="catalog-head-actions">
        <button type="button" class="button secondary" data-stock>Estoque</button>
        <button type="button" class="button secondary" data-moves>Movimentações</button>
        <button type="button" class="button secondary" data-manufacturing>Fabricação</button>
        <button type="button" class="button primary" data-new-product>+ Novo produto</button>
      </div>`;
    host.insertBefore(header, grid);

    const back = document.createElement("button");
    back.type = "button";
    back.className = "catalog-back";
    back.textContent = "← Voltar para produtos";
    form?.insertBefore(back, form.firstChild);

    const showList = () => {
      form?.classList.add("catalog-hidden");
      list?.classList.remove("catalog-hidden");
      header.classList.remove("catalog-hidden");
    };
    const showForm = () => {
      list?.classList.add("catalog-hidden");
      header.classList.add("catalog-hidden");
      form?.classList.remove("catalog-hidden");
      $("#product-name")?.focus();
    };
    $("[data-new-product]", header).onclick = showForm;
    $("[data-stock]", header).onclick = () => window.KodaSmartInventory?.open?.();
    $("[data-moves]", header).onclick = () => window.KodaInventoryHistory?.open?.();
    $("[data-manufacturing]", header).onclick = () => window.KodaManufacturing?.open?.();
    back.onclick = showList;
    host.addEventListener("click", (event) => {
      if (event.target.closest(".product-edit")) showForm();
      if (event.target.closest("#product-cancel")) setTimeout(showList, 0);
    }, true);
    showList();
  }

  function organizePurchases() {
    const host = $("#view-compras");
    const head = $(".purchase-head", host);
    if (!host || !head) return;
    head.classList.add("catalog-purchase-head");
    const title = $("h2", head);
    if (title) title.textContent = "Compras";
    const subtitle = $("p", head);
    if (subtitle) subtitle.textContent = "Fornecedores, reposições e recebimento de mercadorias.";
  }

  let scheduled = false;
  function run() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      organizeProducts();
      organizePurchases();
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
