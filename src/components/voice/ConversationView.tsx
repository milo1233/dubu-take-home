"use client";

import { useEffect, useRef } from "react";
import type { TranscriptItem } from "@/lib/realtime/useRealtimeAgent";

export default function ConversationView({
  items,
}: {
  items: TranscriptItem[];
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-400">
        <p className="text-sm">대화가 시작되면 여기에 표시돼요</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2 py-4">
      {items.map((m) => (
        <li
          key={m.id}
          className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-sm ${
              m.role === "user"
                ? "bg-amber-500 text-white"
                : "bg-white text-zinc-800 border border-zinc-200"
            } ${m.done ? "" : "opacity-90"}`}
          >
            {m.text || (m.role === "user" ? "…" : "두부가 듣고 있어요")}
          </div>
        </li>
      ))}
      <div ref={endRef} />
    </ul>
  );
}
