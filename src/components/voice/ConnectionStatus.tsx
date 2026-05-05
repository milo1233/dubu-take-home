import type { ConnectionStatus as Status } from "@/lib/realtime/useRealtimeAgent";

const LABELS: Record<Status, { text: string; color: string }> = {
  idle: { text: "대기 중", color: "bg-zinc-200 text-zinc-700" },
  "requesting-mic": {
    text: "마이크 권한 요청 중…",
    color: "bg-amber-100 text-amber-800",
  },
  "fetching-token": {
    text: "세션 준비 중…",
    color: "bg-amber-100 text-amber-800",
  },
  connecting: {
    text: "두부와 연결 중…",
    color: "bg-amber-100 text-amber-800",
  },
  live: { text: "대화 중", color: "bg-emerald-100 text-emerald-800" },
  ended: { text: "대화 종료", color: "bg-zinc-200 text-zinc-700" },
  error: { text: "오류", color: "bg-rose-100 text-rose-800" },
};

export default function ConnectionStatus({ status }: { status: Status }) {
  const { text, color } = LABELS[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${color}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "live"
            ? "bg-emerald-500 animate-pulse"
            : status === "error"
              ? "bg-rose-500"
              : "bg-current opacity-60"
        }`}
      />
      {text}
    </span>
  );
}
