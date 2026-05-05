import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Role = "user" | "assistant" | "system";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { role: Role; content: string }
    | { messages: { role: Role; content: string }[] }
    | null;

  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const rows =
    "messages" in body
      ? body.messages
      : [{ role: body.role, content: body.content }];

  const valid = rows.filter(
    (m) =>
      m &&
      typeof m.content === "string" &&
      m.content.trim().length > 0 &&
      ["user", "assistant", "system"].includes(m.role),
  );
  if (valid.length === 0) {
    return NextResponse.json({ error: "no_valid_messages" }, { status: 400 });
  }

  const { error } = await supabase.from("messages").insert(
    valid.map((m) => ({
      conversation_id: id,
      role: m.role,
      content: m.content,
    })),
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 첫 user 메시지가 들어오면 conversation 제목을 자동 설정 (없는 경우에만).
  const firstUser = valid.find((m) => m.role === "user");
  if (firstUser) {
    const candidate = firstUser.content.trim().slice(0, 30);
    await supabase
      .from("conversations")
      .update({ title: candidate })
      .eq("id", id)
      .is("title", null);
  }

  return NextResponse.json({ ok: true, inserted: valid.length });
}
