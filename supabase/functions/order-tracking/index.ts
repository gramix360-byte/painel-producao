import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "GET") return json({ error: "Método não permitido." }, 405);
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Link inválido." }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: order, error } = await supabase.from("orders")
      .select("id,order_number,customer_name,due_date,estimated_completion_date,phase,status,artwork_status,quality_status,shipping_status,carrier,tracking_code,shipped_at,delivered_at,payment_status,order_items(quantity,product_name,personalization)")
      .eq("public_tracking_token", token).is("deleted_at", null).maybeSingle();
    if (error || !order) return json({ error: "Pedido não encontrado." }, 404);
    const { data: timeline } = await supabase.from("order_timeline").select("title,event_type,created_at").eq("order_id", order.id).order("created_at", { ascending: false }).limit(20);
    const name = String(order.customer_name || "Cliente").trim().split(/\s+/)[0];
    return json({
      order_number: order.order_number,
      customer_name: name,
      due_date: order.due_date,
      estimated_completion_date: order.estimated_completion_date,
      phase: order.phase,
      status: order.status,
      artwork_status: order.artwork_status,
      quality_status: order.quality_status,
      shipping_status: order.shipping_status,
      carrier: order.carrier,
      tracking_code: order.tracking_code,
      shipped_at: order.shipped_at,
      delivered_at: order.delivered_at,
      payment_status: order.payment_status,
      items: order.order_items || [],
      timeline: timeline || [],
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Não foi possível carregar o acompanhamento." }, 500);
  }
});
