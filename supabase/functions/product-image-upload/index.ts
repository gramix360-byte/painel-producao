import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const U = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AN = Deno.env.get("SUPABASE_ANON_KEY")!;
const C = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...C, "Content-Type": "application/json" } });

async function rest(path: string, init: RequestInit = {}) {
  return fetch(`${U}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

async function authenticatedProductManager(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const userResponse = await fetch(`${U}/auth/v1/user`, {
    headers: { apikey: AN, Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const profileResponse = await rest(
    `user_profiles?select=role,active&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
  );
  const profile = profileResponse.ok ? (await profileResponse.json())[0] : null;
  return profile?.active === true && ["admin", "vendas"].includes(profile.role) ? user : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: C });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const user = await authenticatedProductManager(req);
    if (!user) return json({ error: "Sem permissão para alterar imagens de produtos" }, 403);

    const form = await req.formData();
    const productId = String(form.get("product_id") || "").trim();
    const file = form.get("file");
    const position = Math.max(0, Number(form.get("position") || 0));
    if (!productId || !(file instanceof File)) return json({ error: "Produto e arquivo são obrigatórios" }, 400);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return json({ error: "Formato de imagem inválido" }, 400);
    if (file.size > 5 * 1024 * 1024) return json({ error: "Imagem maior que 5 MB" }, 400);

    const productResponse = await rest(
      `products?select=id&id=eq.${encodeURIComponent(productId)}&deleted_at=is.null&limit=1`,
    );
    if (!productResponse.ok || !(await productResponse.json())[0]) return json({ error: "Produto não encontrado" }, 404);

    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${productId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const upload = await fetch(`${U}/storage/v1/object/product-images/${path}`, {
      method: "POST",
      headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": file.type, "x-upsert": "false" },
      body: file,
    });
    if (!upload.ok) return json({ error: "Não foi possível salvar a imagem" }, 500);

    const imageUrl = `${U}/storage/v1/object/public/product-images/${path}`;
    const insert = await rest("product_images", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ product_id: productId, storage_path: path, image_url: imageUrl, position, is_primary: position === 0 }),
    });
    if (!insert.ok) {
      await fetch(`${U}/storage/v1/object/product-images/${path}`, {
        method: "DELETE",
        headers: { apikey: SR, Authorization: `Bearer ${SR}` },
      }).catch(() => {});
      return json({ error: "Não foi possível vincular a imagem ao produto" }, 500);
    }
    return json({ ok: true, image: (await insert.json())[0] });
  } catch (error) {
    console.error(error);
    return json({ error: "Não foi possível concluir o envio da imagem" }, 500);
  }
});
