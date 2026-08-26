import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Register / refresh an Expo push token for the signed-in user. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { token?: string; platform?: string };
  try {
    body = (await request.json()) as { token?: string; platform?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Missing push token." }, { status: 400 });
  }

  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: user.id,
      token,
      platform: body.platform ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let token: string | undefined;
  try {
    const body = (await request.json()) as { token?: string };
    token = body.token?.trim();
  } catch {
    /* delete all for user */
  }

  let query = supabase.from("push_tokens").delete().eq("user_id", user.id);
  if (token) query = query.eq("token", token);
  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
