import Link from "next/link";
import LogoMark from "@/components/LogoMark";
import PlayIcon from "@/components/PlayIcon";
import StoreComingSoon from "@/components/StoreComingSoon";
import { DUB_PACKS } from "@/lib/packs";

const STEPS = [
  {
    step: "1",
    title: "Pick a pack",
    desc: "Choose a scene with dialogue already timed out.",
  },
  {
    step: "2",
    title: "Listen in",
    desc: "Hear the line, then decide how you want to play it.",
  },
  {
    step: "3",
    title: "Record takes",
    desc: "Match the original, or swing it for laughs.",
  },
  {
    step: "4",
    title: "Share the dub",
    desc: "Post it for other players, or send it to friends.",
  },
  {
    step: "5",
    title: "Get rated",
    desc: "People vote — not an AI judge.",
  },
] as const;

export default function HomePage() {
  const packCount = DUB_PACKS.length;

  return (
    <>
      <section className="landing-hero brutal-border border-t-0 border-x-0">
        <div className="landing-hero-grid">
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-5 mb-5">
              <LogoMark
                className="w-10 h-10 object-contain shrink-0"
                title="Imitation Star"
              />
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-es-lilac">
                  The voice dubbing game
                </p>
                <p className="font-brand text-2xl sm:text-3xl landing-hero__brand-title">
                  Imitation Star
                </p>
              </div>
            </div>

            <h1 className="font-title text-2xl sm:text-4xl leading-tight max-w-lg">
              Dub the line.
              <span className="block text-es-lilac mt-1">
                Nail it — or make it hilarious.
              </span>
            </h1>

            <p className="mt-4 text-sm text-white/90 max-w-md normal-case leading-relaxed">
              Record a scene your way. Play it straight, or go for the laugh.
              Then post it for other players to rate, or share it with friends.
              No AI scores.
            </p>

            <div className="flex flex-wrap gap-2 mt-5">
              <span className="landing-stat-chip">
                <span className="landing-stat-chip-dot" aria-hidden="true" />
                Free to play
              </span>
              <span className="landing-stat-chip">{packCount} dub packs</span>
              <span className="landing-stat-chip">Multiplayer collab</span>
            </div>

            <div className="mt-6">
              <StoreComingSoon />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:gap-3 justify-center">
            <p className="text-[10px] uppercase tracking-widest text-white/80 mb-1">
              Quick routes
            </p>
            <Link href="/play" className="landing-mode-tile landing-mode-tile-pollen">
              <span className="font-title text-sm uppercase inline-flex items-center gap-2">
                <PlayIcon className="shrink-0" />
                Play now
              </span>
              <span className="text-xs opacity-80 normal-case">
                Jump into the dub stage
              </span>
            </Link>
            <Link href="/packs" className="landing-mode-tile landing-mode-tile-green">
              <span className="font-title text-sm uppercase">Browse packs</span>
              <span className="text-xs opacity-80 normal-case">
                {packCount} community scenes ready
              </span>
            </Link>
            <Link
              href="/how-to-play"
              className="landing-mode-tile landing-mode-tile-blue"
            >
              <span className="font-title text-sm uppercase">How to play</span>
              <span className="text-xs opacity-80 normal-case">
                How it works, ratings, and sharing
              </span>
            </Link>
            <Link href="/forum" className="landing-mode-tile landing-mode-tile-red">
              <span className="font-title text-sm uppercase">Forum</span>
              <span className="text-xs opacity-80 normal-case">
                Browse and rate community dubs
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:py-14 bg-white">
        <div className="max-w-6xl mx-auto mb-8">
          <p className="text-[10px] uppercase tracking-[0.2em] text-es-brand mb-2">
            Run sheet
          </p>
          <h2 className="font-title text-2xl sm:text-3xl">
            Five beats to a finished dub
          </h2>
        </div>
        <div className="landing-card-grid px-4 sm:px-6 max-w-6xl">
          {STEPS.map((item) => (
            <article key={item.step} className="landing-step-card">
              <span className="landing-step-num">{item.step}</span>
              <h3 className="font-title text-sm uppercase">{item.title}</h3>
              <p className="text-xs text-gray-600 normal-case leading-relaxed flex-1">
                {item.desc}
              </p>
            </article>
          ))}
        </div>
        <div className="text-center mt-8 px-4">
          <Link
            href="/how-to-play"
            className="brutal-btn bg-es-dark text-white px-6 py-3 text-sm"
          >
            Full how-to →
          </Link>
        </div>
      </section>

      <section className="px-4 py-12 sm:py-16 bg-es-cream brutal-border border-x-0">
        <div className="landing-about-grid px-0 sm:px-2 max-w-6xl">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-es-brand mb-3">
              What is this?
            </p>
            <h2 className="font-title text-2xl sm:text-3xl leading-snug">
              Funny, faithful,
              <span className="block text-es-lilac">or both.</span>
            </h2>
          </div>
          <div className="space-y-3 text-sm text-gray-700 normal-case leading-relaxed">
            <p>
              Imitation Star is a dubbing game where you decide the bit. Match
              the original, or turn the scene into a joke. Dubs are posted for
              other players to rate — or shared with friends. Nobody is scored
              by AI.
            </p>
            <ul className="space-y-2 text-xs uppercase tracking-wide text-gray-600">
              <li className="flex gap-2">
                <span className="text-es-success">+</span>
                Play it accurate or play it funny
              </li>
              <li className="flex gap-2">
                <span className="text-es-success">+</span>
                Rated by players, not AI
              </li>
              <li className="flex gap-2">
                <span className="text-es-success">+</span>
                Share takes with friends
              </li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__brand">
            <LogoMark className="w-8 h-8 object-contain invert" />
            <span className="font-brand text-sm">Imitation Star</span>
          </div>
          <nav className="landing-footer__nav" aria-label="Footer">
            <Link href="/play" className="landing-footer__link">
              Play
            </Link>
            <Link href="/packs" className="landing-footer__link">
              Dub Packs
            </Link>
            <Link href="/how-to-play" className="landing-footer__link">
              How to Play
            </Link>
          </nav>
          <p className="landing-footer__copy">
            © {new Date().getFullYear()} Imitation Star
          </p>
        </div>
      </footer>
    </>
  );
}
