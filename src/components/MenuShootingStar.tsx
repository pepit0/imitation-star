"use client";

import { useId } from "react";

/** Shooting star trail + head for the game menu title. Trail sits behind the word. */
export default function MenuShootingStar() {
  const gradId = useId();

  return (
    <>
      <span className="cv-menu-brand-star__trail" aria-hidden="true">
        <svg
          viewBox="0 0 160 40"
          className="cv-menu-brand-star__trail-svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffca3a" stopOpacity="0" />
              <stop offset="45%" stopColor="#ffca3a" stopOpacity="0.18" />
              <stop offset="85%" stopColor="#ffca3a" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ffca3a" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          <path
            d="M4 30 C52 8, 108 6, 150 18"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.35"
          />
          <path
            d="M6 28 C54 10, 110 8, 152 17"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="cv-menu-brand-star__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="cv-menu-brand-star__icon-svg">
          <path
            d="M12 1.5 14.8 9.2 23 9.8 16.6 15.1 18.8 23 12 18.6 5.2 23 7.4 15.1 1 9.8 9.2 9.2Z"
            fill="#ffca3a"
          />
        </svg>
      </span>
    </>
  );
}
