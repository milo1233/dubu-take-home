"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginInner() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/chat";
  const error = params.get("error");
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      console.error(error);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-amber-50 to-rose-50 p-6">
      <div className="flex flex-col items-center gap-2">
        <span className="text-5xl">🦕</span>
        <h1 className="text-3xl font-bold text-zinc-900">두부랑 이야기해요</h1>
        <p className="text-zinc-600">친구 두부와 목소리로 대화해보세요</p>
      </div>

      <button
        onClick={signInWithGoogle}
        disabled={loading}
        className="flex items-center gap-3 rounded-full bg-white px-6 py-3 font-medium text-zinc-800 shadow-md transition hover:shadow-lg disabled:opacity-60"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
          />
        </svg>
        {loading ? "이동 중..." : "Google로 로그인"}
      </button>

      {error && (
        <p className="text-sm text-rose-600">로그인에 실패했어요. 다시 시도해주세요.</p>
      )}

      <p className="max-w-sm text-center text-xs text-zinc-500">
        로그인하면 대화 내용이 안전하게 저장되어 다음에 다시 볼 수 있어요.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
