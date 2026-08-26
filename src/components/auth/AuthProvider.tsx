"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  profileFromRow,
  PROFILE_SELECT,
  type ProfileRow,
} from "@/lib/supabase/profile";
import type { UserProfile } from "@/lib/types/social";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { setCurrentUserId, loadFollowingIds, loadStarredIds } from "@/lib/social/store";
import { migrateLocalFollows } from "@/lib/follows";
import { isNativeApp } from "@/lib/nativeApp";
import {
  listenForNativePushToken,
  registerNativePushToken,
} from "@/lib/pushClient";
import { syncNativeSubscriptionUser } from "@/lib/subscriptionClient";
import { clearXpCache, refreshXp, setXpCache } from "@/lib/xp";

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return profileFromRow(data as ProfileRow);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    const next = await fetchProfile(user.id);
    setProfile(next);
  }, [user]);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setUser(data.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setCurrentUserId(user?.id ?? null);
    if (!user) {
      setProfile(null);
      clearXpCache();
      return;
    }
    let cancelled = false;
    void migrateLocalFollows(user.id)
      .then(() => {
        if (cancelled) return;
        return Promise.all([
          loadFollowingIds(user.id),
          loadStarredIds(user.id),
          refreshXp(),
        ]);
      })
      .then(() => {
        if (cancelled) return;
        return fetchProfile(user.id);
      })
      .then((next) => {
        if (cancelled || !next) return;
        setProfile(next);
        if (typeof next.xp === "number") {
          setXpCache(
            {
              xp: next.xp,
              packsCompleted: next.packsCompleted ?? 0,
            },
            user.id
          );
        }
      });

    if (isNativeApp()) {
      void registerNativePushToken();
      syncNativeSubscriptionUser(user?.id ?? null);
    }

    const stopListen = listenForNativePushToken();

    return () => {
      cancelled = true;
      stopListen();
    };
  }, [user]);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    syncNativeSubscriptionUser(null);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    clearXpCache();
  }, []);

  const value = useMemo(
    () => ({ user, profile, loading, refreshProfile, signOut }),
    [user, profile, loading, refreshProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
