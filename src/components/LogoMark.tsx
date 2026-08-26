import Image from "next/image";
import { PALETTE } from "@/lib/colors";

interface LogoMarkProps {
  className?: string;
  title?: string;
}

const STAR =
  "M18 .05 22.72 11.55 35.05 12.45 25.68 20.48 28.58 32.55 18 26 7.42 32.55 10.32 20.48 .95 12.45 13.28 11.55Z";

/** Yellow star behind the studio mic PNG. */
export default function LogoMark({ className, title }: LogoMarkProps) {
  const tokens = (className ?? "").split(/\s+/).filter(Boolean);
  const invertMic = tokens.includes("invert");
  const wrapClass = tokens.filter((t) => t !== "invert" && t !== "object-contain").join(" ");

  return (
    <span className={`relative inline-block overflow-visible ${wrapClass}`.trim()}>
      {title ? <span className="sr-only">{title}</span> : null}
      <svg
        viewBox="0 0 36 36"
        overflow="visible"
        className="absolute inset-[-18%] h-[136%] w-[136%] max-w-none overflow-visible"
        aria-hidden="true"
      >
        <path
          d={STAR}
          fill="#000"
          stroke="#000"
          strokeWidth="1.25"
          strokeLinejoin="round"
          transform="translate(2.25 2.25)"
        />
        <path
          d={STAR}
          fill={PALETTE.pollen}
          stroke="#000"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
      </svg>
      <Image
        src="/images/logo-mic.png"
        alt=""
        width={96}
        height={96}
        className={`relative z-10 h-full w-full object-contain p-[22%] ${invertMic ? "invert" : ""}`}
        aria-hidden
      />
    </span>
  );
}
