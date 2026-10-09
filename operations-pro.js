(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const date = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "Sem previsão";
  const dateTime = (value) => value ? new Date(value).toLocaleString("pt-BR") : "—";
  const columns = [
    { key: "arte", label: "Criando arte", phases: ["pedido_recebido", "aguardando_arte", "arte_em_criacao"] },
    { key: "aprovacao", label: "Aguardando aprovação", phases: ["aguardando_aprovacao"] },
    { key: "aprovada", label: "Arte aprovada", phases: ["arte_aprovada"] },
    { key: "producao", label: "Em produção", phases: ["em_producao"] },
    { key: "embalado", label: "Embalado", phases: ["embalado"] },
  ];
  let orders = [], loading = false, modalOrder = null, renderTimer, createOptions = null;

  async function headers() {
    const session = await window.PPAuth?.getSession?.();
    if (!session?.access_token) throw new Error("Sessão expirada");
    return { apikey: window.PPAuth.key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  }
  async function request(path, options = {}) {
    const response = await fetch(`${window.PPAuth.url}/rest/v1/${path}`, { ...options, headers: { ...(await headers()), ...(options.headers || {}) } });
    if (!response.ok) throw new Error(await response.text());
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async function patchOrder(id, body) {
    await request(`orders?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) });
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("painel-producao-updates");
      channel.postMessage({ type: "changed" });
      channel.close();
    }
  }
  async function rpc(name, body) {
    return request(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  }

  function ensureToolbar(host) {
    let toolbar = $(".operations-pro-toolbar", host);
    if (toolbar) return toolbar;
    toolbar = document.createElement("div");
    toolbar.className = "operations-pro-toolbar";
    toolbar.innerHTML = `<div><h2>Produção</h2><p>Acompanhe os pedidos e crie tarefas avulsas para a equipe.</p></div><button class="button primary" type="button" data-create-production-card>+ Novo card</button>`;
    const old = $(".production-columns", host);
    (old || host.firstElementChild)?.insertAdjacentElement("beforebegin", toolbar);
    if (!toolbar.parentElement) host.prepend(toolbar);
    const createButton = toolbar.querySelector("[data-create-production-card]");
    createButton.onclick = openCreateCard;
    window.PPRoleAccess?.getProfile?.().then((profile) => {
      if (profile?.role && !["admin", "vendas"].includes(profile.role)) createButton.hidden = true;
    }).catch(() => {});
    return toolbar;
  }

  function actionFor(order) {
    const phase = order.phase || "pedido_recebido";
    if (["pedido_recebido", "aguardando_arte"].includes(phase)) return { label: "Iniciar arte", action: "start-art" };
    if (phase === "arte_em_criacao") return { label: "Enviar prévia", action: "artwork" };
    if (phase === "aguardando_aprovacao") return { label: "Ver aprovação", action: "artwork" };
    if (phase === "arte_aprovada") return { label: "Iniciar produção", action: "start-production" };
    if (phase === "em_producao") return { label: "Conferir e embalar", action: "detail" };
    if (phase === "embalado") return { label: "Ir para expedição", action: "shipping" };
    return { label: "Abrir ficha", action: "detail" };
  }
  function card(order) {
    const action = actionFor(order);
    const late = order.due_date && order.due_date < new Date().toISOString().slice(0, 10) && !["embalado", "expedicao", "entregue"].includes(order.phase);
    const items = (order.order_items || []).slice(0, 2).map((item) => `<small>${Number(item.quantity)}× ${esc(item.product_name)}</small>`).join("");
    const more = (order.order_items || []).length > 2 ? `<small>+ ${(order.order_items || []).length - 2} item(ns)</small>` : "";
    return `<article class="ops-card ${order.priority === "urgente" ? "urgent" : ""} ${late ? "late" : ""}" data-order-id="${esc(order.id)}">
      <div class="ops-card-top"><b>#${esc(order.order_number)}</b><span>${order.priority === "urgente" ? "URGENTE" : "Normal"}</span></div>
      <h3>${esc(order.customer_name)}</h3>
      <div class="ops-card-items">${items}${more}</div>
      <div class="ops-card-dates"><span>Prazo: <b>${date(order.due_date)}</b></span><span>Previsão: <b>${date(order.estimated_completion_date)}</b></span></div>
      ${late ? '<div class="ops-alert">Pedido atrasado</div>' : ""}
      ${order.phase === "em_producao" ? `<div class="ops-quality ${order.quality_status === "aprovado" ? "ok" : ""}">Qualidade: ${esc((order.quality_status || "pendente").replace("_", " "))}</div>` : ""}
      <div class="ops-card-actions"><button class="button secondary" data-ops-action="detail" data-id="${esc(order.id)}">Ficha</button><button class="button primary" data-ops-action="${action.action}" data-id="${esc(order.id)}">${esc(action.label)}</button></div>
    </article>`;
  }
  function renderBoard() {
    const host = $("#view-producao");
    if (!host?.classList.contains("active")) return;
    ensureToolbar(host);
    let board = $(".operations-pro-board", host);
    if (!board) {
      const old = $(".production-columns", host);
      board = document.createElement("div");
      board.className = "operations-pro-board";
      if (old) old.replaceWith(board); else host.appendChild(board);
    }
    board.innerHTML = columns.map((column) => {
      const rows = orders.filter((order) => column.phases.includes(order.phase || "pedido_recebido"));
      return `<section class="ops-column" data-column="${column.key}"><header><h3>${column.label}</h3><strong>${rows.length}</strong></header><div class="ops-column-list">${rows.length ? rows.map(card).join("") : '<div class="ops-empty">Nenhum pedido</div>'}</div></section>`;
    }).join("");
    board.onclick = handleBoardClick;
  }

  async function loadCreateOptions() {
    if (createOptions) return createOptions;
    const [customers, products] = await Promise.all([
      request("customers?select=id,name&active=eq.true&deleted_at=is.null&order=name.asc&limit=500"),
      request("products?select=id,name,sku,sale_price,cost_price&active=eq.true&deleted_at=is.null&order=name.asc&limit=500"),
    ]);
    createOptions = { customers, products };
    return createOptions;
  }
  function ensureCreateModal() {
    let backdrop = $("#ops-create-card-modal");
    if (backdrop) return backdrop;
    backdrop = document.createElement("div");
    backdrop.id = "ops-create-card-modal";
    backdrop.className = "ops-modal-backdrop ops-create-backdrop";
    backdrop.innerHTML = '<div class="ops-modal ops-create-modal"><div id="ops-create-card-body"></div></div>';
    backdrop.onclick = (event) => { if (event.target === backdrop || event.target.closest("[data-create-close]")) backdrop.classList.remove("open"); };
    document.body.appendChild(backdrop);
    return backdrop;
  }
  async function openCreateCard() {
    const backdrop = ensureCreateModal(), body = $("#ops-create-card-body", backdrop);
    backdrop.classList.add("open");
    body.innerHTML = '<div class="ops-modal-loading">Preparando novo card...</div>';
    try {
      const { customers, products } = await loadCreateOptions();
      body.innerHTML = `<button data-create-close class="ops-close" aria-label="Fechar">×</button>
        <div class="ops-modal-head"><div><small>Produção</small><h2>Novo card</h2><p>Crie uma tarefa de produção mesmo sem passar pelo orçamento.</p></div></div>
        <form id="ops-create-card-form" class="ops-create-form">
          <label class="ops-field ops-span-2"><span>Cliente *</span><input name="customer_name" list="ops-customer-list" required maxlength="160" placeholder="Nome do cliente"><datalist id="ops-customer-list">${customers.map((c) => `<option value="${esc(c.name)}"></option>`).join("")}</datalist></label>
          <label class="ops-field ops-span-2"><span>Produto ou serviço *</span><input name="product_name" list="ops-product-list" required maxlength="240" placeholder="Ex.: 100 chaveiros personalizados"><datalist id="ops-product-list">${products.map((p) => `<option value="${esc(p.name)}">${esc(p.sku || "")}</option>`).join("")}</datalist></label>
          <label class="ops-field"><span>Quantidade *</span><input name="quantity" type="number" min="1" step="1" value="1" required></label>
          <label class="ops-field"><span>Preço unitário</span><input name="unit_price" type="number" min="0" step="0.01" value="0"></label>
          <label class="ops-field"><span>Prazo</span><input name="due_date" type="date"></label>
          <label class="ops-field"><span>Prioridade</span><select name="priority"><option value="normal">Normal</option><option value="urgente">Urgente</option></select></label>
          <label class="ops-field ops-span-2"><span>Etapa inicial</span><select name="phase"><option value="arte_em_criacao">Criando arte</option><option value="aguardando_aprovacao">Aguardando aprovação</option><option value="arte_aprovada">Arte aprovada</option><option value="em_producao">Em produção</option></select></label>
          <label class="ops-field ops-span-2"><span>Personalização</span><input name="personalization" maxlength="500" placeholder="Ex.: Logo branca gravada a laser"></label>
          <label class="ops-field ops-span-2"><span>Observações</span><textarea name="notes" rows="3" maxlength="2000" placeholder="Informações importantes para a equipe"></textarea></label>
          <div class="ops-create-actions ops-span-2"><button class="button secondary" type="button" data-create-close>Cancelar</button><button class="button primary" type="submit">Criar card</button></div>
        </form>`;
      const form = $("#ops-create-card-form", body);
      const productInput = form.elements.product_name;
      productInput.addEventListener("change", () => {
        const product = products.find((item) => item.name.trim().toLowerCase() === productInput.value.trim().toLowerCase());
        if (product && !Number(form.elements.unit_price.value)) form.elements.unit_price.value = Number(product.sale_price || 0).toFixed(2);
      });
      form.onsubmit = (event) => createCard(event, products, backdrop);
      form.elements.customer_name.focus();
    } catch (error) {
      console.error(error);
      body.innerHTML = `<button data-create-close class="ops-close">×</button><div class="ops-load-error">Não foi possível preparar o cadastro do card.</div>`;
    }
  }
  async function createCard(event, products, backdrop) {
    event.preventDefault();
    const form = event.currentTarget, submit = form.querySelector('[type="submit"]');
    const values = Object.fromEntries(new FormData(form).entries());
    const quantity = Number(values.quantity), unitPrice = Number(values.unit_price || 0);
    if (!values.customer_name.trim() || !values.product_name.trim() || !Number.isInteger(quantity) || quantity < 1 || unitPrice < 0) return alert("Preencha cliente, produto e quantidade corretamente.");
    const product = products.find((item) => item.name.trim().toLowerCase() === values.product_name.trim().toLowerCase());
    const phase = values.phase || "arte_em_criacao";
    submit.disabled = true;
    submit.textContent = "Criando...";
    let createdOrder = null;
    try {
      const orderNumber = await rpc("next_order_number", {});
      const orderRows = await request("orders", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          order_number: orderNumber,
          customer_name: values.customer_name.trim(),
          due_date: values.due_date || null,
          priority: values.priority || "normal",
          notes: values.notes.trim(),
          status: phase === "em_producao" ? "em_producao" : "aguardando",
          phase,
          artwork_status: phase === "aguardando_aprovacao" ? "pending" : phase === "arte_aprovada" || phase === "em_producao" ? "approved" : "not_sent",
          started_at: phase === "em_producao" ? new Date().toISOString() : null,
          total_amount: quantity * unitPrice,
          sales_channel: "venda_externa",
          payment_status: "pendente",
          payment_plan: "split_50_50",
        }),
      });
      createdOrder = orderRows?.[0];
      if (!createdOrder?.id) throw new Error("O pedido não foi criado.");
      const unitCost = Number(product?.cost_price || 0);
      await request("order_items", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          order_id: createdOrder.id,
          product_id: product?.id || null,
          product_name: values.product_name.trim(),
          quantity,
          personalization: values.personalization.trim(),
          unit_price: unitPrice,
          line_total: quantity * unitPrice,
          unit_cost: unitCost,
          cost_subtotal: quantity * unitCost,
        }),
      });
      backdrop.classList.remove("open");
      await load();
      window.KodaAlerts?.refresh?.();
      window.KodaNotifications?.refresh?.();
      alert(`Card do pedido #${orderNumber} criado com sucesso.`);
    } catch (error) {
      console.error(error);
      if (createdOrder?.id) request(`orders?id=eq.${encodeURIComponent(createdOrder.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(console.warn);
      alert(`Não foi possível criar o card.\n${error.message || ""}`);
    } finally {
      submit.disabled = false;
      submit.textContent = "Criar card";
    }
  }
  async function load() {
    if (loading) return;
    const host = $("#view-producao");
    if (!host?.classList.contains("active")) return;
    loading = true;
    try {
      orders = await request("orders?select=id,order_number,customer_name,due_date,priority,notes,status,phase,artwork_status,shipping_status,payment_status,payment_method,amount_paid,total_amount,total_cost,net_profit,net_margin,quality_status,estimated_completion_date,public_tracking_token,created_at,started_at,finished_at,order_items(id,quantity,product_name,personalization,product_id,unit_price,line_total,unit_cost,cost_subtotal)&deleted_at=is.null&phase=in.(pedido_recebido,aguardando_arte,arte_em_criacao,aguardando_aprovacao,arte_aprovada,em_producao,embalado)&order=due_date.asc.nullslast,created_at.asc");
      orders.sort((a, b) => a.priority !== b.priority ? (a.priority === "urgente" ? -1 : 1) : 0);
      renderBoard();
    } catch (error) {
      console.error("Operações", error);
      const board = $(".operations-pro-board", host);
      if (board) board.innerHTML = '<div class="ops-load-error">Não foi possível carregar o quadro. Atualize a página e tente novamente.</div>';
    } finally { loading = false; }
  }

  async function handleBoardClick(event) {
    const button = event.target.closest("[data-ops-action]");
    if (!button) return;
    const order = orders.find((row) => row.id === button.dataset.id);
    if (!order) return;
    button.disabled = true;
    try {
      if (button.dataset.opsAction === "detail") return await openDetail(order.id);
      if (button.dataset.opsAction === "artwork") return window.KodaArtworkApproval?.open?.(order.order_number);
      if (button.dataset.opsAction === "shipping") return $("#shipping-nav")?.click();
      if (button.dataset.opsAction === "start-art") await patchOrder(order.id, { phase: "arte_em_criacao", status: "aguardando" });
      if (button.dataset.opsAction === "start-production") await patchOrder(order.id, { phase: "em_producao", status: "em_producao", started_at: new Date().toISOString() });
      await load();
    } catch (error) {
      console.error(error);
      alert(`Não foi possível concluir esta ação.\n${error.message || ""}`);
    } finally { button.disabled = false; }
  }

  async function detailData(orderId) {
    const [checks, consumptions, timeline] = await Promise.all([
      request(`order_quality_checks?select=*&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc`),
      request(`material_consumptions?select=id,quantity,unit_cost,material_id,materials(name,unit,stock)&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc`),
      request(`order_timeline?select=id,event_type,title,details,created_at&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.desc&limit=40`),
    ]);
    return { checks, consumptions, timeline };
  }
  function ensureModal() {
    let backdrop = $("#operations-pro-modal");
    if (backdrop) return backdrop;
    backdrop = document.createElement("div");
    backdrop.id = "operations-pro-modal";
    backdrop.className = "ops-modal-backdrop";
    backdrop.innerHTML = '<div class="ops-modal"><div id="ops-modal-body"></div></div>';
    backdrop.onclick = (event) => { if (event.target === backdrop || event.target.closest("[data-ops-close]")) closeDetail(); };
    document.body.appendChild(backdrop);
    return backdrop;
  }
  function closeDetail() { $("#operations-pro-modal")?.classList.remove("open"); modalOrder = null; }
  async function openDetail(orderId) {
    const order = orders.find((row) => row.id === orderId) || (await request(`orders?select=*,order_items(*)&id=eq.${encodeURIComponent(orderId)}&limit=1`))[0];
    if (!order) return;
    modalOrder = order;
    const backdrop = ensureModal(), body = $("#ops-modal-body", backdrop);
    backdrop.classList.add("open");
    body.innerHTML = '<div class="ops-modal-loading">Carregando ficha completa...</div>';
    try {
      const data = await detailData(order.id);
      renderDetail(order, data, body);
    } catch (error) {
      console.error(error);
      body.innerHTML = `<button data-ops-close class="ops-close">×</button><div class="ops-load-error">Não foi possível carregar a ficha completa.</div>`;
    }
  }
  function renderDetail(order, data, body) {
    const completed = data.checks.filter((check) => check.completed).length;
    const qualityApproved = data.checks.length > 0 && completed === data.checks.length;
    const materials = data.consumptions.length ? data.consumptions.map((item) => {
      const material = Array.isArray(item.materials) ? item.materials[0] : item.materials;
      return `<tr><td>${esc(material?.name || "Material")}</td><td>${Number(item.quantity).toLocaleString("pt-BR")} ${esc(material?.unit || "un")}</td><td>${money(Number(item.quantity) * Number(item.unit_cost))}</td><td><span class="ops-reserved">Reservado</span></td></tr>`;
    }).join("") : '<tr><td colspan="4">Este produto não possui materiais vinculados.</td></tr>';
    const trackingUrl = `${location.origin}${location.pathname.replace(/index\.html$/, "").replace(/\/$/, "")}/acompanhar-pedido.html?token=${order.public_tracking_token}`;
    body.innerHTML = `<button data-ops-close class="ops-close" aria-label="Fechar">×</button>
      <div class="ops-modal-head"><div><small>Ficha operacional completa</small><h2>Pedido #${esc(order.order_number)}</h2><p>${esc(order.customer_name)}</p></div><span class="ops-phase-pill">${esc(columns.find((c) => c.phases.includes(order.phase))?.label || order.phase)}</span></div>
      <div class="ops-summary-grid">
        <div><small>Prazo do cliente</small><b>${date(order.due_date)}</b></div><div><small>Previsão calculada</small><b>${date(order.estimated_completion_date)}</b></div>
        <div><small>Pagamento</small><b>${esc((order.payment_status || "pendente").replace("_", " "))}</b></div><div><small>Qualidade</small><b>${qualityApproved ? "Aprovada" : `${completed}/${data.checks.length} itens`}</b></div>
      </div>
      <section class="ops-detail-section"><h3>Itens e personalização</h3><div class="ops-detail-items">${(order.order_items || []).map((item) => `<div><b>${Number(item.quantity)}× ${esc(item.product_name)}</b><span>${esc(item.personalization || "Sem personalização informada")}</span><small>${money(item.line_total)} · custo ${money(item.cost_subtotal)}</small></div>`).join("")}</div></section>
      <section class="ops-detail-section"><h3>Materiais reservados</h3><div class="ops-table-wrap"><table><thead><tr><th>Material</th><th>Quantidade</th><th>Custo</th><th>Status</th></tr></thead><tbody>${materials}</tbody></table></div></section>
      <section class="ops-detail-section"><div class="ops-section-title"><div><h3>Controle de qualidade</h3><small>Todos os itens devem ser conferidos antes de embalar.</small></div><strong>${completed}/${data.checks.length}</strong></div><div class="ops-checks">${data.checks.map((check) => `<label class="${check.completed ? "completed" : ""}"><input type="checkbox" data-quality-key="${esc(check.check_key)}" ${check.completed ? "checked" : ""}><span><b>${esc(check.label)}</b><small>${check.completed ? `Conferido em ${dateTime(check.completed_at)}` : "Aguardando conferência"}</small></span></label>`).join("")}</div>${order.phase === "em_producao" ? `<button class="button primary ops-pack" data-pack-order ${qualityApproved ? "" : "disabled"}>Embalar e enviar para expedição</button>` : ""}</section>
      <section class="ops-detail-section"><h3>Resultado financeiro</h3><div class="ops-finance-row"><span>Venda <b>${money(order.total_amount)}</b></span><span>Custo <b>${money(order.total_cost)}</b></span><span>Lucro líquido <b>${money(order.net_profit)}</b></span><span>Margem <b>${Number(order.net_margin || 0).toFixed(1)}%</b></span></div></section>
      <section class="ops-detail-section"><div class="ops-section-title"><div><h3>Acompanhamento do cliente</h3><small>Link seguro para o cliente acompanhar sem entrar no sistema.</small></div></div><div class="ops-share"><input readonly value="${esc(trackingUrl)}"><button class="button secondary" data-copy-tracking>Copiar link</button></div></section>
      <section class="ops-detail-section"><h3>Histórico do pedido</h3><div class="ops-timeline">${data.timeline.map((event) => `<div><i></i><span><b>${esc(event.title)}</b><small>${dateTime(event.created_at)}</small></span></div>`).join("") || "<small>O histórico começará a aparecer conforme o pedido avançar.</small>"}</div></section>
      <div class="ops-modal-actions"><button class="button secondary" data-print-order>Imprimir ficha</button><button class="button secondary" data-open-artwork>Arte e aprovação</button><button class="button primary" data-ops-close>Fechar</button></div>`;
    body.querySelectorAll("[data-quality-key]").forEach((input) => input.onchange = () => setQuality(order, input.dataset.qualityKey, input.checked));
    $("[data-pack-order]", body)?.addEventListener("click", () => pack(order));
    $("[data-copy-tracking]", body)?.addEventListener("click", async () => { await navigator.clipboard.writeText(trackingUrl); alert("Link de acompanhamento copiado."); });
    $("[data-print-order]", body)?.addEventListener("click", () => window.open(`./ficha.html?pedido=${encodeURIComponent(order.order_number)}`, "_blank"));
    $("[data-open-artwork]", body)?.addEventListener("click", () => window.KodaArtworkApproval?.open?.(order.order_number));
  }
  async function setQuality(order, key, completed) {
    try {
      await rpc("koda_set_quality_check", { p_order_id: order.id, p_check_key: key, p_completed: completed, p_note: null });
      await load();
      await openDetail(order.id);
    } catch (error) { console.error(error); alert(`Não foi possível salvar a conferência.\n${error.message || ""}`); }
  }
  async function pack(order) {
    try {
      await rpc("koda_pack_order", { p_order_id: order.id });
      closeDetail();
      await load();
      window.PPInventory?.adjust?.(order.id, true).catch(console.warn);
      alert("Pedido conferido e embalado. Ele já está disponível na Expedição.");
    } catch (error) { console.error(error); alert(`Não foi possível embalar o pedido.\n${error.message || ""}`); }
  }

  function schedule() { clearTimeout(renderTimer); renderTimer = setTimeout(load, 250); }
  document.addEventListener("click", (event) => { if (event.target.closest('.nav-item[data-view="producao"]')) schedule(); }, true);
  document.addEventListener("DOMContentLoaded", () => {
    const host = $("#view-producao");
    if (host) new MutationObserver(() => { if (host.classList.contains("active") && !$(".operations-pro-board", host)) schedule(); }).observe(host, { childList: true });
    setInterval(() => { if ($("#view-producao")?.classList.contains("active")) load(); }, 15000);
  });
  window.KodaOperationsPro = { refresh: load, open: openDetail };
})();
