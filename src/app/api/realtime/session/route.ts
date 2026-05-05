import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DUBU_SYSTEM_PROMPT } from "@/lib/prompts/system";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY missing on server" },
      { status: 500 },
    );
  }

  const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
  const voice = process.env.OPENAI_REALTIME_VOICE ?? "alloy";

  const upstream = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      modalities: ["audio", "text"],
      instructions: DUBU_SYSTEM_PROMPT,
      input_audio_transcription: { model: "whisper-1", language: "ko" },
      turn_detection: {
        type: "server_vad",
        // 환각 transcript("MBC 뉴스 ○○입니다", "Thank you" 등)를 줄이려면
        // VAD 트리거 자체를 더 보수적으로. 0.7로 올림.
        threshold: 0.7,
        prefix_padding_ms: 300,
        // 어린이 발화 사이 호흡을 turn 종료로 오인하지 않도록 길게.
        silence_duration_ms: 800,
      },
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    return NextResponse.json(
      { error: "openai_session_failed", detail },
      { status: 502 },
    );
  }

  const session = await upstream.json();

  return NextResponse.json({
    client_secret: session.client_secret,
    model,
    voice,
    expires_at: session.client_secret?.expires_at ?? null,
  });
}
