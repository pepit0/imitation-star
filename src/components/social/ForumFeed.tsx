"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DubPost, UserProfile } from "@/lib/types/social";
import {
  getCurrentUserId,
  getFollowingUserIds,
  getProfile,
  getStarredPostIds,
  loadFollowingIds,
  subscribeSocial,
  toggleFollow,
  toggleStar,
} from "@/lib/social/store";
import { fetchProfilesByIds } from "@/lib/cloudPosts";
import {
  computePostRankings,
  loadMergedForumPosts,
  sortForumPosts,
  type ForumSort,
} from "@/lib/social/forumPosts";
import { useAuth } from "@/components/auth/AuthProvider";
import DubPostCard from "./DubPostCard";
import DubPostPlayer from "./DubPostPlayer";
import ProfileCardModal from "./ProfileCardModal";

const SORT_OPTIONS: { value: ForumSort; label: string }[] = [
  { value: "top", label: "Top ranking" },
  { value: "following", label: "Following" },
  { value: "latest", label: "Latest" },
];

type ForumFeedProps = {
  sort: ForumSort;
};

export default function ForumFeed({ sort }: ForumFeedProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkPostId = searchParams.get("post");
  const { user, profile: authProfile } = useAuth();
  const [allPosts, setAllPosts] = useState<DubPost[]>([]);
  const [cloudAuthors, setCloudAuthors] = useState<Map<string, UserProfile>>(
    () => new Map()
  );
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [playingPostId, setPlayingPostId] = useState<string | null>(null);
  const deepLinkHandledRef = useRef<string | null>(null);

  const clearPostQueryParam = useCallback(() => {
    if (!searchParams.get("post")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("post");
    const qs = params.toString();
    router.replace(qs ? `/forum?${qs}` : "/forum", { scroll: false });
  }, [router, searchParams]);

  const closePlayer = useCallback(() => {
    setPlayingPostId(null);
    clearPostQueryParam();
  }, [clearPostQueryParam]);

  const requireSignIn = useCallback(() => {
    router.push("/login?next=/forum");
  }, [router]);

  const refreshLocal = useCallback(() => {
    setStarredIds(getStarredPostIds());
    setFollowingIds(getFollowingUserIds());
  }, []);

  useEffect(() => {
    if (!user) {
      setFollowingIds([]);
      return;
    }
    void loadFollowingIds(user.id).then(setFollowingIds);
  }, [user]);

  const refreshPosts = useCallback(async () => {
    const merged = await loadMergedForumPosts();
    setAllPosts(merged);

    const missingAuthorIds = merged
      .map((p) => p.authorId)
      .filter((id) => !getProfile(id) && id !== authProfile?.id);
    if (missingAuthorIds.length > 0) {
      const fetched = await fetchProfilesByIds(missingAuthorIds);
      setCloudAuthors(fetched);
    }
  }, [authProfile?.id]);

  useEffect(() => {
    refreshLocal();
    void refreshPosts();
    return subscribeSocial(() => {
      refreshLocal();
      void refreshPosts();
    });
  }, [refreshLocal, refreshPosts]);

  const rankings = useMemo(
    () => computePostRankings(allPosts),
    [allPosts]
  );

  const followingSet = useMemo(
    () => new Set(followingIds),
    [followingIds]
  );

  const posts = useMemo(
    () => sortForumPosts(allPosts, sort, followingSet),
    [allPosts, sort, followingSet]
  );

  useEffect(() => {
    if (!deepLinkPostId) {
      deepLinkHandledRef.current = null;
      return;
    }
    if (allPosts.length === 0) return;
    if (deepLinkHandledRef.current === deepLinkPostId) return;

    const target = allPosts.find((p) => p.id === deepLinkPostId);
    if (!target) return;

    deepLinkHandledRef.current = deepLinkPostId;
    setPlayingPostId(deepLinkPostId);
    clearPostQueryParam();
    requestAnimationFrame(() => {
      document
        .getElementById(`forum-post-${deepLinkPostId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [deepLinkPostId, allPosts, clearPostQueryParam]);

  const openProfile = useCallback((authorId: string) => {
    setProfileId(authorId);
  }, []);

  const closeProfile = useCallback(() => {
    setProfileId(null);
  }, []);

  const handleStarToggle = useCallback(
    (postId: string) => {
      if (!user) {
        requireSignIn();
        return;
      }
      toggleStar(postId);
    },
    [user, requireSignIn]
  );

  const handleFollowToggle = useCallback(
    (profileUserId: string) => {
      if (!user) {
        requireSignIn();
        return;
      }
      void toggleFollow(profileUserId, user.id).then(() => {
        setFollowingIds(getFollowingUserIds());
      });
    },
    [user, requireSignIn]
  );

  const resolveAuthor = useCallback(
    (authorId: string): UserProfile | undefined => {
      if (authProfile?.id === authorId) return authProfile;
      return getProfile(authorId) ?? cloudAuthors.get(authorId);
    },
    [authProfile, cloudAuthors]
  );

  const profile: UserProfile | undefined = profileId
    ? resolveAuthor(profileId)
    : undefined;

  const playingPost = playingPostId
    ? allPosts.find((p) => p.id === playingPostId)
    : undefined;

  const emptyFollowing =
    sort === "following" && posts.length === 0 && allPosts.length > 0;

  return (
    <>
      <div className="forum-feed">
        {posts.map((post) => {
          const author = resolveAuthor(post.authorId);
          const rank = rankings.get(post.id);
          return (
            <div
              key={post.id}
              id={`forum-post-${post.id}`}
              className="forum-feed__item"
            >
              <DubPostCard
                post={post}
                author={author}
                rank={rank}
                starred={starredIds.includes(post.id)}
                onStarToggle={() => handleStarToggle(post.id)}
                onAuthorClick={() => openProfile(post.authorId)}
                onThumbClick={() => setPlayingPostId(post.id)}
              />
            </div>
          );
        })}
        {emptyFollowing ? (
          <p className="forum-feed__empty">
            Follow dubbers to see their posts here — or sign in to sync follows.
          </p>
        ) : null}
      </div>

      {playingPost ? (
        <DubPostPlayer
          key={playingPost.id}
          post={playingPost}
          author={resolveAuthor(playingPost.authorId)}
          isOwner={Boolean(user && user.id === playingPost.authorId)}
          onClose={closePlayer}
          onPostArchived={() => void refreshPosts()}
          onPostDeleted={() => void refreshPosts()}
        />
      ) : null}

      {profile ? (
        <ProfileCardModal
          profile={profile}
          isFollowing={followingIds.includes(profile.id)}
          isSelf={Boolean(user) && profile.id === getCurrentUserId()}
          onFollowToggle={() => handleFollowToggle(profile.id)}
          onClose={closeProfile}
        />
      ) : null}
    </>
  );
}

export function ForumSortControls({
  sort,
  onSortChange,
}: {
  sort: ForumSort;
  onSortChange: (sort: ForumSort) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();

  function handleSelect(next: ForumSort) {
    if (next === "following" && !user) {
      router.push("/login?next=/forum");
      return;
    }
    onSortChange(next);
  }

  return (
    <div
      className="forum-sort"
      role="group"
      aria-label="Sort forum posts"
    >
      {SORT_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`forum-sort__btn ${
            sort === option.value ? "forum-sort__btn--active" : ""
          }`}
          aria-pressed={sort === option.value}
          onClick={() => handleSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
