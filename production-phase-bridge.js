(() => {
  const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const fmt = (value) => {
    if (!value) return "Sem prazo";
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  };
  const labels = {
    pedido_recebido: "Pedido recebido",
    aguardando_arte: "Aguardando arte",
    arte_em_criacao: "Criando arte",
    aguardando_aprovacao: "Aguardando aprovação do cliente",
    arte_aprovada: "Arte aprovada — pronta para produção",
    em_producao: "Em produção",
    embalado: "Embalado",
    expedicao: "Enviado",
    entregue: "Entregue",
  };

  async function headers() {
    const session = await window.PPAuth?.getSession();
    if (!session?.access_token) throw new Error("Sessão expirada");
    return { apikey: window.PPAuth.key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  }

  async function updateLocal(orderId, phase, status, now) {
    try {
      const request = indexedDB.open("painel-producao-db", 1);
      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
      const db = request.result;
      const transaction = db.transaction("orders", "readwrite");
      const store = transaction.objectStore("orders");
      const get = store.get(orderId);
      await new Promise((resolve, reject) => {
        get.onsuccess = resolve;
        get.onerror = () => reject(get.error);
      });
      if (get.result) {
        const order = get.result;
        Object.assign(order, { phase, status, updated_at: now });
        if (phase === "em_producao") order.started_at ||= now;
        if (phase === "embalado") order.finished_at ||= now;
        store.put(order);
      }
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    } catch (error) {
      console.warn("Fase local não atualizada", error);
    }
  }

  async function patch(orderId, phase, status = "aguardando") {
    const authHeaders = await headers();
    const now = new Date().toISOString();
    const body = { phase, status, updated_at: now };
    if (phase === "em_producao") body.started_at = now;
    if (phase === "embalado") body.finished_at = now;
    const response = await fetch(`${window.PPAuth.url}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { ...authHeaders, Prefer: "return=minimal" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await response.text());
    await updateLocal(orderId, phase, status, now);
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel("painel-producao-updates");
      channel.postMessage({ type: "changed" });
      channel.close();
    }
    window.PPPhases?.refresh?.();
  }

  function nextAction(order) {
    const phase = order.phase || "pedido_recebido";
    if (["pedido_recebido", "aguardando_arte"].includes(phase)) return { phase: "arte_em_criacao", label: "Iniciar criação da arte" };
    if (phase === "arte_em_criacao") return { artwork: true, label: "Enviar prévia ao cliente" };
    if (phase === "aguardando_aprovacao") return { artwork: true, label: "Ver aprovação da arte" };
    if (phase === "arte_aprovada") return { phase: "em_producao", status: "em_producao", label: "Iniciar produção" };
    return null;
  }

  function card(order) {
    const items = (order.order_items || []).map((item) => `<li><span class="qty">${esc(item.quantity)}</span><div><div class="item-name">${esc(item.product_name)}</div>${item.personalization ? `<div class="personalization">${esc(item.personalization)}</div>` : ""}</div></li>`).join("");
    const action = nextAction(order);
    const phase = order.phase || "pedido_recebido";
    const actionData = action?.artwork
      ? `data-artwork="1" data-order="${esc(order.order_number)}"`
      : `data-id="${esc(order.id)}" data-phase="${esc(action?.phase || "")}" data-status="${esc(action?.status || "aguardando")}"`;
    return `<article class="order-card ${order.priority === "urgente" ? "urgent" : ""}"><div class="order-card-head"><div><div class="order-number">#${esc(order.order_number)}</div><div class="customer">${esc(order.customer_name)}</div></div><div class="meta"><span class="badge ${esc(order.priority)}">${order.priority === "urgente" ? "URGENTE" : "Normal"}</span><div>Prazo: ${fmt(order.due_date)}</div></div></div><div class="approval-note">${esc(labels[phase] || phase)}</div><ul class="order-items">${items}</ul>${order.notes ? `<div class="order-notes"><strong>Obs.:</strong> ${esc(order.notes)}</div>` : ""}${action ? `<div class="order-actions"><button class="button primary preproduction-action" ${actionData}>${esc(action.label)}</button></div>` : ""}</article>`;
  }

  async function render() {
    if (window.KodaOperationsPro) return;
    const view = document.getElementById("view-producao");
    if (!view?.classList.contains("active")) return;
    const firstColumn = view.querySelector(".production-columns")?.children?.[0];
    if (!firstColumn) return;
    try {
      const authHeaders = await headers();
      const phases = "pedido_recebido,aguardando_arte,arte_em_criacao,aguardando_aprovacao,arte_aprovada";
      const response = await fetch(`${window.PPAuth.url}/rest/v1/orders?select=*,order_items(*)&phase=in.(${phases})&deleted_at=is.null&order=created_at.asc`, { headers: authHeaders });
      if (!response.ok) throw new Error(await response.text());
      const orders = await response.json();
      orders.sort((a, b) => a.priority !== b.priority ? (a.priority === "urgente" ? -1 : 1) : (a.due_date || "9999").localeCompare(b.due_date || "9999"));
      firstColumn.innerHTML = `<div class="column-title"><h2>Arte e preparação</h2><strong>${orders.length}</strong></div>${orders.length ? orders.map(card).join("") : '<div class="empty">Nenhum pedido aguardando arte ou produção.</div>'}`;
      firstColumn.querySelectorAll(".preproduction-action").forEach((button) => {
        button.onclick = async () => {
          if (button.dataset.artwork === "1") {
            window.KodaArtworkApproval?.open?.(button.dataset.order);
            return;
          }
          button.disabled = true;
          const previous = button.textContent;
          button.textContent = "Atualizando...";
          try {
            await patch(button.dataset.id, button.dataset.phase, button.dataset.status);
            setTimeout(render, 100);
          } catch (error) {
            console.error(error);
            alert("Não foi possível avançar o pedido.");
            button.disabled = false;
            button.textContent = previous;
          }
        };
      });
    } catch (error) {
      console.error("Falha ao carregar arte e preparação", error);
    }
  }

  document.addEventListener("click", (event) => {
    const finished = event.target.closest('.status-action[data-status="finalizado"]');
    if (finished) setTimeout(() => patch(finished.dataset.id, "embalado", "finalizado").catch((error) => console.error("Falha ao embalar pedido", error)), 250);
    if (event.target.closest('.nav-item[data-view="producao"]')) setTimeout(render, 250);
  }, true);

  const observer = new MutationObserver(() => setTimeout(render, 80));
  document.addEventListener("DOMContentLoaded", () => {
    const view = document.getElementById("view-producao");
    if (view) observer.observe(view, { childList: true, subtree: false });
    setInterval(render, 5000);
  });
  window.KodaProductionFlow = { refresh: render, advance: patch };
})();
