import Link from "next/link";

export default function HowToPlayPage() {
  return (
    <div className="min-h-[calc(100vh-60px)] bg-es-cream">
      <section className="bg-es-indigo brutal-border border-t-0 border-x-0 px-4 py-8 sm:py-12 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.3em] mb-3">
            Listen · Dub · Share · Rate
          </p>
          <h1 className="text-3xl sm:text-5xl tracking-tight">
            How to Play
          </h1>
          <p className="mt-4 text-sm sm:text-base max-w-xl mx-auto opacity-90">
            Hear a line, then dub it however you want — faithful, funny, or
            somewhere in between. When you&apos;re done, post it for other
            players to rate, or share it with friends. There is no AI judge.
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">
        <section>
          <h2 className="text-xl sm:text-2xl mb-4">The Short Answer</h2>
          <ol className="space-y-3">
            {[
              "Open Imitation Star and press Play.",
              "Choose a mode: Single Player / Couch Party, Multiplayer, or browse Dub Packs.",
              "Listen to the line, then record your take.",
              "Play it straight, or make it a joke — both count.",
              "Finish the scene and preview your dub.",
              "Post it for other players to rate, or send it to friends.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="brutal-btn-icon bg-es-emerald shrink-0">
                  {i + 1}
                </span>
                <p className="text-sm pt-1">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="retro-panel p-6">
          <h2 className="text-xl mb-3">Before You Play</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• Works on phone and desktop.</li>
            <li>• Prepare a microphone (built-in is fine).</li>
            <li>• Close apps that might hold the microphone.</li>
            <li>• Headphones help if you want a cleaner take.</li>
            <li>• Lower speaker volume to reduce echo.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl sm:text-2xl mb-4">Your Call</h2>
          <p className="text-sm text-gray-700 mb-4">
            Accuracy is optional. Some people chase a dead-on impression. Others
            rewrite the vibe on purpose. Both belong here — the audience decides
            what lands.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { label: "Faithful", desc: "Match the original if that’s your bit." },
              { label: "Funny", desc: "Twist the line, the tone, or the character." },
              { label: "Player ratings", desc: "Other people vote. Not an AI model." },
              { label: "Share", desc: "Send a take to friends without posting it." },
            ].map((item) => (
              <div key={item.label} className="retro-panel p-4">
                <h3 className="text-sm uppercase text-es-violet">
                  {item.label}
                </h3>
                <p className="text-xs text-gray-600 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl sm:text-2xl mb-4">
            Playing on Mobile
          </h2>
          <p className="text-sm text-gray-700 mb-4">
            Imitation Star is built for phones as well as larger screens. Play
            in portrait or landscape, and approve microphone access when you
            hit Record.
          </p>
          <div className="brutal-border bg-es-emerald/20 p-4">
            <p className="text-sm">
              Tip: Add Imitation Star to your home screen for a quicker launch.
              On iOS, tap Share → Add to Home Screen. On Android, use the
              install prompt if it appears.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl sm:text-2xl mb-4">
            Multiplayer Collab
          </h2>
          <p className="text-sm text-gray-700">
            Assign each line in a dub pack to different players — including
            yourself. Search by @handle or name, or filter to people you
            follow. Everyone must accept their invite before recording. Track
            progress on Profile → Multiplayer. When all lines are in, the
            creator publishes the finished dub to the forum.
          </p>
        </section>

        <div className="text-center pt-4 pb-8">
          <Link
            href="/play"
            className="brutal-btn bg-es-orange text-white px-8 py-4 text-sm"
          >
            Start Playing Now
          </Link>
        </div>
      </div>
    </div>
  );
}
