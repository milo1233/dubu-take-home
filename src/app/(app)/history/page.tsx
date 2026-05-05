import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Conversation = {
  id: string;
  title: string | null;
  started_at: string;
  ended_at: string | null;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function HistoryPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,started_at,ended_at")
    .order("started_at", { ascending: false });

  const conversations = (data ?? []) as Conversation[];

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold">지난 대화</h1>
        {error && (
          <p className="rounded-md bg-rose-50 p-4 text-sm text-rose-600">
            대화를 불러오지 못했어요: {error.message}
          </p>
        )}
        {!error && conversations.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-500">
            아직 대화가 없어요. 두부와 첫 대화를 시작해볼까요?
            <div className="mt-4">
              <Link
                href="/chat"
                className="inline-block rounded-full bg-amber-500 px-4 py-2 text-white"
              >
                대화 시작하기
              </Link>
            </div>
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/history/${c.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 hover:border-amber-300 hover:shadow-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {c.title ?? "두부와의 대화"}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {formatDate(c.started_at)}
                    {c.ended_at ? "" : " · 진행 중"}
                  </span>
                </div>
                <span className="text-zinc-400">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
