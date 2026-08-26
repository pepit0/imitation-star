"use server";

import { validateDisplayName } from "@/lib/profanity";
import { createClient } from "@/lib/supabase/server";

export type UpdateProfileInput = {
  displayName: string;
  bio: string;
  avatarIcon: string;
  avatarColor: string;
};

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateProfile(
  input: UpdateProfileInput
): Promise<UpdateProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const nameError = validateDisplayName(input.displayName);
  if (nameError) {
    return { ok: false, error: nameError };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: input.displayName.trim() || "Dubber",
      bio: input.bio.trim(),
      avatar_icon: input.avatarIcon,
      avatar_color: input.avatarColor,
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
