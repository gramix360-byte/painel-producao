(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  let scanner = null;
  let scanning = false;
  let lookingUp = false;

  async function headers() {
    const session = await window.PPAuth.getSession();
    return {
      apikey: window.PPAuth.key,
      Authorization: `Bearer ${session?.access_token || ""}`,
    };
  }

  function ensureUI() {
    if (!$("#mobile-barcode-open")) {
      const button = document.createElement("button");
      button.id = "mobile-barcode-open";
      button.type = "button";
      button.innerHTML = '<span class="scanner-button-icon">▥</span><span><b>Ler código de barras</b><small>Consultar localização e estoque</small></span>';
      button.onclick = open;
      const dashboard = $("#view-dashboard");
      dashboard?.insertAdjacentElement("afterbegin", button);
    }
    if ($("#barcode-scanner-modal")) return;
    const modal = document.createElement("div");
    modal.id = "barcode-scanner-modal";
    modal.className = "scanner-modal";
    modal.innerHTML = `<div class="scanner-dialog">
      <div class="scanner-head"><div><h2>Consultar produto</h2><p>Aponte a câmera para a etiqueta.</p></div><button id="scanner-close" type="button">Fechar</button></div>
      <div id="barcode-reader"></div>
      <div class="scanner-guide"><span></span></div>
      <div id="scanner-status">Preparando a câmera...</div>
      <form id="scanner-manual"><input id="scanner-code" autocomplete="off" placeholder="Ou digite o código BON-000001"><button>Buscar</button></form>
      <div id="scanner-result"></div>
    </div>`;
    document.body.appendChild(modal);
    $("#scanner-close").onclick = close;
    $("#scanner-manual").onsubmit = (event) => {
      event.preventDefault();
      lookup($("#scanner-code").value);
    };
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
  }

  function loadLibrary() {
    if (window.Html5Qrcode) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = $("script[data-barcode-library]");
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.dataset.barcodeLibrary = "1";
      script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function start() {
    const status = $("#scanner-status");
    try {
      await loadLibrary();
      scanner = scanner || new window.Html5Qrcode("barcode-reader", { verbose: false });
      scanning = true;
      status.textContent = "Aponte para o código de barras";
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 120 }, aspectRatio: 1.777778 },
        (code) => lookup(code),
        () => {},
      );
    } catch (error) {
      scanning = false;
      status.textContent = "Não foi possível abrir a câmera. Autorize o acesso ou digite o código abaixo.";
      console.warn("Leitor de código de barras", error);
    }
  }

  async function stop() {
    if (!scanner || !scanning) return;
    scanning = false;
    try { await scanner.stop(); } catch {}
  }

  async function lookup(value) {
    const code = String(value || "").trim().toUpperCase();
    if (!code || lookingUp) return;
    lookingUp = true;
    await stop();
    const status = $("#scanner-status");
    const result = $("#scanner-result");
    status.textContent = `Código lido: ${code}`;
    result.innerHTML = '<div class="scanner-loading">Buscando produto...</div>';
    try {
      const response = await fetch(`${window.PPAuth.url}/rest/v1/products?select=id,sku,name,stock,storage_location,category,sale_price&sku=eq.${encodeURIComponent(code)}&deleted_at=is.null&limit=1`, { headers: await headers() });
      if (!response.ok) throw new Error(await response.text());
      const product = (await response.json())[0];
      if (!product) {
        result.innerHTML = `<div class="scanner-not-found"><b>Produto não encontrado</b><span>Confira o código ${escapeHtml(code)} ou tente novamente.</span><button type="button" data-scan-again>Ler novamente</button></div>`;
      } else {
        const stock = Number(product.stock || 0);
        result.innerHTML = `<article class="scanner-product">
          <span class="scanner-found">PRODUTO ENCONTRADO</span>
          <h3>${escapeHtml(product.name)}</h3>
          <div class="scanner-product-grid"><div><small>Código</small><strong>${escapeHtml(product.sku)}</strong></div><div><small>Estoque</small><strong class="${stock <= 0 ? "out" : ""}">${stock}</strong></div></div>
          <div class="scanner-location"><small>Localização</small><strong>${escapeHtml(product.storage_location || "Localização não cadastrada")}</strong></div>
          <button type="button" data-scan-again>Ler outro produto</button>
        </article>`;
      }
      $("[data-scan-again]", result)?.addEventListener("click", () => {
        result.innerHTML = "";
        start();
      });
    } catch (error) {
      result.innerHTML = '<div class="scanner-not-found"><b>Não foi possível consultar o estoque.</b><span>Tente novamente em instantes.</span><button type="button" data-scan-again>Ler novamente</button></div>';
      $("[data-scan-again]", result)?.addEventListener("click", start);
      console.error(error);
    } finally {
      lookingUp = false;
    }
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function open() {
    ensureUI();
    $("#scanner-result").innerHTML = "";
    $("#scanner-code").value = "";
    $("#barcode-scanner-modal").classList.add("open");
    start();
  }

  async function close() {
    await stop();
    $("#barcode-scanner-modal")?.classList.remove("open");
  }

  const observer = new MutationObserver(ensureUI);
  document.addEventListener("DOMContentLoaded", () => {
    ensureUI();
    observer.observe($("#view-dashboard") || document.body, { childList: true, subtree: true });
  });
  window.PPBarcodeScanner = { open, close, lookup };
})();
