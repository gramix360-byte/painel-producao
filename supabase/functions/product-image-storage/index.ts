import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AN = Deno.env.get("SUPABASE_ANON_KEY")!;
const C = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-product-id, x-file-name",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...C, "Content-Type": "application/json" } });

async function getUser(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const response = await fetch(`${U}/auth/v1/user`, {
    headers: { apikey: AN, Authorization: `Bearer ${token}` },
  });
  return response.ok ? await response.json() : null;
}

async function rest(path: string, init: RequestInit = {}) {
  return fetch(`${U}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SR,
      Authorization: `Bearer ${SR}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function canManageProducts(userId: string) {
  const response = await rest(
    `user_profiles?select=role,active&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  if (!response.ok) return false;
  const profile = (await response.json())[0];
  return profile?.active === true && ["admin", "vendas"].includes(profile.role);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: C });

  try {
    const user = await getUser(req);
    if (!user?.id) return json({ error: "Sessão inválida" }, 401);
    if (!(await canManageProducts(user.id))) return json({ error: "Sem permissão para alterar imagens de produtos" }, 403);

    if (req.method === "POST") {
      const productId = (req.headers.get("x-product-id") || "").trim();
      if (!productId) return json({ error: "Produto não informado" }, 400);

      const productResponse = await rest(
        `products?select=id&id=eq.${encodeURIComponent(productId)}&deleted_at=is.null&limit=1`,
      );
      if (!productResponse.ok || !(await productResponse.json())[0]) {
        return json({ error: "Produto não encontrado" }, 404);
      }

      const contentType = req.headers.get("content-type") || "application/octet-stream";
      if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
        return json({ error: "Formato de imagem não permitido" }, 400);
      }

      const data = new Uint8Array(await req.arrayBuffer());
      if (!data.length) return json({ error: "Arquivo vazio" }, 400);
      if (data.length > 5 * 1024 * 1024) return json({ error: "Imagem maior que 5 MB" }, 400);

      const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
      const path = `${productId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const upload = await fetch(`${U}/storage/v1/object/product-images/${path}`, {
        method: "POST",
        headers: {
          apikey: SR,
          Authorization: `Bearer ${SR}`,
          "Content-Type": contentType,
          "x-upsert": "false",
        },
        body: data,
      });
      if (!upload.ok) return json({ error: "Não foi possível salvar a imagem" }, 500);

      const current = await rest(
        `product_images?select=position&product_id=eq.${encodeURIComponent(productId)}&order=position.desc&limit=1`,
      );
      const rows = current.ok ? await current.json() : [];
      const position = rows.length ? Number(rows[0].position || 0) + 1 : 0;
      const imageUrl = `${U}/storage/v1/object/public/product-images/${path}`;
      const insert = await rest("product_images", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          product_id: productId,
          storage_path: path,
          image_url: imageUrl,
          position,
          is_primary: position === 0,
        }),
      });
      if (!insert.ok) {
        await fetch(`${U}/storage/v1/object/product-images/${path}`, {
          method: "DELETE",
          headers: { apikey: SR, Authorization: `Bearer ${SR}` },
        }).catch(() => {});
        return json({ error: "Não foi possível vincular a imagem ao produto" }, 500);
      }
      return json({ ok: true, image: (await insert.json())[0] || null });
    }

    if (req.method === "DELETE") {
      const body = await req.json().catch(() => ({}));
      const imageId = String(body.image_id || "").trim();
      if (!imageId) return json({ error: "Imagem não informada" }, 400);

      const query = await rest(`product_images?select=*&id=eq.${encodeURIComponent(imageId)}&limit=1`);
      const image = query.ok ? (await query.json())[0] : null;
      if (!image) return json({ error: "Imagem não encontrada" }, 404);

      if (image.storage_path) {
        await fetch(`${U}/storage/v1/object/product-images/${image.storage_path}`, {
          method: "DELETE",
          headers: { apikey: SR, Authorization: `Bearer ${SR}` },
        });
      }
      const remove = await rest(`product_images?id=eq.${encodeURIComponent(imageId)}`, { method: "DELETE" });
      if (!remove.ok) return json({ error: "Não foi possível excluir a imagem" }, 500);
      return json({ ok: true });
    }

    return json({ error: "Método não permitido" }, 405);
  } catch (error) {
    console.error(error);
    return json({ error: "Não foi possível concluir a operação com a imagem" }, 500);
  }
});
