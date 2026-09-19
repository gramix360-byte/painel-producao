(() => {
  const view = document.getElementById("view-marketing"),
    nav = document.getElementById("marketing-nav");
  if (!view || !nav) return;
  let posts = [],
    weekOffset = 0;
  const esc = (value = "") =>
    String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  async function headers() {
    const session = await PPAuth.getSession();
    if (!session?.access_token) throw new Error("Sessão expirada");
    return {
      apikey: PPAuth.key,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    };
  }
  const rowToPost = (row) => ({
    id: row.id,
    title: row.product_name || "Publicação",
    image: row.image || "",
    caption: row.caption || "",
    date: row.post_date || "",
    time: String(row.post_time || "").slice(0, 5),
    status: row.status || "agendado",
  });
  const postToRow = (post) => ({
    product_id: null,
    product_name: post.title || "Publicação",
    image: post.image || null,
    caption: post.caption || null,
    post_date: post.date || null,
    post_time: post.time || null,
    status: post.status || "agendado",
    brief: null,
    design: {},
    updated_at: new Date().toISOString(),
  });
  async function load() {
    const response = await fetch(
      `${PPAuth.url}/rest/v1/marketing_posts?select=*&order=post_date.asc,post_time.asc,created_at.desc`,
      { headers: await headers() },
    );
    if (!response.ok) throw new Error(await response.text());
    posts = (await response.json()).map(rowToPost);
    render();
  }
  async function savePost(post) {
    const editing = Boolean(post.id);
    const response = await fetch(
      editing
        ? `${PPAuth.url}/rest/v1/marketing_posts?id=eq.${encodeURIComponent(post.id)}`
        : `${PPAuth.url}/rest/v1/marketing_posts`,
      {
        method: editing ? "PATCH" : "POST",
        headers: { ...(await headers()), Prefer: "return=minimal" },
        body: JSON.stringify(postToRow(post)),
      },
    );
    if (!response.ok) throw new Error(await response.text());
    await load();
  }
  async function deletePost(id) {
    const response = await fetch(
      `${PPAuth.url}/rest/v1/marketing_posts?id=eq.${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: { ...(await headers()), Prefer: "return=minimal" },
      },
    );
    if (!response.ok) throw new Error(await response.text());
    await load();
  }
  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type))
        return reject(new Error("Escolha uma imagem PNG, JPG ou WebP."));
      if (file.size > 12 * 1024 * 1024)
        return reject(new Error("A imagem deve ter no máximo 12 MB."));
      const reader = new FileReader();
      reader.onerror = () =>
        reject(new Error("Não foi possível ler a imagem."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Arquivo de imagem inválido."));
        image.onload = () => {
          const max = 1800,
            scale = Math.min(1, max / Math.max(image.width, image.height)),
            canvas = document.createElement("canvas");
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          canvas
            .getContext("2d")
            .drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/webp", 0.88));
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }
  const statusLabel = (status) =>
    ({
      rascunho: "Rascunho",
      aprovado: "Aprovado",
      agendado: "Agendado",
      publicado: "Publicado",
    })[status] || status;
  function monday(offset = 0) {
    const now = new Date(),
      date = new Date(now),
      day = (now.getDay() + 6) % 7;
    date.setHours(0, 0, 0, 0);
    date.setDate(now.getDate() - day + offset * 7);
    return date;
  }
  function isoLocal(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function openEditor(existing = null) {
    let imageData = existing?.image || "";
    const modal = document.createElement("div"),
      today = isoLocal(new Date());
    modal.className = "marketing-modal-backdrop";
    modal.innerHTML = `<div class="marketing-modal marketing-upload-modal"><div class="marketing-modal-head"><div><h3>${existing ? "Editar publicação" : "Nova publicação"}</h3><div class="muted">Envie sua arte pronta e escolha quando pretende postar.</div></div><button class="marketing-close" type="button">×</button></div><div class="marketing-upload-grid"><div><label class="marketing-upload-box"><input id="marketing-art-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><span>+ Selecionar arte</span><small>PNG, JPG ou WebP · até 12 MB</small></label><div id="marketing-art-preview" class="marketing-art-preview">${imageData ? `<img src="${esc(imageData)}" alt="Prévia da arte">` : "<span>Nenhuma arte selecionada</span>"}</div></div><div class="marketing-upload-form"><label>Nome da publicação<input id="marketing-title" value="${esc(existing?.title || "")}" placeholder="Ex.: Chaveiro personalizado"></label><label>Legenda<textarea id="marketing-caption" rows="7" placeholder="Escreva a legenda que será usada na postagem...">${esc(existing?.caption || "")}</textarea></label><div class="marketing-form-grid"><label>Dia da postagem<input id="marketing-date" type="date" value="${esc(existing?.date || today)}"></label><label>Horário<input id="marketing-time" type="time" value="${esc(existing?.time || "10:00")}"></label></div><label>Status<select id="marketing-status"><option value="agendado" ${existing?.status === "agendado" || !existing ? "selected" : ""}>Agendado</option><option value="rascunho" ${existing?.status === "rascunho" ? "selected" : ""}>Rascunho</option><option value="publicado" ${existing?.status === "publicado" ? "selected" : ""}>Publicado</option></select></label></div></div><div id="marketing-upload-error" class="marketing-upload-error"></div><div class="marketing-modal-actions">${existing ? '<button class="button danger" id="marketing-delete" type="button">Excluir</button>' : ""}<button class="button secondary" id="marketing-cancel" type="button">Cancelar</button><button class="button primary" id="marketing-save" type="button">${existing ? "Salvar alterações" : "Adicionar ao calendário"}</button></div></div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove(),
      error = modal.querySelector("#marketing-upload-error"),
      preview = modal.querySelector("#marketing-art-preview");
    modal.querySelector(".marketing-close").onclick = close;
    modal.querySelector("#marketing-cancel").onclick = close;
    modal.querySelector("#marketing-art-file").onchange = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      error.textContent = "Preparando imagem...";
      try {
        imageData = await fileToImage(file);
        preview.innerHTML = `<img src="${esc(imageData)}" alt="Prévia da arte">`;
        error.textContent = "Arte carregada ✓";
      } catch (exception) {
        error.textContent = exception.message;
      }
    };
    modal.querySelector("#marketing-save").onclick = async () => {
      const title = modal.querySelector("#marketing-title").value.trim(),
        date = modal.querySelector("#marketing-date").value,
        time = modal.querySelector("#marketing-time").value;
      if (!imageData)
        return (error.textContent = "Selecione a arte da publicação.");
      if (!title) return (error.textContent = "Informe o nome da publicação.");
      if (!date || !time)
        return (error.textContent = "Escolha o dia e o horário da postagem.");
      const button = modal.querySelector("#marketing-save");
      button.disabled = true;
      button.textContent = "Salvando...";
      try {
        await savePost({
          id: existing?.id,
          title,
          image: imageData,
          caption: modal.querySelector("#marketing-caption").value.trim(),
          date,
          time,
          status: modal.querySelector("#marketing-status").value,
        });
        close();
      } catch (exception) {
        console.error(exception);
        error.textContent = "Não foi possível salvar. Tente novamente.";
        button.disabled = false;
        button.textContent = existing
          ? "Salvar alterações"
          : "Adicionar ao calendário";
      }
    };
    modal
      .querySelector("#marketing-delete")
      ?.addEventListener("click", async () => {
        if (!confirm("Excluir esta publicação do calendário?")) return;
        try {
          await deletePost(existing.id);
          close();
        } catch (exception) {
          console.error(exception);
          error.textContent = "Não foi possível excluir a publicação.";
        }
      });
  }
  function render() {
    const counts = { rascunho: 0, aprovado: 0, agendado: 0, publicado: 0 };
    posts.forEach(
      (post) => (counts[post.status] = (counts[post.status] || 0) + 1),
    );
    const base = monday(weekOffset),
      days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
    const week = days
      .map((name, index) => {
        const date = new Date(base);
        date.setDate(base.getDate() + index);
        const iso = isoLocal(date),
          dayPosts = posts.filter((post) => post.date === iso);
        return `<div class="marketing-day"><strong>${name}</strong><small>${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</small>${dayPosts.length ? dayPosts.map((post) => `<div class="marketing-post" role="button" tabindex="0" data-post="${post.id}">${post.image ? `<img src="${esc(post.image)}" alt="${esc(post.title)}">` : ""}<b>${esc(post.title)}</b><small>${esc(post.time || "Sem horário")}</small><span class="m-status-${post.status}">${statusLabel(post.status)}</span></div>`).join("") : '<div class="marketing-empty">Nenhuma publicação</div>'}</div>`;
      })
      .join("");
    view.innerHTML = `<div class="marketing-shell"><div class="marketing-hero"><div><h2>Marketing</h2><p>Envie suas artes prontas e organize o dia e o horário de cada postagem.</p></div><button class="button primary" id="marketing-new">+ Subir nova arte</button></div><div class="marketing-stats"><div class="marketing-stat"><span>Rascunhos</span><strong>${counts.rascunho}</strong></div><div class="marketing-stat"><span>Agendadas</span><strong>${counts.agendado}</strong></div><div class="marketing-stat"><span>Publicadas</span><strong>${counts.publicado}</strong></div><div class="marketing-stat"><span>Total de artes</span><strong>${posts.length}</strong></div></div><div class="marketing-panel"><div class="marketing-panel-head"><div><h3>Calendário de postagens</h3><small>Semana de ${base.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</small></div><div class="marketing-calendar-actions"><button class="button secondary" id="marketing-prev">Semana anterior</button><button class="button secondary" id="marketing-today">Hoje</button><button class="button secondary" id="marketing-next">Próxima semana</button></div></div><div class="marketing-week">${week}</div></div><div class="marketing-connect"><strong>Calendário sincronizado</strong><p>As artes, legendas, datas e horários ficam disponíveis nos computadores da Brinde On.</p></div></div>`;
    document.getElementById("marketing-new").onclick = () => openEditor();
    document.getElementById("marketing-prev").onclick = () => {
      weekOffset--;
      render();
    };
    document.getElementById("marketing-today").onclick = () => {
      weekOffset = 0;
      render();
    };
    document.getElementById("marketing-next").onclick = () => {
      weekOffset++;
      render();
    };
    view.querySelectorAll("[data-post]").forEach((card) => {
      const edit = () =>
        openEditor(
          posts.find((post) => String(post.id) === String(card.dataset.post)),
        );
      card.onclick = edit;
      card.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          edit();
        }
      };
    });
  }
  async function open() {
    document
      .querySelectorAll(".view")
      .forEach((item) => item.classList.remove("active"));
    document
      .querySelectorAll(".sidebar button")
      .forEach((item) => item.classList.remove("active"));
    view.classList.add("active");
    nav.classList.add("active");
    document.getElementById("page-title").textContent = "Marketing";
    document.getElementById("page-subtitle").textContent =
      "Artes prontas e calendário de postagens";
    view.innerHTML =
      '<div class="marketing-shell"><div class="marketing-panel">Carregando calendário...</div></div>';
    try {
      await load();
    } catch (exception) {
      console.error(exception);
      view.innerHTML =
        '<div class="marketing-shell"><div class="marketing-panel"><b>Não foi possível carregar o Marketing.</b><p>Atualize a página e tente novamente.</p></div></div>';
    }
  }
  nav.addEventListener("click", open);
  window.KodaMarketing = { open, refresh: load, getPosts: () => posts.slice() };
})();
