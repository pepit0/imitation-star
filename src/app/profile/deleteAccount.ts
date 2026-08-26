"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DUB_PACKS_BUCKET } from "@/lib/cloudPacks";
import { SUPPORT_EMAIL } from "@/lib/legal";
import type { DubPostTake } from "@/lib/cloudPosts";
import type { CloudProgressTake } from "@/lib/cloudPackProgress";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string };

function takePaths(takes: DubPostTake[] | null | undefined): string[] {
  return (takes ?? [])
    .map((t) => t.audioPath)
    .filter((p): p is string => Boolean(p));
}

async function removeStoragePaths(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  paths: string[]
): Promise<void> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return;

  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    await admin.storage.from(DUB_PACKS_BUCKET).remove(chunk).catch(() => undefined);
  }
}

/** Permanently delete the signed-in user and associated data (App Store requirement). */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      error: `Account deletion is not configured on this server. Email ${SUPPORT_EMAIL} to request deletion.`,
    };
  }

  const userId = user.id;
  const storagePaths: string[] = [];

  const { data: posts } = await admin
    .from("dub_posts")
    .select("id, takes")
    .eq("author_id", userId);

  for (const post of posts ?? []) {
    storagePaths.push(...takePaths(post.takes as DubPostTake[] | null));
  }

  const { data: packs } = await admin
    .from("dub_packs")
    .select("video_path, thumb_path, backing_path, vocals_path")
    .eq("owner_id", userId);

  for (const pack of packs ?? []) {
    for (const path of [
      pack.video_path,
      pack.thumb_path,
      pack.backing_path,
      pack.vocals_path,
    ]) {
      if (path) storagePaths.push(path);
    }
  }

  const { data: createdCollabs } = await admin
    .from("collab_dubs")
    .select("id")
    .eq("creator_id", userId);

  const createdCollabIds = (createdCollabs ?? []).map((c) => c.id as string);

  if (createdCollabIds.length > 0) {
    const { data: assignments } = await admin
      .from("collab_line_assignments")
      .select("audio_path")
      .in("collab_id", createdCollabIds);

    for (const row of assignments ?? []) {
      if (row.audio_path) storagePaths.push(row.audio_path as string);
    }

    await admin
      .from("collab_line_assignments")
      .delete()
      .in("collab_id", createdCollabIds);
    await admin.from("collab_invites").delete().in("collab_id", createdCollabIds);
    await admin.from("collab_dubs").delete().in("id", createdCollabIds);
  }

  await admin.from("collab_line_assignments").delete().eq("assignee_id", userId);
  await admin.from("collab_invites").delete().eq("user_id", userId);
  await admin.from("dub_posts").delete().eq("author_id", userId);
  await admin.from("dub_packs").delete().eq("owner_id", userId);

  const { data: progressRows } = await admin
    .from("pack_progress")
    .select("takes")
    .eq("user_id", userId);
  for (const row of progressRows ?? []) {
    for (const take of (row.takes as CloudProgressTake[] | null) ?? []) {
      if (take.audioPath) storagePaths.push(take.audioPath);
    }
  }
  await admin.from("pack_progress").delete().eq("user_id", userId);

  await admin.from("follows").delete().eq("follower_id", userId);
  await admin.from("follows").delete().eq("following_id", userId);
  await admin.from("profiles").delete().eq("id", userId);

  await removeStoragePaths(admin, storagePaths);

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    return { ok: false, error: deleteUserError.message };
  }

  await supabase.auth.signOut();

  return { ok: true };
}
