"use client";

import { Suspense, useState } from "react";
import ForumFeed, { ForumSortControls } from "@/components/social/ForumFeed";
import type { ForumSort } from "@/lib/social/forumPosts";

function ForumPageInner() {
  const [sort, setSort] = useState<ForumSort>("latest");

  return (
    <div className="forum-page">
      <header className="forum-page__header">
        <div className="forum-page__header-row">
          <div className="forum-page__header-text">
            <p className="forum-page__eyebrow">Community</p>
            <h1 className="forum-page__title">Forum</h1>
            <p className="forum-page__lede">
              Latest dubs from the stage — star a take, peek a profile.
            </p>
          </div>
          <ForumSortControls sort={sort} onSortChange={setSort} />
        </div>
      </header>
      <ForumFeed sort={sort} />
    </div>
  );
}

export default function ForumPageClient() {
  return (
    <Suspense fallback={<div className="forum-page">Loading forum…</div>}>
      <ForumPageInner />
    </Suspense>
  );
}
