"use client";

import { useCallback, useRef, useState } from "react";
import { useRealtimeAgent } from "@/lib/realtime/useRealtimeAgent";
import ConnectionStatus from "./ConnectionStatus";
import ConversationView from "./ConversationView";

export default function VoiceSession() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  const persistMessage = useCallback(
    async (role: "user" | "assistant", content: string) => {
      const id = conversationIdRef.current;
      if (!id || !content.trim()) return;
      try {
        await fetch(`/api/conversations/${id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, content }),
        });
      } catch (e) {
        console.warn("persist failed", e);
      }
    },
    [],
  );

  const {
    status,
    error,
    transcript,
    micLevel,
    start,
    stop,
    audioElRef,
  } = useRealtimeAgent({
    onUserTurnComplete: (text) => persistMessage("user", text),
    onAssistantTurnComplete: (text) => persistMessage("assistant", text),
  });

  const handleStart = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = (await res.json()) as { id: string };
        setConversationId(data.id);
        conversationIdRef.current = data.id;
      }
    } catch (e) {
      console.warn("create conversation failed", e);
    }
    await start();
  }, [start]);

  const handleStop = useCallback(async () => {
    stop();
    const id = conversationIdRef.current;
    if (id) {
      try {
        await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ended_at: new Date().toISOString() }),
        });
      } catch {
        /* noop */
      }
    }
    conversationIdRef.current = null;
    setConversationId(null);
  }, [stop]);

  const isActive =
    status === "live" ||
    status === "connecting" ||
    status === "fetching-token" ||
    status === "requesting-mic";

  const orbScale = 1 + micLevel * 0.6;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 상단: 상태 + 오브 + 시작/종료 버튼 (고정) */}
      <div className="flex flex-shrink-0 flex-col items-center border-b border-zinc-200/60 bg-white/40 pb-4 pt-3 backdrop-blur-sm">
        <div className="flex w-full items-center justify-between px-1">
          <ConnectionStatus status={status} />
          {conversationId && (
            <span className="text-xs text-zinc-500">
              세션 {conversationId.slice(0, 8)}
            </span>
          )}
        </div>

        <div
          className={`mt-3 flex h-24 w-24 items-center justify-center rounded-full transition-transform duration-100 ${
            status === "live"
              ? "bg-gradient-to-br from-amber-300 to-rose-300"
              : "bg-zinc-200"
          }`}
          style={{ transform: `scale(${orbScale})` }}
        >
          <span className="text-4xl">🦕</span>
        </div>

        <div className="mt-3">
          {!isActive ? (
            <button
              onClick={handleStart}
              className="rounded-full bg-amber-500 px-7 py-2.5 text-sm font-medium text-white shadow-md transition hover:bg-amber-600"
            >
              {status === "ended" ? "다시 대화 시작" : "대화 시작"}
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="rounded-full bg-rose-500 px-7 py-2.5 text-sm font-medium text-white shadow-md transition hover:bg-rose-600"
              disabled={status !== "live"}
            >
              {status === "live" ? "대화 종료" : "연결 중…"}
            </button>
          )}
        </div>

        {error && (
          <p className="mt-3 max-w-md rounded-md bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>

      {/* 하단: 대화 버블 (스크롤) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        <ConversationView items={transcript} />
      </div>

      {/* 원격 음성 출력 (보이지 않음) */}
      <audio ref={audioElRef} autoPlay playsInline className="hidden" />
    </div>
  );
}
