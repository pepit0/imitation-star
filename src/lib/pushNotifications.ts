import { createAdminClient } from "@/lib/supabase/admin";

export type PushPlatform = "ios" | "android" | "web" | string;

export type NotificationEventType =
  | "follow"
  | "followee_posted"
  | "post_starred"
  | "pack_starred"
  | "followee_pack"
  | "pack_used";

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound?: "default" | null;
  data?: Record<string, unknown>;
};

async function tokensForUsers(userIds: string[]): Promise<string[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const admin = createAdminClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("push_tokens")
    .select("token")
    .in("user_id", unique);

  if (error || !data) return [];
  return [
    ...new Set(
      data
        .map((row) => row.token as string)
        .filter((t) => typeof t === "string" && t.length > 0)
    ),
  ];
}

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  // Expo Push API — chunks of 100
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });
    } catch (e) {
      console.warn("Expo push send failed:", e);
    }
  }
}

export async function notifyUsers(input: {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const tokens = await tokensForUsers(input.userIds);
  if (tokens.length === 0) return;

  await sendExpoPush(
    tokens.map((to) => ({
      to,
      title: input.title,
      body: input.body,
      sound: "default",
      data: input.data,
    }))
  );
}

export async function dispatchNotificationEvent(input: {
  type: NotificationEventType;
  actorId: string;
  actorName?: string;
  targetUserId?: string;
  postId?: string;
  packId?: string;
  packTitle?: string;
  packOwnerId?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  const name = input.actorName?.trim() || "Someone";
  const data = {
    type: input.type,
    postId: input.postId,
    packId: input.packId,
  };

  switch (input.type) {
    case "follow": {
      if (!input.targetUserId || input.targetUserId === input.actorId) return;
      await notifyUsers({
        userIds: [input.targetUserId],
        title: "New follower",
        body: `${name} followed you`,
        data,
      });
      return;
    }
    case "followee_posted": {
      const { data: followers } = await admin
        .from("follows")
        .select("follower_id")
        .eq("following_id", input.actorId);
      const ids = (followers ?? [])
        .map((r) => r.follower_id as string)
        .filter((id) => id !== input.actorId);
      await notifyUsers({
        userIds: ids,
        title: "New dub",
        body: `${name} posted a dub${input.packTitle ? `: ${input.packTitle}` : ""}`,
        data,
      });
      return;
    }
    case "post_starred": {
      if (!input.targetUserId || input.targetUserId === input.actorId) return;
      await notifyUsers({
        userIds: [input.targetUserId],
        title: "New star",
        body: `${name} starred your dub`,
        data,
      });
      return;
    }
    case "pack_starred": {
      const owner = input.packOwnerId;
      if (!owner || owner === input.actorId) return;
      // Avoid double-notify when the post author is also the pack owner
      // (they already get post_starred).
      if (owner === input.targetUserId) return;
      await notifyUsers({
        userIds: [owner],
        title: "Pack starred",
        body: `${name} starred your pack${
          input.packTitle ? `: ${input.packTitle}` : ""
        }`,
        data,
      });
      return;
    }
    case "followee_pack": {
      const { data: followers } = await admin
        .from("follows")
        .select("follower_id")
        .eq("following_id", input.actorId);
      const ids = (followers ?? [])
        .map((r) => r.follower_id as string)
        .filter((id) => id !== input.actorId);
      await notifyUsers({
        userIds: ids,
        title: "New pack",
        body: `${name} published a pack${
          input.packTitle ? `: ${input.packTitle}` : ""
        }`,
        data,
      });
      return;
    }
    case "pack_used": {
      const owner = input.packOwnerId ?? input.targetUserId;
      if (!owner || owner === input.actorId) return;
      await notifyUsers({
        userIds: [owner],
        title: "Your pack was dubbed",
        body: `${name} posted a dub using your pack${
          input.packTitle ? ` (${input.packTitle})` : ""
        }`,
        data,
      });
      return;
    }
    default:
      return;
  }
}

/** Fire-and-forget from the browser (uses the user's session cookie). */
export function emitNotificationEvent(body: {
  type: NotificationEventType;
  targetUserId?: string;
  postId?: string;
  packId?: string;
  packTitle?: string;
  packOwnerId?: string | null;
  actorName?: string;
}): void {
  if (typeof window === "undefined") return;
  void fetch("/api/notifications/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}
