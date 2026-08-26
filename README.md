# Imitation Star

A voice dubbing game. Record a scene your way — faithful or funny — then post it for other players to rate, or share it with friends. No AI scores.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Game Modes

- **Single Player** — Dub an entire scene solo, line by line
- **Multiplayer (Pass & Play)** — Up to 5 players take turns on one device
- **Dub Packs** — Browse and search community scene packs

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Web Audio API + MediaRecorder for microphone capture
- PWA-ready (add to home screen on mobile)

## Mobile

### Expo Go / store shell

```bash
cd mobile
npm install
npx expo start
```

Opens the game at `/play?client=app` (no marketing header; Forum/Profile on the menu; Create a Dub is PC-only). See [`mobile/README.md`](mobile/README.md) for local Next.js and **EAS App Store / Play** builds.

### Browser

Imitation Star is designed mobile-first. You can also open the site in Safari (iOS) or Chrome (Android), or add it to the home screen as a PWA.

## Project Structure

```
src/
├── app/           # Pages (home, play, packs, how-to-play)
├── components/    # Game UI (GameStage, RecordingStudio, etc.)
└── lib/           # Types, pack data, audio utils, scoring
```

## Customization

- Add dub packs in `src/lib/packs.ts`
- Adjust scoring in `src/lib/scoring.ts`
- Theme colors in `src/app/globals.css`

## Roadmap

- [ ] Video playback with dubbed audio overlay
- [ ] MP4 export
- [ ] Upload your own video
- [ ] User accounts and saved dubs
- [x] Expo Go WebView shell (`mobile/`)
- [x] Store-ready EAS config + native game-only UX (`?client=app`)
- [ ] App Store / Play submission
