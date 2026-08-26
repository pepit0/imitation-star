import type { DubLine } from "@/lib/types";
import type { UserProfile } from "@/lib/types/social";

export type CollabStatus =
  | "inviting"
  | "in_progress"
  | "ready"
  | "published"
  | "cancelled";

export type CollabInviteStatus = "pending" | "accepted" | "declined";

export type CollabAssignmentStatus = "assigned" | "submitted";

export type CollabPackSnapshot = {
  lines: DubLine[];
  videoUrl?: string;
  backingUrl?: string;
  thumbnailUrl?: string;
  thumbnailColor?: string;
};

export type CollabDub = {
  id: string;
  creatorId: string;
  packId: string;
  packTitle: string;
  packSnapshot: CollabPackSnapshot;
  status: CollabStatus;
  caption: string;
  publishedPostId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CollabInvite = {
  id: string;
  collabId: string;
  userId: string;
  status: CollabInviteStatus;
  createdAt: string;
  updatedAt: string;
};

export type CollabLineAssignment = {
  id: string;
  collabId: string;
  lineId: string;
  assigneeId: string;
  status: CollabAssignmentStatus;
  audioPath?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CollabLineProgress = CollabLineAssignment & {
  line: DubLine;
  assignee?: UserProfile;
};

export type CollabDetail = CollabDub & {
  invites: CollabInvite[];
  assignments: CollabLineProgress[];
  creator?: UserProfile;
};

export type LineAssigneeMap = Record<string, string>;
