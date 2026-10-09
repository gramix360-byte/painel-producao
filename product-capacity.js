(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  async function headers() {
    const session = await window.PPAuth?.getSession?.();
    if (!session?.access_token) throw new Error("Sessão expirada");
    return { apikey: window.PPAuth.key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  }
  async function edit(id, name) {
    try {
      const response = await fetch(`${window.PPAuth.url}/rest/v1/products?select=production_capacity_per_day&id=eq.${encodeURIComponent(id)}&limit=1`, { headers: await headers() });
      if (!response.ok) throw new Error(await response.text());
      const current = (await response.json())[0]?.production_capacity_per_day || 50;
      const value = prompt(`Capacidade diária de produção\n\nProduto: ${name}\nQuantas unidades você consegue fabricar por dia?`, String(current));
      if (value === null) return;
      const capacity = Number(String(value).replace(",", "."));
      if (!Number.isFinite(capacity) || capacity <= 0) return alert("Informe uma quantidade maior que zero.");
      const save = await fetch(`${window.PPAuth.url}/rest/v1/products?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...(await headers()), Prefer: "return=minimal" }, body: JSON.stringify({ production_capacity_per_day: capacity, updated_at: new Date().toISOString() }) });
      if (!save.ok) throw new Error(await save.text());
      alert("Capacidade diária atualizada. As novas previsões usarão esse valor.");
    } catch (error) { console.error(error); alert("Não foi possível atualizar a capacidade de produção."); }
  }
  function decorate() {
    document.querySelectorAll("#product-list .product-card").forEach((card) => {
      const editButton = $(".product-edit", card), actions = $(".product-actions", card);
      if (!editButton || !actions || $(".product-capacity", card)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button secondary product-capacity";
      button.textContent = "Capacidade";
      button.onclick = () => edit(editButton.dataset.id, $("h3", card)?.textContent || "Produto");
      actions.insertBefore(button, actions.querySelector(".product-delete"));
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
    decorate();
  });
})();
