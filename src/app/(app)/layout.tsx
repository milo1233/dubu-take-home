import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "친구";

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/chat" className="flex items-center gap-2 font-bold">
            <span className="text-2xl">🦕</span>
            <span>두부</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-zinc-600">
            <Link href="/chat" className="hover:text-zinc-900">
              대화하기
            </Link>
            <Link href="/history" className="hover:text-zinc-900">
              지난 대화
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-600 max-w-[180px] truncate">
            {displayName}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-md border border-zinc-200 px-3 py-1 text-zinc-600 hover:bg-zinc-50"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
