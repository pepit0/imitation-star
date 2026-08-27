# Imitation Star — Expo (App Store / Play)

Hybrid shell: Expo WebView loads the live Next.js game at `/play?client=app` so the store apps are game-only (no marketing site chrome). Desktop browsers are unchanged.

Default origin: [https://www.imitation.site](https://www.imitation.site)

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
- [x] Privacy policy URL: `https://www.imitation.site/privacy`
- [x] Terms of service URL: `https://www.imitation.site/terms`
- [x] Support URL + email: `https://www.imitation.site/support`, `support@imitation.site`
- [x] In-app account deletion: Profile → Delete account (requires `SUPABASE_SERVICE_ROLE_KEY` on Vercel)
- [ ] Resend SMTP + branded confirm email (`email-templates/`; icon at `/email-icon.png`)
- [ ] Set support email in App Store Connect / Play Console (same as above)
- [ ] App screenshots / preview video
- [ ] Age rating questionnaire (user-generated audio; suggest 12+ / Teen)
- [ ] Google Play Data safety form (email, profile, audio recordings, user-generated content)
- [ ] Confirm mic usage strings match App Review
- [ ] Production web URL is live and supports `?client=app`

### App Store Connect / Play Console URLs

Use these when the store asks for legal links:

| Field | URL |
| --- | --- |
| Privacy Policy | https://www.imitation.site/privacy |
| Terms of Service | https://www.imitation.site/terms |
| Support | https://www.imitation.site/support |

### Vercel env for account deletion

Add to the **echostage** Vercel project (Settings → Environment Variables):

```
SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase Dashboard → Settings → API>
```

Without this key, Delete account shows an error and users must email support.
The same key enables **large OGV convert** (e.g. ~120 MB Choicer Voicer videos) via
Supabase Storage signed upload — Vercel cannot accept those files in the request body.

## RevenueCat (Star Club subscriptions)

The native shell integrates **RevenueCat** + **RevenueCatUI** for offering
`star-subscriptions` → entitlement **Imitation Star Pro**.

### Critical: do not use Test Store keys on TestFlight

RevenueCat **intentionally crashes** release / TestFlight builds if you call
`Purchases.configure` with a `test_…` API key. Use:

| Build | Key |
| --- | --- |
| Development client (`__DEV__`) | `test_…` OK |
| Production / TestFlight | `appl_…` (iOS) / `goog_…` (Android) only |

EAS production should have `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_…`.
Development may use `EXPO_PUBLIC_REVENUECAT_API_KEY=test_…`.

Before shipping:

```bash
node scripts/verify-revenuecat-keys.cjs
```

Also create matching subscription product IDs in **App Store Connect**, and connect
ASC credentials under RevenueCat → Apps → Imitation Star iOS.

**Requires a development or store build** — RevenueCat does not run in Expo Go.

The web layer shows **Join Star Club** on the native main menu; purchases run in the
native paywall. Supabase user id is synced via `Purchases.logIn` on sign-in.

## Notes

- **`?client=app`**: persisted in `sessionStorage` so Forum / Profile / Login keep native chrome (no site Header).
- **Create a Dub**: disabled in the native shell; available on desktop web only.
- **Mic**: Expo Go WebView `getUserMedia` can be limited on iOS; prefer a development or production build for recording QA.
- **Subscriptions**: require a dev/production build (not Expo Go).
- Do not commit `.env`.
