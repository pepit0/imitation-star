"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  deleteDubPost,
  listCloudDubPostsByAuthor,
  restoreDubPost,
} from "@/lib/cloudPosts";
import { formatPostDate, loadMergedForumPosts } from "@/lib/social/forumPosts";
import { SEED_POSTS } from "@/lib/social/seed";
import type { DubPost } from "@/lib/types/social";
import ConfirmDialog from "@/components/ConfirmDialog";
import ArchivedPostDialog from "@/components/profile/ArchivedPostDialog";

type ProfilePostsProps = {
  authorId: string;
  hideTitle?: boolean;
};

function postTitle(post: DubPost): string {
  const caption = post.caption.trim();
  return caption || "Untitled dub";
}

export function ProfilePosts({ authorId, hideTitle = false }: ProfilePostsProps) {
  const [posts, setPosts] = useState<DubPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [archivedPost, setArchivedPost] = useState<DubPost | null>(null);
  const [deleteConfirmPost, setDeleteConfirmPost] = useState<DubPost | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const [cloud, merged] = await Promise.all([
        listCloudDubPostsByAuthor(authorId).catch(() => [] as DubPost[]),
        loadMergedForumPosts(),
      ]);

      const cloudIds = new Set(cloud.map((p) => p.id));
      const seedForAuthor = SEED_POSTS.filter(
        (p) => p.authorId === authorId && !cloudIds.has(p.id)
      );
      const starById = new Map(merged.map((p) => [p.id, p.starCount]));

      const combined = [...cloud, ...seedForAuthor]
        .map((p) => ({
          ...p,
          starCount: starById.get(p.id) ?? p.starCount,
        }))
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      setPosts(combined);
    } finally {
      setLoading(false);
    }
  }, [authorId]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  async function handleRestore(post: DubPost) {
    setBusy(true);
    setError(null);
    try {
      await restoreDubPost(post.id);
      setArchivedPost(null);
      await loadPosts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore this post.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(post: DubPost) {
    setBusy(true);
    setError(null);
    try {
      await deleteDubPost(post);
      setDeleteConfirmPost(null);
      setArchivedPost(null);
      await loadPosts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this post.");
    } finally {
      setBusy(false);
    }
  }

  function renderPostRow(post: DubPost) {
    const rowContent = (
      <>
        <div
          className="profile-post-row__thumb"
          style={
            post.packThumbnailUrl
              ? {
                  backgroundImage: `url(${post.packThumbnailUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : {
                  backgroundColor:
                    post.packThumbnailColor ?? "var(--es-indigo)",
                }
          }
          aria-hidden
        />
        <div className="profile-post-row__body">
          <p className="profile-post-row__pack">{post.packTitle}</p>
          <p className="profile-post-row__title">{postTitle(post)}</p>
          <p className="profile-post-row__date">
            {formatPostDate(post.createdAt)}
          </p>
        </div>
        {post.archivedAt ? (
          <span className="profile-post-row__archived-badge">Archived</span>
        ) : null}
      </>
    );

    if (post.archivedAt) {
      return (
        <button
          type="button"
          className="profile-post-row profile-post-row--archived"
          onClick={() => {
            setError(null);
            setArchivedPost(post);
          }}
        >
          {rowContent}
        </button>
      );
    }

    return (
      <Link
        href={`/forum?post=${encodeURIComponent(post.id)}`}
        className="profile-post-row"
      >
        {rowContent}
      </Link>
    );
  }

  return (
    <>
      <section className="profile-posts" aria-labelledby="profile-posts-heading">
      {!hideTitle ? (
        <h2 id="profile-posts-heading" className="profile-posts__title">
          Posts
        </h2>
      ) : null}

        {error ? (
          <p className="profile-posts__error" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="profile-posts__empty">Loading posts…</p>
        ) : posts.length === 0 ? (
          <p className="profile-posts__empty">
            No forum posts yet. Finish a dub and publish it to the forum.
          </p>
        ) : (
          <ul className="profile-posts__list">
            {posts.map((post) => (
              <li key={post.id}>{renderPostRow(post)}</li>
            ))}
          </ul>
        )}
      </section>

      {archivedPost && !deleteConfirmPost ? (
        <ArchivedPostDialog
          postTitle={postTitle(archivedPost)}
          busy={busy}
          onRestore={() => void handleRestore(archivedPost)}
          onDelete={() => setDeleteConfirmPost(archivedPost)}
          onCancel={() => {
            if (!busy) setArchivedPost(null);
          }}
        />
      ) : null}

      {deleteConfirmPost ? (
        <ConfirmDialog
          title="Delete this post?"
          message="This permanently removes your dub and its takes. This cannot be undone."
          confirmLabel="Delete"
          tone="red"
          busy={busy}
          fixed
          onConfirm={() => void handleDelete(deleteConfirmPost)}
          onCancel={() => {
            if (!busy) setDeleteConfirmPost(null);
          }}
        />
      ) : null}
    </>
  );
}
