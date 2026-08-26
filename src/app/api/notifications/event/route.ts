import { NextResponse } from "next/server";
import {
  dispatchNotificationEvent,
  type NotificationEventType,
} from "@/lib/pushNotifications";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const TYPES = new Set<NotificationEventType>([
  "follow",
  "followee_posted",
  "post_starred",
  "pack_starred",
  "followee_pack",
  "pack_used",
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: {
    type?: string;
    targetUserId?: string;
    postId?: string;
    packId?: string;
    packTitle?: string;
    packOwnerId?: string | null;
    actorName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const type = body.type as NotificationEventType | undefined;
  if (!type || !TYPES.has(type)) {
    return NextResponse.json({ error: "Unknown event type." }, { status: 400 });
  }

  const admin = createAdminClient();
  let actorName = body.actorName?.trim();
  if (!actorName && admin) {
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, handle")
      .eq("id", user.id)
      .maybeSingle();
    actorName =
      (profile?.display_name as string | undefined) ||
      (profile?.handle ? `@${profile.handle}` : undefined) ||
      "Someone";
  }

  await dispatchNotificationEvent({
    type,
    actorId: user.id,
    actorName,
    targetUserId: body.targetUserId,
    postId: body.postId,
    packId: body.packId,
    packTitle: body.packTitle,
    packOwnerId: body.packOwnerId,
  });

  return NextResponse.json({ ok: true });
}
