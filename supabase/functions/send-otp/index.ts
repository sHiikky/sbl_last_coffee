// supabase/functions/send-otp/index.ts
// Отправляет код подтверждения на телефон через Telegram Gateway
// (gateway.telegram.org) — SMS через Twilio ненадёжен для российских номеров.
// Telegram сам генерирует и хранит код (code_length), мы только запоминаем
// request_id в phone_verifications, чтобы сверить его в verify-otp.
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

const TELEGRAM_GATEWAY_TOKEN = Deno.env.get("TELEGRAM_GATEWAY_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isValidE164(phone: string) {
  return /^\+[1-9]\d{9,14}$/.test(phone);
}

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

    const { phone } = await req.json();
    if (typeof phone !== "string" || !isValidE164(phone)) {
      return Response.json({ error: "Некорректный номер телефона" }, { status: 400, headers: corsHeaders });
    }

    const gatewayResponse = await fetch("https://gatewayapi.telegram.org/sendVerificationMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TELEGRAM_GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone_number: phone, code_length: 6, ttl: 300 }),
    });
    const gatewayData = await gatewayResponse.json();

    if (!gatewayResponse.ok || !gatewayData.ok) {
      console.error("[send-otp] Telegram Gateway error", gatewayData);
      return Response.json(
        { error: gatewayData.error || "Не удалось отправить код через Telegram" },
        { status: 502, headers: corsHeaders },
      );
    }

    const requestId = gatewayData.result.request_id as string;

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: insertError } = await adminClient.from("phone_verifications").insert({
      user_id: user.id,
      phone,
      request_id: requestId,
    });
    if (insertError) throw insertError;

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("[send-otp] unexpected error", error);
    return Response.json({ error: "Внутренняя ошибка сервера" }, { status: 500, headers: corsHeaders });
  }
});
