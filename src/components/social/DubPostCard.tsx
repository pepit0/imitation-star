"use client";

import type { DubPost, UserProfile } from "@/lib/types/social";
import { getPackById } from "@/lib/packs";
import { formatForumPostDate } from "@/lib/formatDate";
import ProfileAvatar from "@/components/profile/ProfileAvatar";

type DubPostCardProps = {
  post: DubPost;
  author: UserProfile | undefined;
  rank?: number;
  starred: boolean;
  onStarToggle: () => void;
  onAuthorClick: () => void;
  onThumbClick: () => void;
};

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`forum-star-icon ${filled ? "forum-star-icon--on" : ""}`}
    >
      <path
        d="M12 2.5l2.9 6.1 6.6.7-5 4.6 1.4 6.5L12 16.8 6.1 20.4l1.4-6.5-5-4.6 6.6-.7L12 2.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DubPostCard({
  post,
  author,
  rank,
  starred,
  onStarToggle,
  onAuthorClick,
  onThumbClick,
}: DubPostCardProps) {
  const name = author?.displayName ?? "Unknown";
  const pack = getPackById(post.packId);
  const thumbUrl = post.packThumbnailUrl ?? pack?.thumbnailUrl;
  const thumbColor =
    post.packThumbnailColor ?? pack?.thumbnailColor ?? "#FF5A36";
  const dateLabel = formatForumPostDate(post.createdAt);

  return (
    <article className="forum-post-card">
      {rank != null ? (
        <span className="forum-post-card__rank" aria-label={`Rank #${rank}`}>
          #{rank}
        </span>
      ) : null}
      <button
        type="button"
        className="forum-post-card__thumb"
        style={thumbUrl ? undefined : { background: thumbColor }}
        onClick={onThumbClick}
        aria-label={`Play dub: ${post.packTitle}`}
      >
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="" />
        ) : null}
        <span className="forum-post-card__play-badge" aria-hidden="true">
          ▶
        </span>
      </button>

      <div className="forum-post-card__body">
        <div className="forum-post-card__pack">{post.packTitle}</div>
        {post.caption ? (
          <p className="forum-post-card__caption">{post.caption}</p>
        ) : null}

        <div className="forum-post-card__meta">
          <button
            type="button"
            className="forum-post-card__author"
            onClick={onAuthorClick}
          >
            <ProfileAvatar
              icon={author?.avatarIcon}
              color={author?.avatarColor ?? "#888"}
              name={name}
              className="forum-post-card__avatar"
            />
            <span className="forum-post-card__author-line">
              <span className="forum-post-card__author-name">{name}</span>
              {dateLabel ? (
                <>
                  <span className="forum-post-card__author-sep" aria-hidden="true">
                    {" "}
                    -{" "}
                  </span>
                  <time
                    className="forum-post-card__date"
                    dateTime={post.createdAt}
                  >
                    {dateLabel}
                  </time>
                </>
              ) : null}
            </span>
          </button>
          <button
            type="button"
            className="brutal-btn brutal-btn-sm forum-post-card__star"
            onClick={onStarToggle}
            aria-pressed={starred}
            aria-label={starred ? "Unstar this dub" : "Star this dub"}
          >
            <StarIcon filled={starred} />
            <span>{post.starCount}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
