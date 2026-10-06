(() => {
  const LEGACY_PUR = "koda-purchases-v1",
    LEGACY_SUP = "koda-suppliers-v1";
  let products = [],
    suppliers = [],
    purchases = [],
    filter = "todos",
    search = "";
  const esc = (v = "") =>
      String(v).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      ),
    money = (v) =>
      Number(v || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }),
    date = (v) =>
      v
        ? new Date(
            String(v).length === 10 ? v + "T12:00:00" : v,
          ).toLocaleDateString("pt-BR")
        : "—";
  async function headers() {
    const s = await window.PPAuth.getSession();
    return {
      apikey: window.PPAuth.key,
      Authorization: `Bearer ${s.access_token}`,
      "Content-Type": "application/json",
    };
  }
  function closeDialog() {
    document.querySelector(".purchase-modal-backdrop")?.remove();
  }
  function openDialog({ title, subtitle = "", content, saveText = "Salvar", onSave }) {
    closeDialog();
    const modal = document.createElement("div");
    modal.className = "purchase-modal-backdrop";
    modal.innerHTML = `<form class="purchase-modal"><div class="purchase-modal-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button type="button" class="purchase-modal-close" aria-label="Fechar">×</button></div><div class="purchase-modal-body">${content}</div><div class="purchase-modal-actions"><button type="button" class="button secondary purchase-modal-cancel">Cancelar</button><button type="submit" class="button primary purchase-modal-save">${esc(saveText)}</button></div></form>`;
    document.body.appendChild(modal);
    const form = modal.querySelector("form");
    modal.querySelectorAll(".purchase-modal-close,.purchase-modal-cancel").forEach((button) => (button.onclick = closeDialog));
    modal.onclick = (event) => { if (event.target === modal) closeDialog(); };
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = modal.querySelector(".purchase-modal-save");
      button.disabled = true;
      button.textContent = "Salvando...";
      try {
        const done = await onSave(new FormData(form), form);
        if (done !== false) closeDialog();
      } catch (error) {
        console.error(error);
        alert(error.message || "Não foi possível concluir esta ação.");
      } finally {
        if (document.body.contains(button)) {
          button.disabled = false;
          button.textContent = saveText;
        }
      }
    };
    return form;
  }
  async function loadProducts() {
    const r = await fetch(
      `${window.PPAuth.url}/rest/v1/products?select=id,name,sku,stock,cost_price&deleted_at=is.null&active=eq.true&order=name.asc`,
      { headers: await headers() },
    );
    if (!r.ok) throw new Error(await r.text());
    products = await r.json();
  }
  async function loadData() {
    const h = await headers(),
      [s, p] = await Promise.all([
        fetch(
          `${window.PPAuth.url}/rest/v1/suppliers?select=*&active=eq.true&order=name.asc`,
          { headers: h },
        ),
        fetch(
          `${window.PPAuth.url}/rest/v1/purchases?select=*&order=created_at.desc`,
          { headers: h },
        ),
      ]);
    if (!s.ok) throw new Error(await s.text());
    if (!p.ok) throw new Error(await p.text());
    suppliers = await s.json();
    purchases = await p.json();
    await migrateLegacy();
    render();
  }
  async function migrateLegacy() {
    let ls = [],
      lp = [];
    try {
      ls = JSON.parse(localStorage.getItem(LEGACY_SUP) || "[]");
      lp = JSON.parse(localStorage.getItem(LEGACY_PUR) || "[]");
    } catch {}
    if (!ls.length && !lp.length) return;
    const h = await headers();
    if (!suppliers.length && ls.length) {
      const r = await fetch(`${window.PPAuth.url}/rest/v1/suppliers`, {
        method: "POST",
        headers: { ...h, Prefer: "return=representation" },
        body: JSON.stringify(
          ls.map((x) => ({
            name: x.name,
            contact: x.contact || null,
            active: true,
          })),
        ),
      });
      if (r.ok) suppliers = await r.json();
    }
    const byName = (n) =>
      suppliers.find(
        (s) =>
          String(s.name).trim().toLowerCase() ===
          String(n || "")
            .trim()
            .toLowerCase(),
      );
    if (!purchases.length && lp.length) {
      const validUuid = (v) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          String(v || ""),
        );
      const body = lp
        .filter((x) => x.product_id)
        .map((x) => {
          const s = byName(x.supplier);
          return {
            supplier_id: s?.id || null,
            supplier_name: x.supplier || "Fornecedor",
            product_id: x.product_id,
            product_name: x.product || "Produto",
            sku: x.sku || null,
            quantity: Number(x.qty || 0),
            unit_cost: Number(x.unit || 0),
            total_amount: Number(x.total || 0),
            due_date: x.due_date || null,
            payment_method: x.payment_method || null,
            finance_id: validUuid(x.finance_id) ? x.finance_id : null,
            status: x.status === "recebido" ? "recebido" : "aguardando",
            received_at: x.receivedAt || null,
            created_at: x.createdAt || new Date().toISOString(),
          };
        });
      if (body.length) {
        const r = await fetch(`${window.PPAuth.url}/rest/v1/purchases`, {
          method: "POST",
          headers: { ...h, Prefer: "return=representation" },
          body: JSON.stringify(body),
        });
        if (r.ok) purchases = await r.json();
      }
    }
    localStorage.removeItem(LEGACY_SUP);
    localStorage.removeItem(LEGACY_PUR);
  }
  async function createPayable(x) {
    const h = await headers(),
      p = {
        type: "saida",
        category: "fornecedor",
        description: `Compra · ${x.product_name}`,
        amount: Number(x.total_amount || 0),
        due_date: x.due_date || null,
        payment_method: x.payment_method || null,
        supplier_name: x.supplier_name || null,
        notes: `Pedido de compra KODA${x.sku ? ` · SKU ${x.sku}` : ""}`,
        status: "pendente",
        deleted_at: null,
      };
    const r = await fetch(`${window.PPAuth.url}/rest/v1/cash_transactions`, {
      method: "POST",
      headers: { ...h, Prefer: "return=representation" },
      body: JSON.stringify(p),
    });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json())?.[0]?.id || null;
  }
  async function updatePayable(x) {
    if (!x.finance_id) return;
    const h = await headers(),
      body = {
        description: `Compra · ${x.product_name}`,
        amount: Number(x.total_amount || 0),
        due_date: x.due_date || null,
        payment_method: x.payment_method || null,
        supplier_name: x.supplier_name || null,
        updated_at: new Date().toISOString(),
      };
    await fetch(
      `${window.PPAuth.url}/rest/v1/cash_transactions?id=eq.${encodeURIComponent(x.finance_id)}`,
      {
        method: "PATCH",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify(body),
      },
    );
  }
  async function addSupplier() {
    openDialog({
      title: "Novo fornecedor",
      subtitle: "Cadastre o fornecedor para usar nas próximas compras.",
      saveText: "Cadastrar fornecedor",
      content: `<div class="purchase-form-grid"><label class="purchase-field purchase-span-2"><span>Nome do fornecedor *</span><input name="name" required autofocus placeholder="Ex.: Distribuidora de materiais"></label><label class="purchase-field purchase-span-2"><span>Contato</span><input name="contact" placeholder="Telefone, WhatsApp ou e-mail"></label></div>`,
      onSave: async (data) => {
        const name = String(data.get("name") || "").trim();
        const contact = String(data.get("contact") || "").trim();
        if (!name) return false;
        const r = await fetch(`${window.PPAuth.url}/rest/v1/suppliers`, { method: "POST", headers: { ...(await headers()), Prefer: "return=minimal" }, body: JSON.stringify({ name, contact: contact || null, active: true }) });
        if (!r.ok) throw new Error("Não foi possível cadastrar o fornecedor.");
        await loadData();
      },
    });
  }
  async function editSupplier(id) {
    const x = suppliers.find((s) => s.id === id);
    if (!x) return;
    openDialog({
      title: "Editar fornecedor",
      saveText: "Salvar alterações",
      content: `<div class="purchase-form-grid"><label class="purchase-field purchase-span-2"><span>Nome do fornecedor *</span><input name="name" required value="${esc(x.name)}"></label><label class="purchase-field purchase-span-2"><span>Contato</span><input name="contact" value="${esc(x.contact || "")}"></label></div>`,
      onSave: async (data) => {
        const name = String(data.get("name") || "").trim();
        const contact = String(data.get("contact") || "").trim();
        if (!name) return false;
        const r = await fetch(`${window.PPAuth.url}/rest/v1/suppliers?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...(await headers()), Prefer: "return=minimal" }, body: JSON.stringify({ name, contact: contact || null, updated_at: new Date().toISOString() }) });
        if (!r.ok) throw new Error("Não foi possível editar o fornecedor.");
        await loadData();
      },
    });
  }
  async function deleteSupplier(id) {
    const x = suppliers.find((s) => s.id === id);
    if (!x || !confirm(`Desativar o fornecedor "${x.name}"?`)) return;
    const r = await fetch(
      `${window.PPAuth.url}/rest/v1/suppliers?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { ...(await headers()), Prefer: "return=minimal" },
        body: JSON.stringify({
          active: false,
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!r.ok) return alert("Não foi possível desativar o fornecedor.");
    await loadData();
  }
  async function addPurchase(selectedProductId = "") {
    try {
      if (!products.length) await loadProducts();
    } catch {
      return alert("Não foi possível carregar os produtos.");
    }
    if (!suppliers.length) return alert("Cadastre um fornecedor primeiro.");
    const chosen = products.find((p) => String(p.id) === String(selectedProductId));
    const form = openDialog({
      title: "Solicitar compra",
      subtitle: "Informe tudo em uma única tela. O total é calculado automaticamente.",
      saveText: "Criar pedido de compra",
      content: `<div class="purchase-form-grid"><label class="purchase-field purchase-span-2"><span>Produto *</span><select name="product_id" required><option value="">Selecione o produto</option>${products.map((p) => `<option value="${p.id}" ${chosen?.id === p.id ? "selected" : ""}>${esc(p.name)}${p.sku ? ` · ${esc(p.sku)}` : ""}</option>`).join("")}</select></label><div class="purchase-product-summary purchase-span-2"><div><small>Estoque atual</small><strong data-current-stock>—</strong></div><div><small>Custo atual</small><strong data-current-cost>—</strong></div><div><small>SKU</small><strong data-current-sku>—</strong></div></div><label class="purchase-field purchase-span-2"><span>Fornecedor *</span><select name="supplier_id" required><option value="">Selecione o fornecedor</option>${suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label><label class="purchase-field"><span>Quantidade *</span><input name="quantity" type="number" min="0.01" step="0.01" value="1" required></label><label class="purchase-field"><span>Custo unitário *</span><div class="purchase-money-input"><span>R$</span><input name="unit_cost" type="number" min="0" step="0.01" value="0" required></div></label><label class="purchase-field"><span>Previsão de pagamento</span><input name="due_date" type="date"></label><label class="purchase-field"><span>Forma de pagamento</span><select name="payment_method"><option value="">Selecione</option><option>PIX</option><option>Boleto</option><option>Cartão de crédito</option><option>Cartão de débito</option><option>Transferência</option><option>Dinheiro</option><option>Outro</option></select></label><div class="purchase-total purchase-span-2"><span>Total da compra</span><strong data-purchase-total>R$ 0,00</strong></div></div>`,
      onSave: async (data) => {
        const p = products.find((item) => String(item.id) === String(data.get("product_id")));
        const supplier = suppliers.find((item) => String(item.id) === String(data.get("supplier_id")));
        const quantity = Number(data.get("quantity") || 0);
        const unit_cost = Number(data.get("unit_cost") || 0);
        if (!p || !supplier || quantity <= 0 || unit_cost < 0) throw new Error("Confira o produto, o fornecedor, a quantidade e o custo.");
        const x = { supplier_id: supplier.id, supplier_name: supplier.name, product_id: p.id, product_name: p.name, sku: p.sku || null, quantity, unit_cost, total_amount: quantity * unit_cost, due_date: String(data.get("due_date") || "") || null, payment_method: String(data.get("payment_method") || "") || null, status: "aguardando" };
        x.finance_id = await createPayable(x);
        const r = await fetch(`${window.PPAuth.url}/rest/v1/purchases`, { method: "POST", headers: { ...(await headers()), Prefer: "return=minimal" }, body: JSON.stringify(x) });
        if (!r.ok) throw new Error(await r.text());
        window.PPFinance?.refresh?.();
        await loadData();
        alert("Pedido de compra criado e conta a pagar gerada no Financeiro.");
      },
    });
    const productSelect = form.elements.product_id;
    const quantityInput = form.elements.quantity;
    const costInput = form.elements.unit_cost;
    const updateTotal = () => { form.querySelector("[data-purchase-total]").textContent = money(Number(quantityInput.value || 0) * Number(costInput.value || 0)); };
    const updateProduct = () => {
      const p = products.find((item) => String(item.id) === String(productSelect.value));
      form.querySelector("[data-current-stock]").textContent = p ? Number(p.stock || 0) : "—";
      form.querySelector("[data-current-cost]").textContent = p ? money(p.cost_price) : "—";
      form.querySelector("[data-current-sku]").textContent = p?.sku || "—";
      if (p) costInput.value = Number(p.cost_price || 0).toFixed(2);
      updateTotal();
    };
    productSelect.onchange = updateProduct;
    quantityInput.oninput = updateTotal;
    costInput.oninput = updateTotal;
    updateProduct();
  }
  async function editPurchase(id) {
    const x = purchases.find((p) => p.id === id);
    if (!x) return;
    if (x.status === "recebido")
      return alert(
        "Compras já recebidas ficam bloqueadas para edição para preservar o estoque e o histórico.",
      );
    if (x.status === "cancelado") return alert("Esta compra foi cancelada.");
    const methods = ["", "PIX", "Boleto", "Cartão de crédito", "Cartão de débito", "Transferência", "Dinheiro", "Outro"];
    const form = openDialog({
      title: "Editar pedido de compra",
      subtitle: `${x.product_name} · ${x.supplier_name}`,
      saveText: "Salvar alterações",
      content: `<div class="purchase-form-grid"><label class="purchase-field"><span>Quantidade *</span><input name="quantity" type="number" min="0.01" step="0.01" value="${Number(x.quantity || 0)}" required></label><label class="purchase-field"><span>Custo unitário *</span><div class="purchase-money-input"><span>R$</span><input name="unit_cost" type="number" min="0" step="0.01" value="${Number(x.unit_cost || 0).toFixed(2)}" required></div></label><label class="purchase-field"><span>Previsão de pagamento</span><input name="due_date" type="date" value="${esc(x.due_date || "")}"></label><label class="purchase-field"><span>Forma de pagamento</span><select name="payment_method">${methods.map((m) => `<option value="${esc(m)}" ${m === (x.payment_method || "") ? "selected" : ""}>${m || "Selecione"}</option>`).join("")}</select></label><div class="purchase-total purchase-span-2"><span>Total da compra</span><strong data-purchase-total>${money(x.total_amount)}</strong></div></div>`,
      onSave: async (data) => {
        const qty = Number(data.get("quantity") || 0), cost = Number(data.get("unit_cost") || 0);
        if (qty <= 0 || cost < 0) throw new Error("Confira a quantidade e o custo.");
        const body = { quantity: qty, unit_cost: cost, total_amount: qty * cost, due_date: String(data.get("due_date") || "") || null, payment_method: String(data.get("payment_method") || "") || null, updated_at: new Date().toISOString() };
        const r = await fetch(`${window.PPAuth.url}/rest/v1/purchases?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...(await headers()), Prefer: "return=minimal" }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error("Não foi possível editar a compra.");
        await updatePayable({ ...x, ...body });
        window.PPFinance?.refresh?.();
        await loadData();
      },
    });
    const update = () => { form.querySelector("[data-purchase-total]").textContent = money(Number(form.elements.quantity.value || 0) * Number(form.elements.unit_cost.value || 0)); };
    form.elements.quantity.oninput = update;
    form.elements.unit_cost.oninput = update;
  }
  async function cancelPurchase(id) {
    const x = purchases.find((p) => p.id === id);
    if (!x || x.status !== "aguardando") return;
    if (!confirm(`Cancelar a compra de ${x.product_name}?`)) return;
    const h = await headers();
    let r = await fetch(
      `${window.PPAuth.url}/rest/v1/purchases?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "cancelado",
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!r.ok) return alert("Não foi possível cancelar a compra.");
    if (x.finance_id)
      await fetch(
        `${window.PPAuth.url}/rest/v1/cash_transactions?id=eq.${encodeURIComponent(x.finance_id)}`,
        {
          method: "PATCH",
          headers: { ...h, Prefer: "return=minimal" },
          body: JSON.stringify({
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        },
      );
    window.PPFinance?.refresh?.();
    window.KodaAlerts?.refresh?.();
    await loadData();
  }
  async function deletePurchase(id) {
    const x = purchases.find((purchase) => purchase.id === id);
    if (!x) return;
    if (
      !confirm(
        `Excluir a compra de ${x.product_name}?\n\nO estoque e o lançamento financeiro não serão alterados.`,
      )
    )
      return;
    const r = await fetch(
      `${window.PPAuth.url}/rest/v1/purchases?id=eq.${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: { ...(await headers()), Prefer: "return=minimal" },
      },
    );
    if (!r.ok) return alert("Não foi possível excluir a compra.");
    await loadData();
    alert("Compra excluída da lista.");
  }
  async function receivePurchase(x) {
    if (x.status === "recebido") return;
    const h = await headers(),
      pr = await fetch(
        `${window.PPAuth.url}/rest/v1/products?id=eq.${encodeURIComponent(x.product_id)}&select=id,name,sku,stock,cost_price`,
        { headers: h },
      );
    if (!pr.ok) throw new Error(await pr.text());
    const p = (await pr.json())[0];
    if (!p) throw new Error("Produto não encontrado.");
    const before = Number(p.stock || 0),
      qty = Number(x.quantity || 0),
      after = before + qty,
      newCost = Number(x.unit_cost || p.cost_price || 0);
    let r = await fetch(
      `${window.PPAuth.url}/rest/v1/products?id=eq.${encodeURIComponent(p.id)}`,
      {
        method: "PATCH",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify({ stock: after, cost_price: newCost }),
      },
    );
    if (!r.ok) throw new Error(await r.text());
    r = await fetch(
      `${window.PPAuth.url}/rest/v1/purchases?id=eq.${encodeURIComponent(x.id)}`,
      {
        method: "PATCH",
        headers: { ...h, Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "recebido",
          received_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      },
    );
    if (!r.ok) throw new Error(await r.text());
    window.KodaInventoryHistory?.add?.({
      product_id: p.id,
      product_name: p.name,
      sku: p.sku || "",
      type: "entrada",
      quantity: qty,
      before,
      after,
      reason: `Recebimento de compra · ${x.supplier_name}`,
      source: "compra",
      purchase_id: x.id,
    });
    window.PPProducts?.refresh?.();
    window.KodaSmartInventory?.refresh?.();
    window.PPFinance?.refresh?.();
    window.KodaAlerts?.refresh?.();
    await loadData();
  }
  function state(x) {
    if (x.status === "recebido") return "recebido";
    if (x.status === "cancelado") return "cancelado";
    if (x.due_date && new Date(x.due_date + "T23:59:59") < new Date())
      return "atrasado";
    return "aguardando";
  }
  function visible(x) {
    const s = state(x);
    if (filter !== "todos" && s !== filter) return false;
    const q = search.toLowerCase().trim();
    return (
      !q ||
      `${x.product_name} ${x.supplier_name} ${x.sku || ""}`
        .toLowerCase()
        .includes(q)
    );
  }
  function renderLegacy() {
    const host = document.getElementById("view-compras");
    if (!host) return;
    const open = purchases.filter((x) => x.status === "aguardando"),
      received = purchases.filter((x) => x.status === "recebido"),
      late = open.filter((x) => state(x) === "atrasado"),
      total = open.reduce((s, x) => s + Number(x.total_amount || 0), 0),
      rows = purchases.filter(visible);
    host.innerHTML = `<div class="purchase-head"><div><h2>Compras e Fornecedores</h2><p>Compras, recebimentos e financeiro sincronizados no KODA.</p></div><div><button class="button secondary" id="new-supplier">+ Fornecedor</button><button class="button primary" id="new-purchase">+ Pedido de compra</button></div></div><div class="purchase-kpis"><div><small>Fornecedores ativos</small><strong>${suppliers.length}</strong></div><div><small>Compras abertas</small><strong>${open.length}</strong></div><div><small>Compras atrasadas</small><strong>${late.length}</strong></div><div><small>Mercadoria a receber</small><strong>${money(total)}</strong></div></div><div class="purchase-toolbar"><input id="purchase-search" placeholder="Buscar produto, fornecedor ou SKU" value="${esc(search)}"><select id="purchase-filter"><option value="todos" ${filter === "todos" ? "selected" : ""}>Todas</option><option value="aguardando" ${filter === "aguardando" ? "selected" : ""}>Aguardando</option><option value="atrasado" ${filter === "atrasado" ? "selected" : ""}>Atrasadas</option><option value="recebido" ${filter === "recebido" ? "selected" : ""}>Recebidas</option><option value="cancelado" ${filter === "cancelado" ? "selected" : ""}>Canceladas</option></select></div><div class="purchase-grid"><section><div class="purchase-section-title"><h3>Pedidos de compra</h3><span>${rows.length}</span></div>${
      rows.length
        ? rows
            .map((x) => {
              const st = state(x);
              return `<article class="purchase-card"><div><b>${esc(x.product_name)}</b><small>${esc(x.supplier_name)} · ${Number(x.quantity)} un.${x.sku ? ` · SKU ${esc(x.sku)}` : ""}</small><small>Criado ${date(x.created_at)}${x.received_at ? ` · recebido ${date(x.received_at)}` : ""}</small></div><div><strong>${money(x.total_amount)}</strong><span class="${st}">${st === "recebido" ? "Recebido" : st === "cancelado" ? "Cancelado" : st === "atrasado" ? "Atrasado" : "Aguardando"}</span><small>${x.due_date ? `Vence ${date(x.due_date)}` : "Sem vencimento"} · ${x.finance_id ? "Conta gerada" : "Sem financeiro"}</small></div><div class="purchase-actions">${x.status === "aguardando" ? `<button data-receive="${x.id}" class="button secondary">Receber</button><button data-edit-purchase="${x.id}" class="button secondary">Editar</button><button data-cancel-purchase="${x.id}" class="button danger">Cancelar</button>` : ""}<button data-delete-purchase="${x.id}" class="button danger">Excluir</button></div></article>`;
            })
            .join("")
        : '<div class="purchase-empty">Nenhuma compra encontrada com este filtro.</div>'
    }</section><section><div class="purchase-section-title"><h3>Fornecedores</h3><span>${suppliers.length}</span></div>${suppliers.length ? suppliers.map((x) => `<article class="supplier-card"><div><b>${esc(x.name)}</b><small>${esc(x.contact || "Sem contato")}</small></div><div class="supplier-actions"><button data-edit-supplier="${x.id}" class="button secondary">Editar</button><button data-delete-supplier="${x.id}" class="button danger">Excluir</button></div></article>`).join("") : '<div class="purchase-empty">Cadastre seu primeiro fornecedor.</div>'}<div class="purchase-history"><h3>Histórico de recebimentos</h3>${
      received.length
        ? received
            .slice(0, 8)
            .map(
              (x) =>
                `<div><span>${date(x.received_at)}</span><b>${esc(x.product_name)}</b><small>${Number(x.quantity)} un. · ${esc(x.supplier_name)}</small></div>`,
            )
            .join("")
        : '<div class="purchase-empty">Nenhum recebimento registrado.</div>'
    }</div></section></div>`;
    host.querySelector("#new-supplier").onclick = addSupplier;
    host.querySelector("#new-purchase").onclick = addPurchase;
    host.querySelector("#purchase-search").oninput = (e) => {
      search = e.target.value;
      render();
    };
    host.querySelector("#purchase-filter").onchange = (e) => {
      filter = e.target.value;
      render();
    };
    host
      .querySelectorAll("[data-edit-supplier]")
      .forEach((b) => (b.onclick = () => editSupplier(b.dataset.editSupplier)));
    host
      .querySelectorAll("[data-delete-supplier]")
      .forEach(
        (b) => (b.onclick = () => deleteSupplier(b.dataset.deleteSupplier)),
      );
    host
      .querySelectorAll("[data-edit-purchase]")
      .forEach((b) => (b.onclick = () => editPurchase(b.dataset.editPurchase)));
    host
      .querySelectorAll("[data-cancel-purchase]")
      .forEach(
        (b) => (b.onclick = () => cancelPurchase(b.dataset.cancelPurchase)),
      );
    host
      .querySelectorAll("[data-delete-purchase]")
      .forEach(
        (b) => (b.onclick = () => deletePurchase(b.dataset.deletePurchase)),
      );
    host.querySelectorAll("[data-receive]").forEach(
      (b) =>
        (b.onclick = async () => {
          const x = purchases.find((v) => v.id === b.dataset.receive);
          if (!x) return;
          b.disabled = true;
          b.textContent = "Recebendo...";
          try {
            await receivePurchase(x);
            alert(
              `Compra recebida. ${Number(x.quantity)} unidade(s) adicionadas ao estoque.`,
            );
          } catch (e) {
            console.error(e);
            alert(e.message || "Não foi possível receber a compra.");
            b.disabled = false;
            b.textContent = "Receber";
          }
        }),
    );
  }
  function render() {
    const host = document.getElementById("view-compras");
    if (!host) return;
    const openPurchases = purchases.filter((x) => x.status === "aguardando");
    const received = purchases.filter((x) => x.status === "recebido");
    const late = openPurchases.filter((x) => state(x) === "atrasado");
    const pendingValue = openPurchases.reduce((sum, x) => sum + Number(x.total_amount || 0), 0);
    const q = search.toLowerCase().trim();
    const productRows = products.filter((p) => !q || `${p.name} ${p.sku || ""}`.toLowerCase().includes(q));
    const purchaseRows = purchases.filter(visible);
    host.innerHTML = `<div class="purchase-page">
      <header class="purchase-head purchase-hero"><div><span class="purchase-eyebrow">BRINDE ON</span><h2>Gestão de Compras</h2><p>Reposição de estoque, fornecedores e contas a pagar em um único lugar.</p></div><div><button class="button secondary" id="new-supplier">+ Fornecedor</button><button class="button primary" id="new-purchase">+ Pedido de compra</button></div></header>
      <div class="purchase-kpis"><div><small>Fornecedores ativos</small><strong>${suppliers.length}</strong><span>cadastrados</span></div><div><small>Compras abertas</small><strong>${openPurchases.length}</strong><span>aguardando recebimento</span></div><div><small>Compras atrasadas</small><strong class="${late.length ? "purchase-danger" : ""}">${late.length}</strong><span>fora do prazo</span></div><div><small>Mercadoria a receber</small><strong>${money(pendingValue)}</strong><span>valor dos pedidos abertos</span></div></div>
      <section class="purchase-panel purchase-catalog"><div class="purchase-panel-head"><div><h3>Produtos para compra</h3><p>Localize um produto e clique em Solicitar compra.</p></div><span>${productRows.length} produto(s)</span></div><div class="purchase-toolbar purchase-toolbar-modern"><input id="purchase-search" placeholder="Buscar produto ou SKU" value="${esc(search)}"><select id="purchase-filter"><option value="todos" ${filter === "todos" ? "selected" : ""}>Todas as compras</option><option value="aguardando" ${filter === "aguardando" ? "selected" : ""}>Aguardando</option><option value="atrasado" ${filter === "atrasado" ? "selected" : ""}>Atrasadas</option><option value="recebido" ${filter === "recebido" ? "selected" : ""}>Recebidas</option><option value="cancelado" ${filter === "cancelado" ? "selected" : ""}>Canceladas</option></select></div><div class="purchase-product-table"><div class="purchase-product-row purchase-product-labels"><span>Produto</span><span>Estoque</span><span>Custo atual</span><span></span></div>${productRows.length ? productRows.map((p) => { const stock = Number(p.stock || 0); return `<article class="purchase-product-row"><div><b>${esc(p.name)}</b><small>${p.sku ? `SKU ${esc(p.sku)}` : "Sem SKU"}</small></div><strong class="${stock <= 0 ? "purchase-danger" : ""}">${stock}</strong><strong>${money(p.cost_price)}</strong><button class="button primary" data-request-product="${p.id}">Solicitar compra</button></article>`; }).join("") : '<div class="purchase-empty">Nenhum produto encontrado.</div>'}</div></section>
      <div class="purchase-grid purchase-management-grid"><section class="purchase-panel"><div class="purchase-panel-head"><div><h3>Pedidos de compra</h3><p>Acompanhe até o recebimento.</p></div><span>${purchaseRows.length}</span></div>${purchaseRows.length ? purchaseRows.map((x) => { const st = state(x); return `<article class="purchase-card"><div><b>${esc(x.product_name)}</b><small>${esc(x.supplier_name)} · ${Number(x.quantity)} un.${x.sku ? ` · ${esc(x.sku)}` : ""}</small><small>Criado em ${date(x.created_at)}</small></div><div><strong>${money(x.total_amount)}</strong><span class="${st}">${st === "recebido" ? "Recebido" : st === "cancelado" ? "Cancelado" : st === "atrasado" ? "Atrasado" : "Aguardando"}</span><small>${x.due_date ? `Vence ${date(x.due_date)}` : "Sem vencimento"}</small></div><div class="purchase-actions">${x.status === "aguardando" ? `<button data-receive="${x.id}" class="button primary">Receber</button><button data-edit-purchase="${x.id}" class="button secondary">Editar</button><button data-cancel-purchase="${x.id}" class="button secondary">Cancelar</button>` : ""}<button data-delete-purchase="${x.id}" class="button danger">Excluir</button></div></article>`; }).join("") : '<div class="purchase-empty">Nenhuma compra encontrada.</div>'}</section>
      <section class="purchase-panel"><div class="purchase-panel-head"><div><h3>Fornecedores</h3><p>Contatos usados nas compras.</p></div><span>${suppliers.length}</span></div>${suppliers.length ? suppliers.map((x) => `<article class="supplier-card"><div><b>${esc(x.name)}</b><small>${esc(x.contact || "Sem contato")}</small></div><div class="supplier-actions"><button data-edit-supplier="${x.id}" class="button secondary">Editar</button><button data-delete-supplier="${x.id}" class="button danger">Excluir</button></div></article>`).join("") : '<div class="purchase-empty">Cadastre seu primeiro fornecedor.</div>'}<div class="purchase-history"><h3>Últimos recebimentos</h3>${received.length ? received.slice(0, 6).map((x) => `<div><span>${date(x.received_at)}</span><b>${esc(x.product_name)}</b><small>${Number(x.quantity)} un. · ${esc(x.supplier_name)}</small></div>`).join("") : '<div class="purchase-empty">Nenhum recebimento registrado.</div>'}</div></section></div>
    </div>`;
    host.querySelector("#new-supplier").onclick = addSupplier;
    host.querySelector("#new-purchase").onclick = () => addPurchase();
    host.querySelector("#purchase-search").oninput = (event) => { search = event.target.value; render(); const input = host.querySelector("#purchase-search"); input?.focus(); input?.setSelectionRange(search.length, search.length); };
    host.querySelector("#purchase-filter").onchange = (event) => { filter = event.target.value; render(); };
    host.querySelectorAll("[data-request-product]").forEach((button) => (button.onclick = () => addPurchase(button.dataset.requestProduct)));
    host.querySelectorAll("[data-edit-supplier]").forEach((button) => (button.onclick = () => editSupplier(button.dataset.editSupplier)));
    host.querySelectorAll("[data-delete-supplier]").forEach((button) => (button.onclick = () => deleteSupplier(button.dataset.deleteSupplier)));
    host.querySelectorAll("[data-edit-purchase]").forEach((button) => (button.onclick = () => editPurchase(button.dataset.editPurchase)));
    host.querySelectorAll("[data-cancel-purchase]").forEach((button) => (button.onclick = () => cancelPurchase(button.dataset.cancelPurchase)));
    host.querySelectorAll("[data-delete-purchase]").forEach((button) => (button.onclick = () => deletePurchase(button.dataset.deletePurchase)));
    host.querySelectorAll("[data-receive]").forEach((button) => (button.onclick = async () => {
      const item = purchases.find((x) => x.id === button.dataset.receive);
      if (!item || !confirm(`Confirmar o recebimento de ${Number(item.quantity)} unidade(s) de ${item.product_name}?`)) return;
      button.disabled = true; button.textContent = "Recebendo...";
      try { await receivePurchase(item); alert("Compra recebida e estoque atualizado."); }
      catch (error) { console.error(error); alert(error.message || "Não foi possível receber a compra."); button.disabled = false; button.textContent = "Receber"; }
    }));
  }
  async function open() {
    document
      .querySelectorAll(".view")
      .forEach((v) => v.classList.remove("active"));
    document.getElementById("view-compras")?.classList.add("active");
    document
      .querySelectorAll("#nav button")
      .forEach((b) => b.classList.remove("active"));
    document.getElementById("purchases-nav")?.classList.add("active");
    document.getElementById("page-title").textContent = "Compras";
    document.getElementById("page-subtitle").textContent =
      "Fornecedores, pedidos de compra e contas a pagar";
    try {
      await Promise.all([loadProducts(), loadData()]);
      render();
    } catch (e) {
      console.error(e);
      alert("Não foi possível carregar Compras.");
    }
  }
  document.addEventListener("DOMContentLoaded", () =>
    document.getElementById("purchases-nav")?.addEventListener("click", open),
  );
  window.KodaPurchases = { open, render, receivePurchase, refresh: loadData };
})();
