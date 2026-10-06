(() => {
  let products = [], suppliers = [], items = [], attachments = [], search = "", filter = "todos";
  const $ = (s) => document.querySelector(s);
  const esc = (v = "") => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmt = (v) => Number(v || 0).toLocaleString("pt-BR");
  const date = (v) => v ? new Date(String(v).length === 10 ? v + "T12:00:00" : v).toLocaleDateString("pt-BR") : "—";
  async function headers(json = true) {
    const session = await PPAuth.getSession();
    return { apikey: PPAuth.key, Authorization: `Bearer ${session.access_token}`, ...(json ? { "Content-Type": "application/json" } : {}) };
  }
  async function api(path, options = {}) {
    const response = await fetch(`${PPAuth.url}${path}`, { ...options, headers: { ...(await headers(!options.raw)), ...(options.headers || {}) } });
    if (!response.ok) throw new Error((await response.text()) || "Não foi possível concluir.");
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const rpc = (name, body) => api(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  const suggested = (p) => Math.max(1, Math.ceil(Number(p.low_stock_threshold || 0) * 2 - Number(p.stock || 0)));
  function closeDialog() { $(".purchase-modal-backdrop")?.remove(); }
  function openDialog({ title, subtitle = "", content, save = "Salvar", wide = false, onSave }) {
    closeDialog();
    const backdrop = document.createElement("div");
    backdrop.className = "purchase-modal-backdrop";
    backdrop.innerHTML = `<form class="purchase-modal ${wide ? "purchase-modal-wide" : ""}"><div class="purchase-modal-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button type="button" class="purchase-modal-close">×</button></div><div class="purchase-modal-body">${content}</div><div class="purchase-modal-actions"><button type="button" class="button secondary purchase-modal-cancel">Cancelar</button><button class="button primary purchase-modal-save">${esc(save)}</button></div></form>`;
    document.body.appendChild(backdrop);
    const form = backdrop.querySelector("form");
    backdrop.querySelectorAll(".purchase-modal-close,.purchase-modal-cancel").forEach((button) => button.onclick = closeDialog);
    backdrop.onclick = (event) => { if (event.target === backdrop) closeDialog(); };
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector(".purchase-modal-save");
      button.disabled = true; button.textContent = "Salvando...";
      try { if (await onSave(new FormData(form), form) !== false) closeDialog(); }
      catch (error) { console.error(error); alert(error.message || "Não foi possível concluir."); }
      finally { if (document.body.contains(button)) { button.disabled = false; button.textContent = save; } }
    };
    return form;
  }
  async function load() {
    const h = await headers();
    const responses = await Promise.all([
      fetch(`${PPAuth.url}/rest/v1/products?select=id,name,sku,stock,cost_price,low_stock_threshold&deleted_at=is.null&active=eq.true&order=name.asc`, { headers: h }),
      fetch(`${PPAuth.url}/rest/v1/suppliers?select=*&active=eq.true&order=name.asc`, { headers: h }),
      fetch(`${PPAuth.url}/rest/v1/purchases?select=*&deleted_at=is.null&order=created_at.desc`, { headers: h }),
      fetch(`${PPAuth.url}/rest/v1/purchase_attachments?select=*&deleted_at=is.null&order=created_at.desc`, { headers: h })
    ]);
    for (const response of responses) if (!response.ok) throw new Error(await response.text());
    [products, suppliers, items, attachments] = await Promise.all(responses.map((response) => response.json()));
    render();
  }
  function purchaseGroups() {
    const map = new Map();
    items.forEach((item) => {
      const id = item.purchase_group_id || item.id;
      if (!map.has(id)) map.set(id, { id, number: item.purchase_number || "COMPRA", supplier_name: item.supplier_name, supplier_id: item.supplier_id, due_date: item.due_date, payment_method: item.payment_method, finance_id: item.finance_id, created_at: item.created_at, items: [] });
      map.get(id).items.push(item);
    });
    return [...map.values()].map((group) => {
      group.total = group.items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
      group.status = group.items.every((item) => item.status === "cancelado") ? "cancelado" : group.items.every((item) => item.status === "recebido") ? "recebido" : group.items.some((item) => Number(item.received_quantity) > 0) ? "parcial" : "aguardando";
      return group;
    });
  }
  async function addSupplier() {
    openDialog({ title: "Novo fornecedor", save: "Cadastrar", content: `<div class="purchase-form-grid"><label class="purchase-field purchase-span-2"><span>Nome *</span><input name="name" required autofocus></label><label class="purchase-field purchase-span-2"><span>Contato</span><input name="contact"></label></div>`, onSave: async (data) => {
      await api("/rest/v1/suppliers", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ name: String(data.get("name")).trim(), contact: String(data.get("contact") || "").trim() || null, active: true }) });
      await load();
    } });
  }
  function itemRow(product = {}) {
    const selected = products.find((item) => item.id === product.id);
    return `<div class="purchase-order-item"><label class="purchase-field"><span>Produto *</span><select name="product_id" required><option value="">Selecione</option>${products.map((item) => `<option value="${item.id}" ${item.id === product.id ? "selected" : ""}>${esc(item.name)}${item.sku ? ` · ${esc(item.sku)}` : ""}</option>`).join("")}</select></label><label class="purchase-field"><span>Quantidade *</span><input name="quantity" type="number" min="0.01" step="0.01" value="${selected ? suggested(selected) : 1}" required></label><label class="purchase-field"><span>Custo unitário *</span><input name="unit_cost" type="number" min="0" step="0.01" value="${Number(selected?.cost_price || 0).toFixed(2)}" required></label><div class="purchase-line-total"><small>Subtotal</small><b>${money((selected ? suggested(selected) : 1) * Number(selected?.cost_price || 0))}</b></div><button type="button" class="purchase-remove-line">×</button></div>`;
  }
  async function addPurchase(productId = "") {
    if (!suppliers.length) return alert("Cadastre um fornecedor primeiro.");
    const chosen = products.find((p) => p.id === productId);
    const form = openDialog({
      title: "Novo pedido de compra", subtitle: "Adicione vários produtos do mesmo fornecedor. Será criada uma única conta a pagar.", wide: true, save: "Criar pedido",
      content: `<div class="purchase-form-grid"><label class="purchase-field"><span>Fornecedor *</span><select name="supplier_id" required><option value="">Selecione</option>${suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label><label class="purchase-field"><span>Previsão de pagamento</span><input name="due_date" type="date"></label><label class="purchase-field"><span>Forma de pagamento</span><select name="payment_method"><option value="">Selecione</option>${["PIX", "Boleto", "Cartão de crédito", "Cartão de débito", "Transferência", "Dinheiro", "Outro"].map((x) => `<option>${x}</option>`).join("")}</select></label></div><div class="purchase-items-head"><h3>Produtos</h3><button type="button" class="button secondary" data-add-line>+ Adicionar produto</button></div><div data-lines>${itemRow(chosen || {})}</div><div class="purchase-total"><span>Total do pedido</span><strong data-grand-total>${money(0)}</strong></div>`,
      onSave: async (_, currentForm) => {
        const supplier = suppliers.find((s) => s.id === currentForm.elements.supplier_id.value);
        const list = [...currentForm.querySelectorAll(".purchase-order-item")].map((row) => ({ product_id: row.querySelector("[name=product_id]").value, quantity: Number(row.querySelector("[name=quantity]").value), unit_cost: Number(row.querySelector("[name=unit_cost]").value) }));
        if (!supplier || !list.length || list.some((x) => !x.product_id || x.quantity <= 0 || x.unit_cost < 0)) throw new Error("Confira fornecedor, produtos, quantidades e custos.");
        await rpc("create_purchase_order_v2", { p_supplier_id: supplier.id, p_supplier_name: supplier.name, p_due_date: currentForm.elements.due_date.value || null, p_payment_method: currentForm.elements.payment_method.value || null, p_items: list });
        PPFinance?.refresh?.(); KodaAlerts?.refresh?.(); await load(); alert("Pedido criado e conta a pagar gerada.");
      }
    });
    const lines = form.querySelector("[data-lines]");
    const recalc = () => {
      let total = 0;
      lines.querySelectorAll(".purchase-order-item").forEach((row) => { const value = Number(row.querySelector("[name=quantity]").value || 0) * Number(row.querySelector("[name=unit_cost]").value || 0); row.querySelector(".purchase-line-total b").textContent = money(value); total += value; });
      form.querySelector("[data-grand-total]").textContent = money(total);
    };
    const bind = (row) => {
      const select = row.querySelector("[name=product_id]"), qty = row.querySelector("[name=quantity]"), cost = row.querySelector("[name=unit_cost]");
      select.onchange = () => { const p = products.find((item) => item.id === select.value); if (p) { qty.value = suggested(p); cost.value = Number(p.cost_price || 0).toFixed(2); } recalc(); };
      qty.oninput = cost.oninput = recalc;
      row.querySelector(".purchase-remove-line").onclick = () => { if (lines.children.length > 1) row.remove(); recalc(); };
    };
    [...lines.children].forEach(bind);
    form.querySelector("[data-add-line]").onclick = () => { lines.insertAdjacentHTML("beforeend", itemRow()); bind(lines.lastElementChild); recalc(); };
    recalc();
  }
  async function receive(group) {
    const pending = group.items.filter((item) => item.status !== "cancelado" && Number(item.received_quantity) < Number(item.quantity));
    if (!pending.length) return alert("Este pedido já foi recebido.");
    openDialog({ title: `Receber ${group.number}`, subtitle: "Informe somente o que chegou agora. O restante continuará pendente.", wide: true, save: "Confirmar recebimento", content: `<div class="purchase-receive-list">${pending.map((item) => { const remaining = Number(item.quantity) - Number(item.received_quantity); return `<label><div><b>${esc(item.product_name)}</b><small>Pedido ${fmt(item.quantity)} · recebido ${fmt(item.received_quantity)} · falta ${fmt(remaining)}</small></div><input name="receive_${item.id}" type="number" min="0" max="${remaining}" step="0.01" value="${remaining}"></label>`; }).join("")}</div>`, onSave: async (_, form) => {
      const receipts = pending.map((item) => ({ purchase_id: item.id, quantity: Number(form.elements[`receive_${item.id}`].value || 0) })).filter((x) => x.quantity > 0);
      if (!receipts.length) throw new Error("Informe ao menos uma quantidade recebida.");
      await rpc("receive_purchase_order_v2", { p_purchase_group_id: group.id, p_receipts: receipts });
      PPProducts?.refresh?.(); KodaSmartInventory?.refresh?.(); KodaAlerts?.refresh?.(); await load(); alert("Estoque atualizado com segurança.");
    } });
  }
  async function cancel(group) {
    if (!confirm(`Cancelar o pedido ${group.number}?`)) return;
    try { await rpc("cancel_purchase_order_v2", { p_purchase_group_id: group.id }); PPFinance?.refresh?.(); await load(); } catch (error) { alert(error.message); }
  }
  async function remove(group) {
    if (!confirm(`Excluir ${group.number} da lista? O histórico ficará preservado.`)) return;
    const now = new Date().toISOString();
    await api(`/rest/v1/purchases?purchase_group_id=eq.${encodeURIComponent(group.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ deleted_at: now, updated_at: now }) });
    await load();
  }
  async function openAttachment(file) {
    const session = await PPAuth.getSession();
    const response = await fetch(`${PPAuth.url}/storage/v1/object/authenticated/purchase-documents/${file.storage_path}`, { headers: { apikey: PPAuth.key, Authorization: `Bearer ${session.access_token}` } });
    if (!response.ok) return alert("Não foi possível abrir o arquivo.");
    const url = URL.createObjectURL(await response.blob()); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function files(group) {
    const list = attachments.filter((file) => file.purchase_group_id === group.id);
    const form = openDialog({ title: `Anexos · ${group.number}`, subtitle: "Nota fiscal, comprovante, orçamento ou foto da mercadoria.", wide: true, save: "Enviar arquivo", content: `<label class="purchase-upload"><span>Selecionar PDF ou imagem</span><input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required></label><div class="purchase-attachment-list">${list.length ? list.map((file) => `<div><span>📎 ${esc(file.file_name)}</span><div><button type="button" data-open="${file.id}" class="button secondary">Abrir</button><button type="button" data-remove-file="${file.id}" class="button danger">Excluir</button></div></div>`).join("") : "<p>Nenhum arquivo anexado.</p>"}</div>`, onSave: async (_, currentForm) => {
      const file = currentForm.elements.file.files[0]; if (!file) return false; if (file.size > 15728640) throw new Error("O arquivo deve ter no máximo 15 MB.");
      const session = await PPAuth.getSession(), safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_"), path = `${group.id}/${crypto.randomUUID()}-${safe}`;
      const response = await fetch(`${PPAuth.url}/storage/v1/object/purchase-documents/${path}`, { method: "POST", headers: { apikey: PPAuth.key, Authorization: `Bearer ${session.access_token}`, "Content-Type": file.type, "x-upsert": "false" }, body: file });
      if (!response.ok) throw new Error(await response.text());
      await api("/rest/v1/purchase_attachments", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ purchase_group_id: group.id, file_name: file.name, storage_path: path, mime_type: file.type, file_size: file.size }) });
      await load(); alert("Arquivo anexado.");
    } });
    form.querySelectorAll("[data-open]").forEach((button) => button.onclick = () => openAttachment(list.find((file) => file.id === button.dataset.open)));
    form.querySelectorAll("[data-remove-file]").forEach((button) => button.onclick = async () => {
      const file = list.find((x) => x.id === button.dataset.removeFile); if (!file || !confirm(`Excluir ${file.file_name}?`)) return;
      const session = await PPAuth.getSession();
      await fetch(`${PPAuth.url}/storage/v1/object/purchase-documents/${file.storage_path}`, { method: "DELETE", headers: { apikey: PPAuth.key, Authorization: `Bearer ${session.access_token}` } });
      await api(`/rest/v1/purchase_attachments?id=eq.${file.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ deleted_at: new Date().toISOString() }) });
      closeDialog(); await load(); files(group);
    });
  }
  function state(group) {
    if (["recebido", "parcial", "cancelado"].includes(group.status)) return group.status;
    if (group.due_date && new Date(group.due_date + "T23:59:59") < new Date()) return "atrasado";
    return "aguardando";
  }
  function render() {
    const host = $("#view-compras"); if (!host) return;
    const groups = purchaseGroups(), open = groups.filter((g) => ["aguardando", "parcial"].includes(g.status)), low = products.filter((p) => Number(p.stock) <= Number(p.low_stock_threshold || 0)), q = search.toLowerCase();
    const productRows = products.filter((p) => !q || `${p.name} ${p.sku || ""}`.toLowerCase().includes(q));
    const groupRows = groups.filter((g) => (filter === "todos" || state(g) === filter) && (!q || `${g.number} ${g.supplier_name} ${g.items.map((x) => x.product_name).join(" ")}`.toLowerCase().includes(q)));
    host.innerHTML = `<div class="purchase-page"><header class="purchase-head purchase-hero"><div><span class="purchase-eyebrow">BRINDE ON</span><h2>Gestão de Compras</h2><p>Reposição, recebimento, anexos e financeiro em um só fluxo.</p></div><div><button class="button secondary" id="new-supplier">+ Fornecedor</button><button class="button primary" id="new-purchase">+ Pedido de compra</button></div></header><div class="purchase-kpis"><div><small>Fornecedores ativos</small><strong>${suppliers.length}</strong></div><div><small>Compras abertas</small><strong>${open.length}</strong></div><div><small>Estoque baixo</small><strong class="${low.length ? "purchase-danger" : ""}">${low.length}</strong></div><div><small>Mercadoria a receber</small><strong>${money(open.reduce((sum, g) => sum + g.total, 0))}</strong></div></div>
    ${low.length ? `<section class="purchase-panel purchase-alert"><div class="purchase-panel-head"><div><h3>Reposição inteligente</h3><p>Produtos abaixo do mínimo e quantidade sugerida para reposição.</p></div><span>${low.length}</span></div><div class="purchase-product-table">${low.map((p) => `<article class="purchase-product-row"><div><b>${esc(p.name)}</b><small>${esc(p.sku || "Sem SKU")}</small></div><span>Estoque ${fmt(p.stock)} / mínimo ${fmt(p.low_stock_threshold)}</span><strong>Sugestão: ${fmt(suggested(p))}</strong><button class="button primary" data-request="${p.id}">Comprar</button></article>`).join("")}</div></section>` : ""}
    <section class="purchase-panel"><div class="purchase-panel-head"><div><h3>Produtos para compra</h3><p>Escolha um produto ou monte um pedido com vários itens.</p></div><span>${productRows.length}</span></div><div class="purchase-toolbar"><input id="purchase-search" value="${esc(search)}" placeholder="Buscar produto, pedido ou fornecedor"><select id="purchase-filter"><option value="todos">Todas as compras</option>${["aguardando", "parcial", "atrasado", "recebido", "cancelado"].map((x) => `<option value="${x}" ${filter === x ? "selected" : ""}>${({ aguardando: "Aguardando", parcial: "Recebimento parcial", atrasado: "Atrasadas", recebido: "Recebidas", cancelado: "Canceladas" })[x]}</option>`).join("")}</select></div><div class="purchase-product-table">${productRows.slice(0, 12).map((p) => `<article class="purchase-product-row"><div><b>${esc(p.name)}</b><small>${esc(p.sku || "Sem SKU")}</small></div><span>Estoque ${fmt(p.stock)}</span><strong>${money(p.cost_price)}</strong><button class="button secondary" data-request="${p.id}">Solicitar</button></article>`).join("")}</div></section>
    <section class="purchase-panel"><div class="purchase-panel-head"><div><h3>Pedidos de compra</h3><p>Vários produtos, uma conta a pagar e recebimento parcial.</p></div><span>${groupRows.length}</span></div>${groupRows.length ? groupRows.map((g) => { const st = state(g), docs = attachments.filter((a) => a.purchase_group_id === g.id).length; return `<article class="purchase-group-card"><div class="purchase-group-head"><div><b>${esc(g.number)}</b><small>${esc(g.supplier_name)} · criado ${date(g.created_at)}</small></div><div><strong>${money(g.total)}</strong><span class="${st}">${({ aguardando: "Aguardando", parcial: "Parcial", atrasado: "Atrasado", recebido: "Recebido", cancelado: "Cancelado" })[st]}</span></div></div><div class="purchase-group-items">${g.items.map((item) => `<div><span>${esc(item.product_name)}</span><small>${fmt(item.received_quantity)} de ${fmt(item.quantity)} recebido(s)</small><b>${money(item.total_amount)}</b></div>`).join("")}</div><div class="purchase-actions">${["aguardando", "parcial"].includes(g.status) ? `<button class="button primary" data-receive="${g.id}">Receber</button>` : ""}<button class="button secondary" data-files="${g.id}">Anexos${docs ? ` (${docs})` : ""}</button>${g.status === "aguardando" ? `<button class="button secondary" data-cancel="${g.id}">Cancelar</button>` : ""}<button class="button danger" data-delete="${g.id}">Excluir</button></div></article>`; }).join("") : '<div class="purchase-empty">Nenhum pedido de compra encontrado.</div>'}</section></div>`;
    $("#new-supplier").onclick = addSupplier; $("#new-purchase").onclick = () => addPurchase();
    $("#purchase-search").oninput = (event) => { search = event.target.value; render(); const input = $("#purchase-search"); input.focus(); input.setSelectionRange(search.length, search.length); };
    $("#purchase-filter").onchange = (event) => { filter = event.target.value; render(); };
    host.querySelectorAll("[data-request]").forEach((button) => button.onclick = () => addPurchase(button.dataset.request));
    host.querySelectorAll("[data-receive]").forEach((button) => button.onclick = () => receive(groups.find((g) => g.id === button.dataset.receive)));
    host.querySelectorAll("[data-files]").forEach((button) => button.onclick = () => files(groups.find((g) => g.id === button.dataset.files)));
    host.querySelectorAll("[data-cancel]").forEach((button) => button.onclick = () => cancel(groups.find((g) => g.id === button.dataset.cancel)));
    host.querySelectorAll("[data-delete]").forEach((button) => button.onclick = () => remove(groups.find((g) => g.id === button.dataset.delete)));
  }
  async function open() {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active")); $("#view-compras")?.classList.add("active");
    document.querySelectorAll("#nav button").forEach((b) => b.classList.remove("active")); $("#purchases-nav")?.classList.add("active");
    $("#page-title").textContent = "Compras"; $("#page-subtitle").textContent = "Fornecedores, pedidos, recebimentos e contas a pagar";
    try { await load(); } catch (error) { console.error(error); alert("Não foi possível carregar Compras."); }
  }
  document.addEventListener("DOMContentLoaded", () => $("#purchases-nav")?.addEventListener("click", open));
  window.KodaPurchases = { open, render, refresh: load };
})();
