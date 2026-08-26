const MENU_ICONS = {
  single: "/menu-icons/profile-male.png",
  multiplayer: "/menu-icons/profile-male.png",
  packs: "/menu-icons/film-player.png",
  upload: "/menu-icons/video-camera.png",
} as const;

type MenuModeIconProps = {
  mode: keyof typeof MENU_ICONS;
};

export default function MenuModeIcon({ mode }: MenuModeIconProps) {
  if (mode === "multiplayer") {
    return (
      <span className="cv-menu-btn-icons" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={MENU_ICONS.multiplayer}
          alt=""
          className="cv-menu-btn-icon"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/menu-icons/profile-female.png"
          alt=""
          className="cv-menu-btn-icon"
        />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={MENU_ICONS[mode]}
      alt=""
      className="cv-menu-btn-icon"
      aria-hidden="true"
    />
  );
}
