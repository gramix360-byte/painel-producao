(() => {
  const $ = (s) => document.querySelector(s);
  const money = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const esc = (v = "") => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  async function headers() {
    const session = await PPAuth.getSession();
    return { apikey: PPAuth.key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  }
  async function load() {
    const host = $("#view-dashboard");
    if (!host?.classList.contains("active") || !host.querySelector("[data-pro-dashboard]")) return;
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    const h = await headers();
    const [ordersResponse, expensesResponse] = await Promise.all([
      fetch(`${PPAuth.url}/rest/v1/orders?select=id,order_number,customer_name,total_amount,total_cost,marketplace_fee,shipping_cost,other_expenses,net_profit,net_margin,sales_channel,created_at,order_items(product_name,line_total,cost_subtotal)&deleted_at=is.null&created_at=gte.${encodeURIComponent(start.toISOString())}&order=created_at.desc`, { headers: h }),
      fetch(`${PPAuth.url}/rest/v1/cash_transactions?select=id,amount,category,description,paid_at,created_at&type=eq.saida&status=eq.pago&deleted_at=is.null&order=created_at.desc&limit=2000`, { headers: h })
    ]);
    if (!ordersResponse.ok) return;
    const orders = await ordersResponse.json();
    const transactions = (expensesResponse.ok ? await expensesResponse.json() : []).filter((x) => new Date(x.paid_at || x.created_at) >= start);
    const operating = transactions.filter((x) => x.category !== "fornecedor").reduce((sum, x) => sum + Number(x.amount || 0), 0);
    const revenue = orders.reduce((sum, x) => sum + Number(x.total_amount || 0), 0);
    const directNet = orders.reduce((sum, x) => sum + Number(x.net_profit || 0), 0);
    const realNet = directNet - operating;
    const current = host.querySelector("[data-real-profit]");
    const html = `<section class="dash-card real-profit-card" data-real-profit><div class="dash-section-title"><div><h2>Lucro real do mês</h2><small>Materiais, taxas, frete e demais despesas</small></div><strong class="${realNet < 0 ? "negative" : ""}">${money(realNet)}</strong></div><div class="real-profit-kpis"><div><small>Lucro após custos dos pedidos</small><b>${money(directNet)}</b></div><div><small>Despesas operacionais pagas</small><b>${money(operating)}</b></div><div><small>Margem líquida real</small><b>${revenue ? (realNet / revenue * 100).toFixed(1) : "0,0"}%</b></div></div><div class="real-profit-table">${orders.slice(0, 12).map((order) => `<div><span><b>#${esc(order.order_number)}</b><small>${esc(order.customer_name)}</small></span><span><small>Taxas + frete + extras</small><b>${money(Number(order.marketplace_fee) + Number(order.shipping_cost) + Number(order.other_expenses))}</b></span><span><small>Lucro líquido</small><b>${money(order.net_profit)}</b></span><button class="button secondary" data-profit-order="${order.id}">Custos extras</button></div>`).join("") || "<p>Nenhum pedido neste mês.</p>"}</div></section>`;
    if (current) current.outerHTML = html; else host.querySelector(".dashboard-pro")?.insertAdjacentHTML("beforeend", html);
    host.querySelectorAll("[data-profit-order]").forEach((button) => button.onclick = () => edit(orders.find((x) => x.id === button.dataset.profitOrder)));
  }
  function edit(order) {
    const backdrop = document.createElement("div"); backdrop.className = "profit-modal-backdrop";
    backdrop.innerHTML = `<form class="profit-modal"><h2>Custos extras · #${esc(order.order_number)}</h2><p>Registre os custos que não fazem parte do material.</p><label>Taxa do marketplace (R$)<input name="marketplace_fee" type="number" min="0" step="0.01" value="${Number(order.marketplace_fee || 0).toFixed(2)}"></label><label>Frete pago pela empresa (R$)<input name="shipping_cost" type="number" min="0" step="0.01" value="${Number(order.shipping_cost || 0).toFixed(2)}"></label><label>Outras despesas do pedido (R$)<input name="other_expenses" type="number" min="0" step="0.01" value="${Number(order.other_expenses || 0).toFixed(2)}"></label><div><button type="button" class="button secondary">Cancelar</button><button class="button primary">Salvar custos</button></div></form>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('[type="button"]').onclick = () => backdrop.remove();
    backdrop.onclick = (event) => { if (event.target === backdrop) backdrop.remove(); };
    backdrop.querySelector("form").onsubmit = async (event) => {
      event.preventDefault(); const form = event.currentTarget, button = form.querySelector(".primary"); button.disabled = true;
      const response = await fetch(`${PPAuth.url}/rest/v1/orders?id=eq.${order.id}`, { method: "PATCH", headers: { ...(await headers()), Prefer: "return=minimal" }, body: JSON.stringify({ marketplace_fee: Number(form.elements.marketplace_fee.value || 0), shipping_cost: Number(form.elements.shipping_cost.value || 0), other_expenses: Number(form.elements.other_expenses.value || 0), updated_at: new Date().toISOString() }) });
      if (!response.ok) { button.disabled = false; return alert("Não foi possível salvar os custos."); }
      backdrop.remove(); await load(); window.PPDashboardPro?.refresh?.();
    };
  }
  const observer = new MutationObserver(() => { if (!document.querySelector("[data-real-profit]")) setTimeout(() => load().catch(console.warn), 100); });
  document.addEventListener("DOMContentLoaded", () => { const host = $("#view-dashboard"); if (host) observer.observe(host, { childList: true, subtree: true }); setTimeout(() => load().catch(console.warn), 700); document.addEventListener("click", (e) => { if (e.target.closest('[data-view="dashboard"]')) setTimeout(() => load().catch(console.warn), 500); }); });
  window.KodaRealProfit = { refresh: load };
})();
