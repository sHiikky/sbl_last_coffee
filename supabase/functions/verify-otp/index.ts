// supabase/functions/verify-otp/index.ts
// Сверяет код, введённый пользователем, с request_id из send-otp через
// Telegram Gateway checkVerificationStatus. При успехе привязывает телефон к
// текущему (анонимному) пользователю через admin.updateUserById — тот же
// auth.uid(), phone_confirmed_at выставляется реально (см.
// lib/supabaseClient.js hasVerifiedPhone), история заказов не теряется.
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

const TELEGRAM_GATEWAY_TOKEN = Deno.env.get("TELEGRAM_GATEWAY_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return Response.json({ error: "Missing Authorization header" }, { status: 401, headers: corsHeaders });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return Response.json({ error: "Not authenticated" }, { status: 401, headers: corsHeaders });
    }

    const { phone, code } = await req.json();
    if (typeof phone !== "string" || typeof code !== "string" || !code.trim()) {
      return Response.json({ error: "Некорректный запрос" }, { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: pending, error: pendingError } = await adminClient
      .from("phone_verifications")
      .select("id, request_id")
      .eq("user_id", user.id)
      .eq("phone", phone)
      .eq("consumed", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pendingError) throw pendingError;
    if (!pending) {
      return Response.json({ error: "Код не запрошен или уже истёк. Запросите новый." }, { status: 400, headers: corsHeaders });
    }

    const gatewayResponse = await fetch("https://gatewayapi.telegram.org/checkVerificationStatus", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TELEGRAM_GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ request_id: pending.request_id, code }),
    });
    const gatewayData = await gatewayResponse.json();

    if (!gatewayResponse.ok || !gatewayData.ok) {
      console.error("[verify-otp] Telegram Gateway error", gatewayData);
      return Response.json({ error: gatewayData.error || "Ошибка проверки кода" }, { status: 502, headers: corsHeaders });
    }

    const status = gatewayData.result.verification_status?.status;
    if (status !== "code_valid") {
      return Response.json({ error: "Неверный код. Проверьте и попробуйте снова." }, { status: 400, headers: corsHeaders });
    }

    await adminClient.from("phone_verifications").update({ consumed: true }).eq("id", pending.id);

    const { error: updateUserError } = await adminClient.auth.admin.updateUserById(user.id, {
      phone,
      phone_confirm: true,
    });
    if (updateUserError) throw updateUserError;

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("[verify-otp] unexpected error", error);
    return Response.json({ error: "Внутренняя ошибка сервера" }, { status: 500, headers: corsHeaders });
  }
});
