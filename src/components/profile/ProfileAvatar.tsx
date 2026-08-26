import {
  avatarIconFill,
  getProfileIconSrc,
  normalizeAvatarIcon,
  resolveAvatarColor,
} from "@/lib/profileIcons";

type ProfileAvatarProps = {
  icon?: string | null;
  color?: string | null;
  name?: string;
  className?: string;
};

export default function ProfileAvatar({
  icon,
  color,
  name,
  className = "",
}: ProfileAvatarProps) {
  const iconId = normalizeAvatarIcon(icon);
  const background = resolveAvatarColor(color);
  const iconSrc = getProfileIconSrc(iconId);
  const iconFill = avatarIconFill(background);
  const initial = (name ?? "?").slice(0, 1).toUpperCase();

  return (
    <span
      className={`profile-avatar ${className}`.trim()}
      style={{ background }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconSrc}
        alt=""
        className="profile-avatar__icon"
        style={{
          filter:
            iconFill === "#ffffff"
              ? "brightness(0) invert(1)"
              : "brightness(0)",
        }}
        draggable={false}
      />
      <span className="profile-avatar__fallback">{initial}</span>
    </span>
  );
}
