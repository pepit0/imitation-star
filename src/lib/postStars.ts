import { createClient } from "@/lib/supabase/client";
import { emitNotificationEvent } from "@/lib/pushNotifications";

export type ToggleStarResult = {
  starred: boolean;
  starCount: number;
  authorId: string;
  packId: string;
  packOwnerId: string | null;
};

export async function togglePostStar(postId: string): Promise<ToggleStarResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("toggle_post_star", {
    p_post_id: postId,
  });

  if (error) throw error;

  const row = data as {
    starred?: boolean;
    starCount?: number;
    authorId?: string;
    packId?: string;
    packOwnerId?: string | null;
  };

  const result: ToggleStarResult = {
    starred: Boolean(row?.starred),
    starCount: typeof row?.starCount === "number" ? row.starCount : 0,
    authorId: row?.authorId ?? "",
    packId: row?.packId ?? "",
    packOwnerId: row?.packOwnerId ?? null,
  };

  if (result.starred) {
    emitNotificationEvent({
      type: "post_starred",
      targetUserId: result.authorId,
      postId,
      packId: result.packId,
      packOwnerId: result.packOwnerId,
    });
    emitNotificationEvent({
      type: "pack_starred",
      targetUserId: result.authorId,
      postId,
      packId: result.packId,
      packOwnerId: result.packOwnerId,
    });
  }

  return result;
}

export async function listStarredPostIds(): Promise<string[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("post_stars")
    .select("post_id")
    .eq("user_id", user.id);

  if (error) return [];
  return (data ?? []).map((r) => r.post_id as string);
}
