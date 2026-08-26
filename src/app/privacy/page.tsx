import type { Metadata } from "next";
import LegalPageShell from "@/components/LegalPageShell";
import {
  APP_NAME,
  APP_ORIGIN,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_EMAIL,
  SUPPORT_EMAIL,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: `Privacy Policy — ${APP_NAME}`,
  description: `How ${APP_NAME} collects, uses, and protects your data.`,
};

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy">
      <p className="legal-page__meta">Effective {LEGAL_EFFECTIVE_DATE}</p>

      <p>
        {APP_NAME} (&quot;we&quot;, &quot;us&quot;) operates the voice dubbing
        game at{" "}
        <a href={APP_ORIGIN} className="legal-page__a">
          {APP_ORIGIN}
        </a>{" "}
        and related mobile apps. This Privacy Policy explains what we collect,
        why we collect it, and the choices you have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> email address, password (stored
          securely by our auth provider), display name, @handle, profile bio,
          and avatar choices.
        </li>
        <li>
          <strong>User-generated content:</strong> voice recordings (&quot;dubs&quot;),
          captions, forum posts, multiplayer collab submissions, and dub packs
          you create on supported platforms.
        </li>
        <li>
          <strong>Usage data:</strong> basic gameplay activity such as stars,
          follows, XP/rank, and pack play counts needed to run community
          features.
        </li>
        <li>
          <strong>Device permissions:</strong> microphone access to record dubs.
          On some devices we may request camera or photo library access for
          optional profile or pack features.
        </li>
        <li>
          <strong>Technical data:</strong> standard web logs (IP address, browser
          or app user agent, timestamps) for security and reliability.
        </li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>Provide accounts, gameplay, forum, and multiplayer features.</li>
        <li>Store and play back your recordings and community posts.</li>
        <li>Improve stability, prevent abuse, and enforce our Terms.</li>
        <li>Respond to support requests.</li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell your personal information.</li>
        <li>
          We do not use AI to score or judge your performances. Community
          ratings come from other players.
        </li>
        <li>
          We do not use your microphone except when you actively record in the
          app.
        </li>
      </ul>

      <h2>Service providers</h2>
      <p>
        We use third-party infrastructure to run the service, including hosting
        (Vercel), authentication and database/storage (Supabase), and optional
        media processing APIs when you use advanced pack tools on the web.
        These providers process data on our behalf under their own terms and
        privacy policies.
      </p>

      <h2>Data retention</h2>
      <p>
        We keep account and content data while your account is active. When you
        delete your account, we delete or anonymize associated profile,
        posts, recordings, and auth credentials, subject to limited backup
        retention for security and legal compliance.
      </p>

      <h2>Children</h2>
      <p>
        {APP_NAME} is not directed to children under 13. We do not knowingly
        collect personal information from children under 13. If you believe a
        child has provided us personal information, contact us and we will
        delete it.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Update your profile in the app.</li>
        <li>Archive or delete your forum posts you authored.</li>
        <li>
          Delete your account from Profile → Account settings (mobile and web).
        </li>
        <li>
          Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="legal-page__a">
            {SUPPORT_EMAIL}
          </a>{" "}
          for access, correction, or deletion requests.
        </li>
      </ul>

      <h2>International users</h2>
      <p>
        Your information may be processed in the United States or other
        countries where our service providers operate. By using {APP_NAME}, you
        consent to this transfer.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy from time to time. We will post the revised
        version on this page and update the effective date above.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions:{" "}
        <a href={`mailto:${LEGAL_EMAIL}`} className="legal-page__a">
          {LEGAL_EMAIL}
        </a>
        <br />
        Support:{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="legal-page__a">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </LegalPageShell>
  );
}
