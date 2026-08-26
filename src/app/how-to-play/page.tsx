import Link from "next/link";

const SHORT_STEPS = [
  "Open Play to see the game menu.",
  "Pick Single Player, Multiplayer, Community Packs, or Create a Dub Pack (desktop).",
  "Listen to each line, then hold Record and dub it.",
  "Finish the scene to preview. Sign in to post on the Forum, or keep it private.",
  "Other players can star your posts. Pack Plays go up when someone else finishes a dub with your pack.",
] as const;

const MODES = [
  {
    title: "Single Player / Couch Party",
    desc: "Play alone or pass the device. Uses the active pack. Change packs in Community Packs.",
  },
  {
    title: "Multiplayer",
    desc: "Assign lines to friends, wait for accepts, then record. The creator posts the finished dub.",
  },
  {
    title: "Community Packs",
    desc: "Browse scenes. Sort by Top Ranking or Newest.",
  },
  {
    title: "Create a Dub Pack",
    desc: "Desktop only. Import a ZIP or video, mark lines, then publish or export.",
  },
] as const;

export default function HowToPlayPage() {
  return (
    <div className="min-h-[calc(100vh-60px)] bg-es-cream">
      <section className="bg-es-coral brutal-border border-t-0 border-x-0 px-4 py-8 sm:py-12 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.3em] mb-3 text-es-pollen">
            Listen · Dub · Share · Rate
          </p>
          <h1 className="font-title text-3xl sm:text-5xl tracking-tight">
            How to Play
          </h1>
          <p className="mt-4 text-sm sm:text-base max-w-xl mx-auto opacity-95 normal-case leading-relaxed">
            Hear a line. Record your take, serious or funny. Preview the scene.
            Post to the Forum for player stars, or skip posting. No AI scores.
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">
        <section>
          <h2 className="font-title text-xl sm:text-2xl mb-4">Steps</h2>
          <ol className="space-y-3">
            {SHORT_STEPS.map((step, i) => (
              <li key={step} className="flex gap-3 items-start">
                <span className="brutal-btn-icon bg-es-pollen text-black shrink-0">
                  {i + 1}
                </span>
                <p className="text-sm pt-1 normal-case leading-relaxed">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="font-title text-xl sm:text-2xl mb-4">Modes</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {MODES.map((mode) => (
              <div key={mode.title} className="retro-panel p-4">
                <h3 className="text-sm uppercase text-es-coral font-title tracking-wide">
                  {mode.title}
                </h3>
                <p className="text-xs text-gray-600 mt-1.5 normal-case leading-relaxed">
                  {mode.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="retro-panel p-6">
          <h2 className="font-title text-xl mb-3">Tips</h2>
          <ul className="space-y-2 text-sm text-gray-700 normal-case">
            <li>• Allow mic access when asked.</li>
            <li>• Headphones help cut echo.</li>
            <li>• Close apps that might use the mic.</li>
            <li>
              • On the phone app you can play, use the Forum, and open Profile.
              Create a Dub Pack needs a computer.
            </li>
          </ul>
        </section>

        <div className="flex flex-wrap justify-center gap-3 pt-4 pb-8">
          <Link
            href="/play"
            className="brutal-btn bg-es-coral text-white px-8 py-4 text-sm"
          >
            Start playing
          </Link>
          <Link
            href="/packs"
            className="brutal-btn bg-white text-black px-8 py-4 text-sm"
          >
            Browse packs
          </Link>
        </div>
      </div>
    </div>
  );
}
