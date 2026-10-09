(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const number = (value) => Number(value || 0);
  const esc = (value = "") => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  let activeOrder = null;
  let consumptions = [];

  async function headers() {
    const session = await window.PPAuth.getSession();
    return { apikey: window.PPAuth.key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  }

  async function request(path, options = {}) {
    const response = await fetch(`${window.PPAuth.url}/rest/v1/${path}`, { ...options, headers: { ...(await headers()), ...(options.headers || {}) } });
    if (!response.ok) throw new Error(await response.text());
    if (response.status === 204) return null;
    return response.json();
  }

  function modal() {
    let backdrop = $("#order-real-cost-modal");
    if (backdrop) return backdrop;
    backdrop = document.createElement("div");
    backdrop.id = "order-real-cost-modal";
    backdrop.className = "orc-backdrop";
    backdrop.innerHTML = `<section class="orc-modal" role="dialog" aria-modal="true" aria-labelledby="orc-title"><header class="orc-head"><div><h2 id="orc-title">Custo real do pedido</h2><p id="orc-subtitle"></p></div><button type="button" class="button secondary" data-orc-close>Fechar</button></header><div id="orc-body" class="orc-body"></div><footer id="orc-footer" class="orc-footer" hidden></footer></section>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop || event.target.closest("[data-orc-close]")) close(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && $("#order-real-cost-modal")) close(); }, { once: true });
    return backdrop;
  }

  function close() { $("#order-real-cost-modal")?.remove(); }

  async function open(orderId) {
    const root = modal();
    $("#orc-body", root).innerHTML = '<div class="orc-loading">Carregando custos do pedido…</div>';
    $("#orc-footer", root).hidden = true;
    try {
      const [orders, rows] = await Promise.all([
        request(`orders?select=id,order_number,customer_name,total_amount,total_cost,estimated_cost,actual_material_cost,labor_minutes,labor_hourly_rate,labor_cost,packaging_cost,marketplace_fee,shipping_cost,other_expenses,actual_total_cost,cost_notes,cost_updated_at,cost_closed_at&id=eq.${encodeURIComponent(orderId)}&limit=1`),
        request(`material_consumptions?select=order_item_id,material_id,quantity,unit_cost,actual_quantity,actual_unit_cost,notes,materials(name,unit)&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc`)
      ]);
      if (!orders[0]) throw new Error("Pedido não encontrado");
      activeOrder = orders[0];
      consumptions = rows || [];
      $("#orc-subtitle", root).textContent = `Pedido #${activeOrder.order_number} · ${activeOrder.customer_name}`;
      render(root);
    } catch (error) {
      console.error(error);
      $("#orc-body", root).innerHTML = '<div class="orc-empty">Não foi possível carregar os custos deste pedido.</div>';
    }
  }

  function materialEstimate() { return consumptions.reduce((sum, row) => sum + number(row.quantity) * number(row.unit_cost), 0); }
  function materialActual(root) {
    if (!consumptions.length) return number($("#orc-manual-material", root)?.value);
    return [...root.querySelectorAll("[data-orc-row]")].reduce((sum, row) => sum + number($("[data-actual-qty]", row).value) * number($("[data-actual-cost]", row).value), 0);
  }

  function values(root) {
    const materials = materialActual(root);
    const minutes = number($("#orc-labor-minutes", root).value);
    const hourly = number($("#orc-labor-rate", root).value);
    const labor = minutes / 60 * hourly;
    const packaging = number($("#orc-packaging", root).value);
    const fee = number($("#orc-fee", root).value);
    const shipping = number($("#orc-shipping", root).value);
    const other = number($("#orc-other", root).value);
    const total = materials + labor + packaging + fee + shipping + other;
    const profit = number(activeOrder.total_amount) - total;
    return { materials, minutes, hourly, labor, packaging, fee, shipping, other, total, profit };
  }

  function render(root) {
    const estimated = number(activeOrder.estimated_cost || activeOrder.total_cost);
    const rows = consumptions.map((row, index) => {
      const qty = row.actual_quantity == null ? number(row.quantity) : number(row.actual_quantity);
      const unitCost = row.actual_unit_cost == null ? number(row.unit_cost) : number(row.actual_unit_cost);
      return `<tr data-orc-row="${index}"><td data-label="Material"><b>${esc(row.materials?.name || "Material")}</b><br><small>${esc(row.materials?.unit || "un")}</small></td><td data-label="Previsto">${number(row.quantity).toLocaleString("pt-BR")} × ${money(row.unit_cost)}</td><td data-label="Usado"><input data-actual-qty type="number" min="0" step="0.0001" value="${qty}"></td><td data-label="Custo unitário"><input data-actual-cost type="number" min="0" step="0.0001" value="${unitCost}"></td><td data-label="Custo real" data-row-total>${money(qty * unitCost)}</td></tr>`;
    }).join("");
    $("#orc-body", root).innerHTML = `<div class="orc-kpis"><div class="orc-kpi"><small>Venda</small><strong>${money(activeOrder.total_amount)}</strong></div><div class="orc-kpi"><small>Custo estimado</small><strong>${money(estimated)}</strong></div><div class="orc-kpi" id="orc-kpi-actual"><small>Custo real</small><strong></strong></div><div class="orc-kpi" id="orc-kpi-profit"><small>Lucro real</small><strong></strong></div></div><section class="orc-section"><h3>Materiais usados</h3><p>${consumptions.length ? "O previsto veio da ficha técnica. Ajuste somente o que realmente foi usado; o estoque será corrigido pela diferença." : "Este pedido não possui materiais vinculados à ficha técnica. Informe o custo real manualmente."}</p>${consumptions.length ? `<div style="overflow:auto"><table class="orc-table"><thead><tr><th>Material</th><th>Previsto</th><th>Usado</th><th>Custo unitário</th><th>Custo real</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<label class="orc-manual">Custo real dos materiais (R$)<input id="orc-manual-material" type="number" min="0" step="0.01" value="${number(activeOrder.actual_material_cost || estimated).toFixed(2)}"></label>`}</section><section class="orc-section"><h3>Produção e despesas</h3><p>Informe o tempo de trabalho e os custos exclusivos deste pedido.</p><div class="orc-form-grid"><label>Tempo de trabalho (minutos)<input id="orc-labor-minutes" type="number" min="0" step="1" value="${number(activeOrder.labor_minutes)}"></label><label>Valor da hora (R$)<input id="orc-labor-rate" type="number" min="0" step="0.01" value="${number(activeOrder.labor_hourly_rate).toFixed(2)}"></label><label>Embalagem (R$)<input id="orc-packaging" type="number" min="0" step="0.01" value="${number(activeOrder.packaging_cost).toFixed(2)}"></label><label>Taxa do marketplace (R$)<input id="orc-fee" type="number" min="0" step="0.01" value="${number(activeOrder.marketplace_fee).toFixed(2)}"></label><label>Frete pago pela empresa (R$)<input id="orc-shipping" type="number" min="0" step="0.01" value="${number(activeOrder.shipping_cost).toFixed(2)}"></label><label>Outras despesas (R$)<input id="orc-other" type="number" min="0" step="0.01" value="${number(activeOrder.other_expenses).toFixed(2)}"></label></div></section><section class="orc-section"><label class="orc-notes">Observações do custo<textarea id="orc-notes" rows="3" placeholder="Ex.: houve perda de material durante a gravação">${esc(activeOrder.cost_notes || "")}</textarea></label><div class="orc-summary"><div class="orc-summary-line"><span>Materiais reais</span><strong id="orc-sum-material"></strong></div><div class="orc-summary-line"><span>Mão de obra</span><strong id="orc-sum-labor"></strong></div><div class="orc-summary-line"><span>Embalagem, taxas, frete e outros</span><strong id="orc-sum-extra"></strong></div><div class="orc-summary-line total"><span>Custo real total</span><strong id="orc-sum-total"></strong></div><div class="orc-summary-line profit" id="orc-sum-profit-row"><span>Lucro real do pedido</span><strong id="orc-sum-profit"></strong></div></div><div id="orc-status" class="orc-status"></div></section>`;
    const footer = $("#orc-footer", root);
    footer.hidden = false;
    footer.innerHTML = `<label class="orc-check"><input id="orc-closed" type="checkbox" ${activeOrder.cost_closed_at ? "checked" : ""}> Custo conferido</label><div class="orc-footer-actions"><button type="button" class="button secondary" data-orc-close>Cancelar</button><button type="button" class="button primary" id="orc-save">Salvar custos</button></div>`;
    root.querySelectorAll("input, textarea").forEach((input) => input.addEventListener("input", () => recalculate(root)));
    $("#orc-save", root).onclick = () => save(root);
    recalculate(root);
  }

  function recalculate(root) {
    root.querySelectorAll("[data-orc-row]").forEach((row) => { $("[data-row-total]", row).textContent = money(number($("[data-actual-qty]", row).value) * number($("[data-actual-cost]", row).value)); });
    const result = values(root);
    $("#orc-kpi-actual strong", root).textContent = money(result.total);
    $("#orc-kpi-profit strong", root).textContent = money(result.profit);
    $("#orc-kpi-profit", root).classList.toggle("good", result.profit >= 0);
    $("#orc-kpi-profit", root).classList.toggle("bad", result.profit < 0);
    $("#orc-sum-material", root).textContent = money(result.materials);
    $("#orc-sum-labor", root).textContent = money(result.labor);
    $("#orc-sum-extra", root).textContent = money(result.packaging + result.fee + result.shipping + result.other);
    $("#orc-sum-total", root).textContent = money(result.total);
    $("#orc-sum-profit", root).textContent = money(result.profit);
    $("#orc-sum-profit-row", root).classList.toggle("negative", result.profit < 0);
  }

  async function save(root) {
    const button = $("#orc-save", root);
    const status = $("#orc-status", root);
    button.disabled = true;
    status.className = "orc-status";
    status.textContent = "Salvando…";
    try {
      const rowElements = [...root.querySelectorAll("[data-orc-row]")];
      for (let index = 0; index < consumptions.length; index += 1) {
        const consumption = consumptions[index];
        const row = rowElements[index];
        await request(`material_consumptions?order_item_id=eq.${encodeURIComponent(consumption.order_item_id)}&material_id=eq.${encodeURIComponent(consumption.material_id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ actual_quantity: number($("[data-actual-qty]", row).value), actual_unit_cost: number($("[data-actual-cost]", row).value), updated_at: new Date().toISOString() }) });
      }
      const result = values(root);
      const now = new Date().toISOString();
      const directCost = result.materials + result.labor + result.packaging;
      const grossProfit = number(activeOrder.total_amount) - directCost;
      await request(`orders?id=eq.${encodeURIComponent(activeOrder.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ actual_material_cost: result.materials, labor_minutes: Math.round(result.minutes), labor_hourly_rate: result.hourly, labor_cost: result.labor, packaging_cost: result.packaging, marketplace_fee: result.fee, shipping_cost: result.shipping, other_expenses: result.other, actual_total_cost: result.total, total_cost: directCost, gross_profit: grossProfit, profit_margin: number(activeOrder.total_amount) > 0 ? grossProfit / number(activeOrder.total_amount) * 100 : 0, cost_notes: $("#orc-notes", root).value.trim() || null, cost_updated_at: now, cost_closed_at: $("#orc-closed", root).checked ? (activeOrder.cost_closed_at || now) : null, updated_at: now }) });
      activeOrder.cost_updated_at = now;
      activeOrder.cost_closed_at = $("#orc-closed", root).checked ? (activeOrder.cost_closed_at || now) : null;
      status.className = "orc-status success";
      status.textContent = "Custos salvos. Estoque e lucro foram atualizados.";
      window.KodaRealProfit?.refresh?.();
      window.PPDashboardPro?.refresh?.();
      setTimeout(close, 900);
    } catch (error) {
      console.error(error);
      status.className = "orc-status error";
      status.textContent = /insuficiente/i.test(error.message) ? "Não há matéria-prima suficiente para registrar essa quantidade real." : "Não foi possível salvar os custos. Tente novamente.";
      button.disabled = false;
    }
  }

  function decorate() {
    document.querySelectorAll("#orders-results .order-list-row").forEach((row) => {
      if ($(".order-real-cost-button", row)) return;
      const reference = $(".order-delete", row);
      const orderId = reference?.dataset.id;
      if (!orderId) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button secondary order-real-cost-button";
      button.textContent = "Custo real";
      button.onclick = () => open(orderId);
      row.insertBefore(button, reference);
    });
  }

  const observer = new MutationObserver(decorate);
  document.addEventListener("DOMContentLoaded", () => { observer.observe(document.body, { childList: true, subtree: true }); decorate(); });
  window.BrindesOnOrderCosts = { open, refresh: decorate };
})();
