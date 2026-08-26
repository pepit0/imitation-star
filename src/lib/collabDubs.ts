"use client";

import type { DubLine, DubPack, RecordedLine } from "@/lib/types";
import type {
  CollabDetail,
  CollabDub,
  CollabInvite,
  CollabLineAssignment,
  CollabLineProgress,
  CollabPackSnapshot,
  CollabStatus,
  LineAssigneeMap,
} from "@/lib/types/collab";
import type { UserProfile } from "@/lib/types/social";
import { createClient } from "@/lib/supabase/client";
import { profileFromRow, PROFILE_SELECT, type ProfileRow } from "@/lib/supabase/profile";
import { DUB_PACKS_BUCKET, publicPackUrl } from "@/lib/cloudPacks";
import {
  publishDubPost,
  resolveTakeAudioUrl,
} from "@/lib/cloudPosts";

type CollabDubRow = {
  id: string;
  creator_id: string;
  pack_id: string;
  pack_title: string;
  pack_snapshot: CollabPackSnapshot;
  status: CollabStatus;
  caption: string;
  published_post_id: string | null;
  created_at: string;
  updated_at: string;
};

type CollabInviteRow = {
  id: string;
  collab_id: string;
  user_id: string;
  status: CollabInvite["status"];
  created_at: string;
  updated_at: string;
};

type CollabAssignmentRow = {
  id: string;
  collab_id: string;
  line_id: string;
  assignee_id: string;
  status: CollabLineAssignment["status"];
  audio_path: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

const COLLAB_SELECT =
  "id, creator_id, pack_id, pack_title, pack_snapshot, status, caption, published_post_id, created_at, updated_at";

function collabFromRow(row: CollabDubRow): CollabDub {
  return {
    id: row.id,
    creatorId: row.creator_id,
    packId: row.pack_id,
    packTitle: row.pack_title,
    packSnapshot: row.pack_snapshot,
    status: row.status,
    caption: row.caption ?? "",
    publishedPostId: row.published_post_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function inviteFromRow(row: CollabInviteRow): CollabInvite {
  return {
    id: row.id,
    collabId: row.collab_id,
    userId: row.user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assignmentFromRow(row: CollabAssignmentRow): CollabLineAssignment {
  return {
    id: row.id,
    collabId: row.collab_id,
    lineId: row.line_id,
    assigneeId: row.assignee_id,
    status: row.status,
    audioPath: row.audio_path ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function packSnapshotFromDubPack(pack: DubPack): CollabPackSnapshot {
  return {
    lines: pack.lines.map((line) => ({
      id: line.id,
      speaker: line.speaker,
      text: line.text,
      startMs: line.startMs,
      endMs: line.endMs,
    })),
    videoUrl: pack.videoUrl,
    backingUrl: pack.backingTrackUrl,
    thumbnailUrl: pack.thumbnailUrl,
    thumbnailColor: pack.thumbnailColor,
  };
}

export function dubPackFromSnapshot(
  collab: CollabDub,
  lineIds?: string[]
): DubPack {
  const lines = lineIds
    ? collab.packSnapshot.lines.filter((l) => lineIds.includes(l.id))
    : collab.packSnapshot.lines;

  return {
    id: collab.packId,
    title: collab.packTitle,
    description: "",
    creator: "",
    clipCount: lines.length,
    tags: [],
    playCount: 0,
    createdAt: collab.createdAt,
    thumbnailColor: collab.packSnapshot.thumbnailColor ?? "#FF5A36",
    thumbnailUrl: collab.packSnapshot.thumbnailUrl ?? "",
    lines,
    videoUrl: collab.packSnapshot.videoUrl,
    backingTrackUrl: collab.packSnapshot.backingUrl,
    source: "builtin",
  };
}

async function fetchProfilesMap(
  ids: string[]
): Promise<Map<string, UserProfile>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, UserProfile>();
  if (unique.length === 0) return map;

  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      PROFILE_SELECT
    )
    .in("id", unique);

  for (const row of (data as ProfileRow[] | null) ?? []) {
    map.set(row.id, profileFromRow(row));
  }
  return map;
}

async function refreshCollabStatus(collabId: string): Promise<void> {
  const supabase = createClient();

  const [{ data: collab }, { data: invites }, { data: assignments }] =
    await Promise.all([
      supabase.from("collab_dubs").select("status").eq("id", collabId).single(),
      supabase.from("collab_invites").select("status").eq("collab_id", collabId),
      supabase
        .from("collab_line_assignments")
        .select("status")
        .eq("collab_id", collabId),
    ]);

  if (!collab || collab.status === "published" || collab.status === "cancelled") {
    return;
  }

  const inviteRows = (invites ?? []) as { status: string }[];
  const assignmentRows = (assignments ?? []) as { status: string }[];

  const allSubmitted =
    assignmentRows.length > 0 &&
    assignmentRows.every((a) => a.status === "submitted");

  const anyAccepted = inviteRows.some((i) => i.status === "accepted");
  const allResponded = inviteRows.every(
    (i) => i.status === "accepted" || i.status === "declined"
  );

  let nextStatus: CollabStatus = "inviting";
  if (allSubmitted) {
    nextStatus = "ready";
  } else if (anyAccepted) {
    nextStatus = "in_progress";
  } else if (allResponded && !anyAccepted) {
    nextStatus = "inviting";
  }

  await supabase
    .from("collab_dubs")
    .update({ status: nextStatus })
    .eq("id", collabId);
}

async function buildCollabDetail(row: CollabDubRow): Promise<CollabDetail> {
  const supabase = createClient();
  const collab = collabFromRow(row);

  const [{ data: inviteData }, { data: assignmentData }] = await Promise.all([
    supabase.from("collab_invites").select("*").eq("collab_id", collab.id),
    supabase
      .from("collab_line_assignments")
      .select("*")
      .eq("collab_id", collab.id),
  ]);

  const invites = ((inviteData as CollabInviteRow[] | null) ?? []).map(
    inviteFromRow
  );
  const assignments = (
    (assignmentData as CollabAssignmentRow[] | null) ?? []
  ).map(assignmentFromRow);

  const profileIds = [
    collab.creatorId,
    ...assignments.map((a) => a.assigneeId),
  ];
  const profiles = await fetchProfilesMap(profileIds);

  const lineById = new Map(collab.packSnapshot.lines.map((l) => [l.id, l]));

  const assignmentProgress: CollabLineProgress[] = assignments.map((a) => ({
    ...a,
    line: lineById.get(a.lineId) ?? {
      id: a.lineId,
      speaker: "?",
      text: "",
      startMs: 0,
      endMs: 0,
    },
    assignee: profiles.get(a.assigneeId),
  }));

  return {
    ...collab,
    invites,
    assignments: assignmentProgress,
    creator: profiles.get(collab.creatorId),
  };
}

export async function createCollabDub(input: {
  creatorId: string;
  pack: DubPack;
  assignments: LineAssigneeMap;
  caption?: string;
}): Promise<CollabDetail> {
  const supabase = createClient();
  const snapshot = packSnapshotFromDubPack(input.pack);

  if (snapshot.lines.some((line) => !input.assignments[line.id])) {
    throw new Error("Every line must be assigned to a player.");
  }

  const { data: collabRow, error: collabError } = await supabase
    .from("collab_dubs")
    .insert({
      creator_id: input.creatorId,
      pack_id: input.pack.id,
      pack_title: input.pack.title,
      pack_snapshot: snapshot,
      caption: input.caption?.trim() ?? "",
      status: "inviting",
    })
    .select(COLLAB_SELECT)
    .single();

  if (collabError || !collabRow) throw collabError ?? new Error("Create failed");

  const collabId = (collabRow as CollabDubRow).id;

  const assignmentRows = snapshot.lines.map((line) => ({
    collab_id: collabId,
    line_id: line.id,
    assignee_id: input.assignments[line.id],
    status: "assigned" as const,
  }));

  const { error: assignError } = await supabase
    .from("collab_line_assignments")
    .insert(assignmentRows);
  if (assignError) throw assignError;

  const uniqueAssignees = [...new Set(Object.values(input.assignments))];
  const inviteRows = uniqueAssignees.map((userId) => ({
    collab_id: collabId,
    user_id: userId,
    status:
      userId === input.creatorId ? ("accepted" as const) : ("pending" as const),
  }));

  const { error: inviteError } = await supabase
    .from("collab_invites")
    .insert(inviteRows);
  if (inviteError) throw inviteError;

  return buildCollabDetail(collabRow as CollabDubRow);
}

export async function getCollabDetail(collabId: string): Promise<CollabDetail | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("collab_dubs")
    .select(COLLAB_SELECT)
    .eq("id", collabId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return buildCollabDetail(data as CollabDubRow);
}

export async function listCreatedCollabs(userId: string): Promise<CollabDetail[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("collab_dubs")
    .select(COLLAB_SELECT)
    .eq("creator_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  const rows = (data as CollabDubRow[] | null) ?? [];
  return Promise.all(rows.map((row) => buildCollabDetail(row)));
}

export async function listParticipantCollabs(
  userId: string
): Promise<CollabDetail[]> {
  const supabase = createClient();
  const { data: inviteData, error } = await supabase
    .from("collab_invites")
    .select("collab_id")
    .eq("user_id", userId)
    .neq("status", "declined");

  if (error) throw error;

  const collabIds = [
    ...new Set(
      ((inviteData as { collab_id: string }[] | null) ?? []).map(
        (i) => i.collab_id
      )
    ),
  ];

  if (collabIds.length === 0) return [];

  const { data, error: collabError } = await supabase
    .from("collab_dubs")
    .select(COLLAB_SELECT)
    .in("id", collabIds)
    .neq("creator_id", userId)
    .order("created_at", { ascending: false });

  if (collabError) throw collabError;
  const rows = (data as CollabDubRow[] | null) ?? [];
  return Promise.all(rows.map((row) => buildCollabDetail(row)));
}

export async function acceptCollabInvite(
  collabId: string,
  userId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("collab_invites")
    .update({ status: "accepted" })
    .eq("collab_id", collabId)
    .eq("user_id", userId)
    .eq("status", "pending");

  if (error) throw error;
  await refreshCollabStatus(collabId);
}

export async function declineCollabInvite(
  collabId: string,
  userId: string
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("collab_invites")
    .update({ status: "declined" })
    .eq("collab_id", collabId)
    .eq("user_id", userId)
    .eq("status", "pending");

  if (error) throw error;
  await refreshCollabStatus(collabId);
}

async function uploadCollabTake(
  path: string,
  blob: Blob
): Promise<void> {
  const supabase = createClient();
  const rawType = blob.type || "audio/webm";
  const contentType = rawType.split(";")[0]?.trim() || "audio/webm";
  const { error } = await supabase.storage
    .from(DUB_PACKS_BUCKET)
    .upload(path, blob, {
      upsert: true,
      contentType,
      cacheControl: "3600",
    });
  if (error) throw error;
}

export async function submitLineTake(input: {
  collabId: string;
  lineId: string;
  assigneeId: string;
  blob: Blob;
  durationMs: number;
}): Promise<void> {
  const supabase = createClient();

  const invite = await supabase
    .from("collab_invites")
    .select("status")
    .eq("collab_id", input.collabId)
    .eq("user_id", input.assigneeId)
    .maybeSingle();

  if (invite.error) throw invite.error;
  if (!invite.data || invite.data.status !== "accepted") {
    throw new Error("Accept the invite before submitting your line.");
  }

  const type = input.blob.type || "";
  const ext = type.includes("mp4")
    ? "mp4"
    : type.includes("ogg")
      ? "ogg"
      : type.includes("mpeg") || type.includes("mp3")
        ? "mp3"
        : "webm";

  const audioPath = `${input.collabId}/collab-takes/${input.lineId}/${input.assigneeId}.${ext}`;
  await uploadCollabTake(audioPath, input.blob);

  const { error } = await supabase
    .from("collab_line_assignments")
    .update({
      status: "submitted",
      audio_path: audioPath,
      submitted_at: new Date().toISOString(),
    })
    .eq("collab_id", input.collabId)
    .eq("line_id", input.lineId)
    .eq("assignee_id", input.assigneeId);

  if (error) throw error;
  await refreshCollabStatus(input.collabId);
}

export async function reassignCollabLine(input: {
  collabId: string;
  lineId: string;
  newAssigneeId: string;
  creatorId: string;
}): Promise<void> {
  const supabase = createClient();

  const { data: collab } = await supabase
    .from("collab_dubs")
    .select("creator_id, status")
    .eq("id", input.collabId)
    .single();

  if (!collab || collab.creator_id !== input.creatorId) {
    throw new Error("Only the creator can reassign lines.");
  }
  if (collab.status === "published") {
    throw new Error("This collab is already published.");
  }

  const { error: assignError } = await supabase
    .from("collab_line_assignments")
    .update({
      assignee_id: input.newAssigneeId,
      status: "assigned",
      audio_path: null,
      submitted_at: null,
    })
    .eq("collab_id", input.collabId)
    .eq("line_id", input.lineId);

  if (assignError) throw assignError;

  const { data: existingInvite } = await supabase
    .from("collab_invites")
    .select("id")
    .eq("collab_id", input.collabId)
    .eq("user_id", input.newAssigneeId)
    .maybeSingle();

  if (!existingInvite) {
    await supabase.from("collab_invites").insert({
      collab_id: input.collabId,
      user_id: input.newAssigneeId,
      status:
        input.newAssigneeId === input.creatorId ? "accepted" : "pending",
    });
  } else {
    await supabase
      .from("collab_invites")
      .update({ status: input.newAssigneeId === input.creatorId ? "accepted" : "pending" })
      .eq("collab_id", input.collabId)
      .eq("user_id", input.newAssigneeId);
  }

  await refreshCollabStatus(input.collabId);
}

async function blobFromStoragePath(path: string): Promise<Blob> {
  const url = resolveTakeAudioUrl(path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load take (${res.status})`);
  return res.blob();
}

export async function buildCollabRecordings(
  detail: CollabDetail
): Promise<RecordedLine[]> {
  const recordings: RecordedLine[] = [];

  for (const assignment of detail.assignments) {
    if (assignment.status !== "submitted" || !assignment.audioPath) {
      throw new Error("Not all lines have been submitted yet.");
    }
    const blob = await blobFromStoragePath(assignment.audioPath);
    const line = assignment.line;
    recordings.push({
      lineId: assignment.lineId,
      blob,
      durationMs: Math.max(200, line.endMs - line.startMs),
    });
  }

  return recordings;
}

export async function publishCollabDub(input: {
  collabId: string;
  creatorId: string;
  caption: string;
}): Promise<string> {
  const detail = await getCollabDetail(input.collabId);
  if (!detail) throw new Error("Collab not found.");
  if (detail.creatorId !== input.creatorId) {
    throw new Error("Only the creator can publish this collab.");
  }
  if (detail.status !== "ready") {
    throw new Error("All lines must be submitted before publishing.");
  }

  const recordings = await buildCollabRecordings(detail);
  const lines: DubLine[] = detail.packSnapshot.lines;

  const post = await publishDubPost({
    authorId: input.creatorId,
    packId: detail.packId,
    packTitle: detail.packTitle,
    caption: input.caption.trim() || detail.caption,
    packThumbnailUrl: detail.packSnapshot.thumbnailUrl,
    packThumbnailColor: detail.packSnapshot.thumbnailColor,
    videoUrl: detail.packSnapshot.videoUrl,
    backingUrl: detail.packSnapshot.backingUrl,
    lines,
    recordings,
  });

  const supabase = createClient();
  await supabase
    .from("collab_dubs")
    .update({
      status: "published",
      published_post_id: post.id,
      caption: input.caption.trim() || detail.caption,
    })
    .eq("id", input.collabId);

  try {
    const { awardCollabPublish } = await import("@/lib/xp");
    await awardCollabPublish(input.collabId);
  } catch {
    /* best-effort */
  }

  return post.id;
}

export function collabTakePublicUrl(path: string): string {
  return publicPackUrl(path);
}

export function getWaitingAssignees(detail: CollabDetail): CollabLineProgress[] {
  return detail.assignments.filter((a) => a.status !== "submitted");
}

export function getPendingInvitesForUser(
  detail: CollabDetail,
  userId: string
): CollabInvite | undefined {
  return detail.invites.find(
    (i) => i.userId === userId && i.status === "pending"
  );
}

export function getMyAssignments(
  detail: CollabDetail,
  userId: string
): CollabLineProgress[] {
  return detail.assignments.filter((a) => a.assigneeId === userId);
}
