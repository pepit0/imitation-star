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

Imitation Star is designed mobile-first. For the best experience:

1. Open in Safari (iOS) or Chrome (Android)
2. Use landscape orientation during recording
3. Add to home screen for app-like experience

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
- [ ] Native mobile app (Capacitor/React Native)
