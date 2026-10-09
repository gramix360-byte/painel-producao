import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sendPush(action: string, orderNumber: string, customerName: string) {
  const apiKey = Deno.env.get("ONESIGNAL_API_KEY"), appId = Deno.env.get("ONESIGNAL_APP_ID");
  if (!apiKey || !appId) {
    console.error("OneSignal secrets missing");
    return;
  }
  const approved = action === "approved";
  const title = approved ? "✅ Arte aprovada" : "✏️ Alteração solicitada na arte";
  const message = approved
    ? `Pedido #${orderNumber || "—"} · ${customerName || "Cliente"} · pronto para iniciar a produção`
    : `Pedido #${orderNumber || "—"} · ${customerName || "Cliente"}`;
  const response = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
    body: JSON.stringify({
      app_id: appId,
      target_channel: "push",
      include_subscription_ids: ["d6bbc545-583b-40a2-a882-3c32547b59b2", "1470047e-5a55-4a80-a0cd-57b945b94764"],
      headings: { en: title, pt: title },
      contents: { en: message, pt: message },
      url: "https://gramix360-byte.github.io/painel-producao/?source=artwork",
      data: { event: approved ? "artwork_approved" : "artwork_changes_requested" },
    }),
  });
  if (!response.ok) console.error("OneSignal", response.status, await response.text());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url), token = url.searchParams.get("token") || "";
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Link inválido." }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: approval, error } = await supabase.from("artwork_approvals").select("id,order_id,status,customer_comment,responded_at,expires_at,orders(order_number,customer_name),order_files(storage_path,mime_type,file_name)").eq("public_token", token).maybeSingle();
    if (error || !approval) return json({ error: "Aprovação não encontrada." }, 404);
    if (new Date(approval.expires_at).getTime() < Date.now()) return json({ error: "Este link expirou." }, 410);
    if (req.method === "GET" && url.searchParams.get("image") === "1") {
      const file = Array.isArray(approval.order_files) ? approval.order_files[0] : approval.order_files;
      const { data, error: downloadError } = await supabase.storage.from("client-files").download(file.storage_path);
      if (downloadError || !data) return json({ error: "Imagem indisponível." }, 404);
      return new Response(data, { headers: { ...cors, "Content-Type": file.mime_type || "image/jpeg", "Cache-Control": "private, max-age=300" } });
    }
    if (req.method === "GET") {
      const order = Array.isArray(approval.orders) ? approval.orders[0] : approval.orders;
      const file = Array.isArray(approval.order_files) ? approval.order_files[0] : approval.order_files;
      if (!file?.storage_path) return json({ error: "Imagem da prévia não encontrada." }, 404);
      const { data: signed, error: signedError } = await supabase.storage.from("client-files").createSignedUrl(file.storage_path, 3600);
      if (signedError || !signed?.signedUrl) {
        console.error("signed_url_failed", signedError);
        return json({ error: "Imagem da prévia indisponível." }, 404);
      }
      return json({ status: approval.status, comment: approval.customer_comment, responded_at: approval.responded_at, order_number: order?.order_number, customer_name: order?.customer_name, file_name: file?.file_name, image_url: signed.signedUrl });
    }
    if (req.method === "POST") {
      const body = await req.json(), action = body.action;
      if (!["approved", "changes_requested"].includes(action)) return json({ error: "Resposta inválida." }, 400);
      const comment = String(body.comment || "").trim().slice(0, 2000);
      if (action === "changes_requested" && !comment) return json({ error: "Informe a alteração desejada." }, 400);
      if (approval.status === action) return json({ ok: true, status: action, duplicate: true });
      const now = new Date().toISOString();
      const { error: updateError } = await supabase.from("artwork_approvals").update({ status: action, customer_comment: comment || null, responded_at: now, updated_at: now }).eq("id", approval.id);
      if (updateError) throw updateError;
      const orderUpdate = action === "approved"
        ? { artwork_status: "approved", phase: "arte_aprovada", status: "aguardando", started_at: null, updated_at: now }
        : { artwork_status: "changes_requested", phase: "arte_em_criacao", status: "aguardando", updated_at: now };
      const { error: orderError } = await supabase.from("orders").update(orderUpdate).eq("id", approval.order_id);
      if (orderError) throw orderError;
      const order = Array.isArray(approval.orders) ? approval.orders[0] : approval.orders;
      await sendPush(action, String(order?.order_number || ""), String(order?.customer_name || ""));
      return json({ ok: true, status: action, production_ready: action === "approved" });
    }
    return json({ error: "Método não permitido." }, 405);
  } catch (error) {
    console.error(error);
    return json({ error: "Não foi possível registrar a resposta." }, 500);
  }
});
