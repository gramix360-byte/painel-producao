(() => {
  async function headers() {
    const session = await PPAuth.getSession();
    return { apikey: PPAuth.key, Authorization: `Bearer ${session.access_token}` };
  }

  async function request(path) {
    const response = await fetch(`${PPAuth.url}/rest/v1/${path}`, { headers: await headers() });
    return {
      ok: response.ok,
      data: response.ok ? await response.json() : [],
      error: response.ok ? "" : await response.text(),
    };
  }

  async function run() {
    const checks = [];
    const add = (name, ok, detail) => checks.push({ name, ok, detail });

    try {
      const [orders, products, quotes, customers, finance, purchases] = await Promise.all([
        request("orders?select=id,status,phase,stock_applied,payment_status,deleted_at&deleted_at=is.null&limit=2000"),
        request("products?select=id,name,stock,min_stock,deleted_at&deleted_at=is.null&limit=2000"),
        request("quotes?select=id,status,deleted_at&deleted_at=is.null&limit=2000"),
        request("customers?select=id&deleted_at=is.null&limit=1"),
        request("cash_transactions?select=id,status,deleted_at&deleted_at=is.null&limit=2000"),
        request("purchases?select=id,status,finance_id,product_id&limit=2000"),
      ]);

      add("Clientes → Orçamentos", customers.ok && quotes.ok, customers.ok && quotes.ok ? "Consultas operacionais" : "Falha de acesso");
      add("Orçamentos → Pedidos", quotes.ok && orders.ok, "Conversão protegida por transação");

      const inconsistent = orders.data.filter(
        (item) => item.status === "finalizado" && !["embalado", "expedicao", "entregue", "finalizado"].includes(item.phase),
      );
      add(
        "Produção → Finalização",
        orders.ok && !inconsistent.length,
        inconsistent.length ? `${inconsistent.length} pedido(s) inconsistente(s)` : "Fluxo consistente",
      );

      const missingStock = orders.data.filter((item) => item.status === "finalizado" && !item.stock_applied);
      add(
        "Pedido → Estoque",
        orders.ok && !missingStock.length,
        missingStock.length ? `${missingStock.length} finalizado(s) sem baixa confirmada` : "Baixa idempotente ativa",
      );

      const negativeStock = products.data.filter((item) => Number(item.stock) < 0);
      add(
        "Integridade do estoque",
        products.ok && !negativeStock.length,
        negativeStock.length ? `${negativeStock.length} produto(s) com estoque negativo` : "Sem estoque negativo",
      );

      const purchasesWithoutFinance = purchases.data.filter(
        (item) => !["cancelado", "rascunho"].includes(item.status) && !item.finance_id,
      );
      add(
        "Compras → Financeiro",
        purchases.ok && finance.ok && !purchasesWithoutFinance.length,
        purchasesWithoutFinance.length
          ? `${purchasesWithoutFinance.length} compra(s) sem conta vinculada`
          : "Vínculos consistentes",
      );
      add("Financeiro", finance.ok, finance.ok ? "Consulta operacional" : "Acesso indisponível para este perfil");
    } catch (error) {
      add("Fluxo geral", false, window.BrindesOnErrors?.message(error, "Falha inesperada no diagnóstico.") || "Falha inesperada no diagnóstico.");
    }
    return checks;
  }

  window.KodaHealth = {
    run,
    async show() {
      const checks = await run();
      const failed = checks.filter((item) => !item.ok);
      alert(
        `${failed.length ? "⚠️" : "✓"} Diagnóstico Brindes On\n\n${checks
          .map((item) => `${item.ok ? "✓" : "⚠"} ${item.name}: ${item.detail}`)
          .join("\n")}\n\n${failed.length ? `${failed.length} ponto(s) precisam de atenção.` : "Fluxo principal consistente."}`,
      );
    },
  };
})();
