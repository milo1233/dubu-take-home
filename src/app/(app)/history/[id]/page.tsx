import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id,title,started_at,ended_at")
    .eq("id", id)
    .maybeSingle();

  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("id,role,content,created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const items = (messages ?? []) as Message[];

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto p-6">
      <div className="w-full max-w-2xl">
        <Link
          href="/history"
          className="mb-4 inline-block text-sm text-zinc-500 hover:text-zinc-800"
        >
          ‹ 목록으로
        </Link>
        <h1 className="mb-1 text-2xl font-bold">
          {conversation.title ?? "두부와의 대화"}
        </h1>
        <p className="mb-6 text-xs text-zinc-500">
          {new Date(conversation.started_at).toLocaleString("ko-KR")}
        </p>

        {items.length === 0 ? (
          <p className="text-zinc-500">메시지가 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((m) => (
              <li
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-amber-500 text-white"
                      : "bg-white text-zinc-800 border border-zinc-200"
                  }`}
                >
                  {m.content}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
