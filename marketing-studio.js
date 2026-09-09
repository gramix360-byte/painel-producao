(() => {
  const view = document.getElementById("view-marketing");
  if (!view) return;
  let products = [];
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
    );
  async function h() {
    const s = await PPAuth.getSession();
    if (!s?.access_token) throw Error("Sessão expirada");
    return {
      apikey: PPAuth.key,
      Authorization: `Bearer ${s.access_token}`,
      "Content-Type": "application/json",
    };
  }
  async function load() {
    const r = await fetch(
      `${PPAuth.url}/rest/v1/products?select=id,name,description,product_images(image_url,is_primary,position)&deleted_at=is.null&active=eq.true&order=name.asc`,
      { headers: await h() },
    );
    if (!r.ok) throw Error(await r.text());
    products = await r.json();
    products.forEach((p) => {
      const a = (p.product_images || []).sort(
        (x, y) =>
          Number(y.is_primary) - Number(x.is_primary) ||
          Number(x.position) - Number(y.position),
      );
      p.image = a[0]?.image_url || "";
    });
  }
  function concept(p, goal, format, variation = 0) {
    const clean = format === "feed",
      name = p?.name || "Seu produto";
    const goals =
      {
        vender: [
          "Seu produto, sua marca.",
          "Personalize e destaque sua empresa.",
          "Um brinde que sua marca merece.",
        ],
        promocao: [
          "Oferta especial para sua marca",
          "Promoção por tempo limitado",
          "Personalize hoje e surpreenda",
        ],
        lancamento: [
          "Novidade na Brinde On",
          "Chegou uma nova forma de marcar presença",
          "Novo produto, novas possibilidades",
        ],
        institucional: [
          "Sua marca presente nos detalhes",
          "Brindes que fortalecem conexões",
          "Transforme sua marca em lembrança",
        ],
        presente: [
          "Um presente com significado",
          "Personalizado para surpreender",
          "Presenteie de um jeito único",
        ],
      }[goal] || [];
    return {
      title: goals[variation % goals.length] || name,
      subtitle: clean
        ? "Brindes personalizados para sua empresa."
        : `${name} personalizado para sua marca.`,
      cta: clean ? "Conheça nossos personalizados" : "Peça seu orçamento",
      style: "premium",
      format,
      scale: clean ? 108 : 100,
      x: 0,
      y: 0,
      bg: "#111111",
      accent: "#7ed321",
    };
  }
  async function saveCloud(post) {
    const body = {
      product_id: post.productId || null,
      product_name: post.productName || null,
      image: post.image || null,
      caption: post.caption || null,
      post_date: post.date || null,
      post_time: post.time || null,
      status: post.status || "rascunho",
      brief: post.brief || null,
      design: post.design || {},
      updated_at: new Date().toISOString(),
    };
    const edit = !!post.id,
      url = edit
        ? `${PPAuth.url}/rest/v1/marketing_posts?id=eq.${encodeURIComponent(post.id)}`
        : `${PPAuth.url}/rest/v1/marketing_posts`,
      r = await fetch(url, {
        method: edit ? "PATCH" : "POST",
        headers: {
          ...(await h()),
          Prefer: edit ? "return=minimal" : "return=representation",
        },
        body: JSON.stringify(body),
      });
    if (!r.ok) throw Error(await r.text());
    return edit ? post.id : (await r.json())?.[0]?.id;
  }
  async function openStudio(existing = null) {
    try {
      if (!products.length) await load();
    } catch (e) {
      console.error(e);
      alert("Não foi possível carregar os produtos.");
      return;
    }
    document
      .querySelector(".marketing-modal-backdrop[data-koda-studio]")
      ?.remove();
    const d = existing?.design || {},
      today = new Date().toISOString().slice(0, 10);
    let variation = 0,
      generated = !!existing,
      uploadedImage = d.productImage || existing?.image || "";
    const modal = document.createElement("div");
    modal.className = "marketing-modal-backdrop";
    modal.dataset.kodaStudio = "1";
    modal.innerHTML = `<div class="marketing-modal studio-modal"><div class="marketing-modal-head"><div><h3>✦ Estúdio Brinde On</h3><div class="muted">Crie artes com a identidade oficial da Brinde On.</div></div><button class="marketing-close">×</button></div><div class="studio-ai-shell"><div class="studio-ai-form"><label>1. Escolha o produto<select id="studio-product"><option value="">Selecione um produto cadastrado</option>${products.map((p) => `<option value="${esc(p.id)}" ${String(existing?.productId || "") === String(p.id) ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label><label>Ou envie uma foto do produto<input id="studio-upload" type="file" accept="image/png,image/jpeg,image/webp"></label><label>2. Modelo<select id="studio-template"><option value="premium" selected>Catálogo Premium</option></select></label><label>3. Cor principal<input id="studio-accent" type="color" value="${esc(d.accent || "#7ed321")}"></label><label>4. Objetivo<select id="studio-goal"><option value="vender">Vender este produto</option><option value="promocao">Fazer uma promoção</option><option value="lancamento">Apresentar uma novidade</option><option value="institucional">Fortalecer a marca</option><option value="presente">Ideia para presente</option></select></label><label>5. Formato<select id="studio-format"><option value="feed" ${d.format === "story" ? "" : "selected"}>Feed • 1:1</option><option value="story" ${d.format === "story" ? "selected" : ""}>Story • 9:16</option></select></label><label>Informações importantes<textarea id="studio-brief" rows="4" placeholder="Ex.: resistente, gravação personalizada, ideal para eventos...">${esc(existing?.brief || "")}</textarea></label><button class="button primary studio-ai-generate" id="studio-generate">✦ Criar no modelo</button><div class="studio-ai-free-note">Paleta oficial: preto, branco e verdes Brinde On.</div><details class="studio-advanced"><summary>Ajustar textos</summary><div class="studio-advanced-body"><label>Chamada<input id="studio-title" value="${esc(d.title || "")}"></label><label>Texto de apoio<input id="studio-subtitle" value="${esc(d.subtitle || "")}"></label><label>Chamada final<input id="studio-cta" value="${esc(d.cta || "")}"></label></div></details></div><div class="studio-workspace"><div class="studio-toolbar"><span id="studio-result-label">${generated ? "Arte preparada" : "Sua arte aparecerá aqui"}</span><b id="studio-size">1080 × 1080</b></div><div class="studio-canvas-wrap studio-ai-empty"><div id="studio-canvas" class="studio-canvas studio-feed studio-premium"><div class="studio-brand"><b>BRINDE <i>ON</i></b><small>SUA MARCA SEMPRE LIGADA</small></div><div class="studio-copy"><strong id="studio-preview-title">Escolha ou envie um produto</strong><span id="studio-preview-subtitle">Crie sua arte no modelo Catálogo Premium.</span></div><div class="studio-product-placeholder" id="studio-product-box"><span>✦</span></div><div class="studio-cta" id="studio-preview-cta">SUA MARCA SEMPRE LIGADA</div></div></div><div class="studio-ai-actions" id="studio-ai-actions" style="display:${generated ? "flex" : "none"}"><button class="button secondary" id="studio-another">↻ Criar outra opção</button><button class="button secondary" id="studio-adjust">✎ Ajustar textos</button></div><div class="marketing-form-grid studio-schedule" id="studio-schedule" style="display:${generated ? "grid" : "none"}"><label>Data<input id="studio-date" type="date" value="${esc(existing?.date || today)}"></label><label>Horário<input id="studio-time" type="time" value="${esc(existing?.time || "10:00")}"></label></div></div></div><div class="marketing-modal-actions"><button class="button secondary" id="studio-cancel">Fechar</button><button class="button primary" id="studio-use" style="display:${generated ? "inline-flex" : "none"}">${existing ? "Salvar alterações" : "Aprovar e adicionar ao calendário"}</button></div></div>`;
    document.body.appendChild(modal);
    const q = (s) => modal.querySelector(s),
      close = () => modal.remove();
    function render(c) {
      const p = products.find(
        (x) => String(x.id) === String(q("#studio-product").value),
      );
      if (!c)
        c = {
          ...d,
          format: q("#studio-format").value,
          style: "premium",
          title: d.title || p?.name || "Seu produto em destaque",
          subtitle: d.subtitle || "Brindes personalizados",
          cta: d.cta || "Peça seu orçamento",
          scale: d.scale || 100,
          x: d.x || 0,
          y: d.y || 0,
          bg: "#111111",
          accent: q("#studio-accent").value || d.accent || "#7ed321",
        };
      q("#studio-title").value = c.title || "";
      q("#studio-subtitle").value = c.subtitle || "";
      q("#studio-cta").value = c.cta || "";
      const canvas = q("#studio-canvas");
      canvas.className = `studio-canvas studio-${c.format} studio-${c.style}`;
      canvas.style.setProperty("--studio-bg", c.bg || "#111111");
      canvas.style.setProperty("--studio-accent", c.accent || "#7ed321");
      q("#studio-size").textContent =
        c.format === "feed" ? "1080 × 1080" : "1080 × 1920";
      q("#studio-preview-title").textContent = c.title;
      q("#studio-preview-subtitle").textContent = c.subtitle;
      q("#studio-preview-cta").textContent = c.cta;
      const productImage = uploadedImage || p?.image || "";
      q("#studio-product-box").innerHTML = productImage
        ? `<img src="${esc(productImage)}" alt="${esc(p?.name || "Produto")}" style="transform:translate(${c.x || 0}%,${c.y || 0}%) scale(${(c.scale || 100) / 100})">`
        : "<span>Produto sem imagem cadastrada</span>";
      q(".studio-canvas-wrap").classList.remove("studio-ai-empty");
      q("#studio-result-label").textContent = "Opção criada pelo KODA";
      generated = true;
      q("#studio-ai-actions").style.display = "flex";
      q("#studio-schedule").style.display = "grid";
      q("#studio-use").style.display = "inline-flex";
    }
    function generate() {
      const p = products.find(
        (x) => String(x.id) === String(q("#studio-product").value),
      );
      if (!p && !uploadedImage)
        return alert("Escolha um produto ou envie uma foto.");
      const btn = q("#studio-generate");
      btn.disabled = true;
      btn.textContent = "✨ Criando sua arte...";
      setTimeout(() => {
        render(
          concept(
            p || { name: "Produto personalizado" },
            q("#studio-goal").value,
            q("#studio-format").value,
            variation++,
          ),
        );
        btn.disabled = false;
        btn.textContent = "✨ Criar minha arte";
      }, 450);
    }
    q("#studio-upload").onchange = (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        uploadedImage = String(reader.result || "");
        generate();
      };
      reader.readAsDataURL(file);
    };
    q("#studio-accent").oninput = () => generated && render();
    q("#studio-generate").onclick = generate;
    q("#studio-another").onclick = generate;
    q("#studio-adjust").onclick = () => {
      q(".studio-advanced").open = true;
      q("#studio-title").focus();
    };
    ["#studio-title", "#studio-subtitle", "#studio-cta"].forEach((sel) =>
      q(sel).addEventListener("input", () => {
        q("#studio-preview-title").textContent = q("#studio-title").value;
        q("#studio-preview-subtitle").textContent = q("#studio-subtitle").value;
        q("#studio-preview-cta").textContent = q("#studio-cta").value;
      }),
    );
    q(".marketing-close").onclick = close;
    q("#studio-cancel").onclick = close;
    q("#studio-use").onclick = async () => {
      const p = products.find(
        (x) => String(x.id) === String(q("#studio-product").value),
      );
      if ((!p && !uploadedImage) || !generated)
        return alert("Crie uma arte primeiro.");
      const date = q("#studio-date").value,
        time = q("#studio-time").value;
      if (!date || !time) return alert("Escolha a data e o horário.");
      const btn = q("#studio-use");
      btn.disabled = true;
      btn.textContent = "Salvando...";
      const base = concept(
          p || { name: "Produto personalizado" },
          q("#studio-goal").value,
          q("#studio-format").value,
          Math.max(0, variation - 1),
        ),
        design = {
          ...base,
          title: q("#studio-title").value.trim() || base.title,
          subtitle: q("#studio-subtitle").value.trim() || base.subtitle,
          cta: q("#studio-cta").value.trim() || base.cta,
          accent: q("#studio-accent").value || "#7ed321",
          brand: "Brinde On",
          slogan: "Sua marca sempre ligada",
          template: "premium",
          productImage: uploadedImage || p?.image || "",
        };
      try {
        await saveCloud({
          id: existing?.id,
          productId: p?.id || null,
          productName: p?.name || "Produto personalizado",
          image: uploadedImage || p?.image || "",
          caption: `${design.title} ${design.subtitle} ${design.cta}`.trim(),
          date,
          time,
          status: existing?.status || "rascunho",
          brief: q("#studio-brief").value.trim(),
          design,
        });
        close();
        await window.KodaMarketing?.refresh?.();
      } catch (e) {
        console.error(e);
        alert("Não foi possível salvar o conteúdo na nuvem.");
        btn.disabled = false;
        btn.textContent = existing
          ? "Salvar alterações"
          : "Aprovar e adicionar ao calendário";
      }
    };
    if (existing) render();
  }
  window.KodaMarketingStudio = {
    open: () => openStudio(),
    openEdit: (p) => openStudio(p),
  };
})();
