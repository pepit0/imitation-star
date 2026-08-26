# Imitation Star — Expo (App Store / Play)

Hybrid shell: Expo WebView loads the live Next.js game at `/play?client=app` so the store apps are game-only (no marketing site chrome). Desktop browsers are unchanged.

Default origin: [https://imitation-star.vercel.app](https://imitation-star.vercel.app)

## Dev (Expo Go)

```bash
cd mobile
npm install
npx expo start
```

Scan the QR with **Expo Go**. The WebView opens `/play?client=app` (MainMenu, Forum/Profile buttons, Create a Dub grayed out).

From the repo root:

```bash
npm run mobile
```

### Point at local Next.js

```bash
# echostage/
npx next dev -H 0.0.0.0 -p 3000
```

`mobile/.env`:

```bash
EXPO_PUBLIC_APP_URL=http://192.168.x.x:3000
```

Restart Expo after changing `.env`.

## Store builds (EAS)

1. Install EAS CLI and log in: `npm i -g eas-cli && eas login`
2. From `mobile/`: `eas init` (links the project; writes `extra.eas.projectId` into `app.json`)
3. Preview APK / internal iOS: `eas build --profile preview --platform android` (or `ios`)
4. Production: `eas build --profile production --platform all`
5. Submit: `eas submit --platform ios` / `android` (requires App Store Connect / Play Console)

Bundle IDs (already set in `app.json`):

- iOS: `com.imitationstar.app`
- Android: `com.imitationstar.app`

### Store checklist

- [ ] Apple Developer Program + App Store Connect app
- [ ] Google Play Console app
- [ ] Privacy policy URL (required for mic + accounts)
- [ ] App screenshots / preview video
- [ ] Age rating / content questionnaire
- [ ] Confirm mic usage strings match App Review
- [ ] Production web URL is live and supports `?client=app`

## Notes

- **`?client=app`**: persisted in `sessionStorage` so Forum / Profile / Login keep native chrome (no site Header).
- **Create a Dub**: disabled in the native shell; available on desktop web only.
- **Mic**: Expo Go WebView `getUserMedia` can be limited on iOS; prefer a development or production build for recording QA.
- Do not commit `.env`.
