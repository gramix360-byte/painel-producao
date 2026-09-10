(() => {
  const $ = (selector, root = document) => root.querySelector(selector);

  function openView(buttonSelector) {
    $(buttonSelector)?.click();
  }

  function organizeQuotes() {
    const host = $("#view-orcamentos");
    const layout = $(".quotes-layout", host);
    if (!host || !layout || host.dataset.salesOrganized === "1") return;
    host.dataset.salesOrganized = "1";

    const header = document.createElement("div");
    header.className = "sales-page-head";
    header.innerHTML = `
      <div>
        <h2>Lista de orçamentos</h2>
        <p>Consulte propostas ou crie um novo orçamento.</p>
      </div>
      <button type="button" class="button primary" data-new-quote>+ Novo orçamento</button>`;
    host.insertBefore(header, layout);

    const form = $("#quote-form", layout);
    const list = $(".quote-list-panel", layout);
    const formHead = $(".section-head", form);
    const back = document.createElement("button");
    back.type = "button";
    back.className = "sales-back";
    back.textContent = "← Voltar para orçamentos";
    form?.insertBefore(back, formHead);

    const showList = () => {
      form?.classList.add("sales-hidden");
      list?.classList.remove("sales-hidden");
      header.classList.remove("sales-hidden");
    };
    const showForm = () => {
      list?.classList.add("sales-hidden");
      header.classList.add("sales-hidden");
      form?.classList.remove("sales-hidden");
      $("#quote-customer")?.focus();
    };
    $("[data-new-quote]", header).onclick = showForm;
    back.onclick = showList;
    showList();
  }

  function organizeOrders() {
    const host = $("#view-pedidos");
    const panel = $(".panel", host);
    if (!host || !panel) return;
    if (!$(".sales-page-head", host)) {
      const header = document.createElement("div");
      header.className = "sales-page-head";
      header.innerHTML = `
        <div>
          <h2>Lista de pedidos</h2>
          <p>Acompanhe vendas, pagamentos e andamento dos pedidos.</p>
        </div>
        <button type="button" class="button primary" data-new-order>+ Novo pedido</button>`;
      host.insertBefore(header, panel);
      $("[data-new-order]", header).onclick = () => openView('.nav-item[data-view="novo"]');
    }
    const rows = [...document.querySelectorAll("#orders-results .order-list-row")];
    rows.forEach((row) => {
      row.classList.add("sales-order-row");
      const number = $(".order-number", row);
      if (number && !number.querySelector("small")) {
        number.insertAdjacentHTML("afterbegin", "<small>Pedido</small>");
      }
    });
  }

  let scheduled = false;
  const run = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      organizeQuotes();
      organizeOrders();
    });
  };
  const observer = new MutationObserver(run);
  const init = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    run();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
