(() => {
  const API = "https://evyilktotmjivscrufug.supabase.co/functions/v1/order-tracking";
  const token = new URLSearchParams(location.search).get("token") || "";
  const card = document.getElementById("tracking-card");
  const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const date = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "A definir";
  const labels = { pedido_recebido: "Pedido recebido", arte_em_criacao: "Criando arte", aguardando_aprovacao: "Aguardando aprovação", arte_aprovada: "Arte aprovada", em_producao: "Em produção", embalado: "Embalado", expedicao: "Enviado", entregue: "Entregue" };
  const steps = ["pedido_recebido", "arte_em_criacao", "arte_aprovada", "em_producao", "embalado", "entregue"];
  function phaseIndex(phase) { if (phase === "aguardando_aprovacao") return 1; if (phase === "expedicao") return 4; return Math.max(0, steps.indexOf(phase)); }
  function render(data) {
    const active = phaseIndex(data.phase), payment = ({ pago: "Pago", parcial: "Entrada recebida", pendente: "Pendente" })[data.payment_status] || data.payment_status || "Pendente";
    card.innerHTML = `<div class="track-head"><div><small>Pedido #${esc(data.order_number)}</small><h1>Olá, ${esc(data.customer_name || "cliente")}!</h1><p>Acompanhe aqui cada etapa do seu pedido.</p></div><span class="track-badge">${esc(labels[data.phase] || "Em andamento")}</span></div>
      <div class="track-flow">${steps.map((step, index) => `<div class="track-step ${index < active ? "done" : index === active ? "active" : ""}"><i>${index < active ? "✓" : index + 1}</i><span>${labels[step]}</span></div>`).join("")}</div>
      <div class="track-grid"><div class="track-box"><small>Prazo combinado</small><b>${date(data.due_date)}</b></div><div class="track-box"><small>Previsão de conclusão</small><b>${date(data.estimated_completion_date)}</b></div><div class="track-box"><small>Pagamento</small><b>${esc(payment)}</b></div><div class="track-box"><small>Envio</small><b>${esc(data.tracking_code ? `${data.carrier || "Transportadora"} · ${data.tracking_code}` : "Ainda não enviado")}</b></div></div>
      <section class="track-section"><h2>Itens do pedido</h2>${(data.items || []).map((item) => `<div class="track-item"><b>${Number(item.quantity)}× ${esc(item.product_name)}</b><span>${esc(item.personalization || "")}</span></div>`).join("")}</section>
      <section class="track-section"><h2>Atualizações</h2><div class="track-timeline">${(data.timeline || []).map((event) => `<div class="track-event"><i></i><span><b>${esc(event.title)}</b><small>${new Date(event.created_at).toLocaleString("pt-BR")}</small></span></div>`).join("")}</div></section><button class="track-refresh" id="refresh">Atualizar acompanhamento</button>`;
    document.getElementById("refresh").onclick = load;
  }
  async function load() {
    if (!/^[a-f0-9]{64}$/.test(token)) { card.innerHTML = '<div class="error"><h2>Link inválido</h2><p>Solicite um novo link à Brindes On.</p></div>'; return; }
    try {
      const response = await fetch(`${API}?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível abrir o acompanhamento.");
      render(data);
    } catch (error) { card.innerHTML = `<div class="error"><h2>Acompanhamento indisponível</h2><p>${esc(error.message)}</p></div>`; }
  }
  load();
  setInterval(load, 30000);
})();
