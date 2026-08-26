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
  title: `Terms of Service — ${APP_NAME}`,
  description: `Terms for using ${APP_NAME}.`,
};

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service">
      <p className="legal-page__meta">Effective {LEGAL_EFFECTIVE_DATE}</p>

      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of {APP_NAME}{" "}
        at{" "}
        <a href={APP_ORIGIN} className="legal-page__a">
          {APP_ORIGIN}
        </a>{" "}
        and our mobile apps. By creating an account or using the service, you
        agree to these Terms.
      </p>

      <h2>Eligibility</h2>
      <p>
        You must be at least 13 years old (or the minimum age required in your
        country) to use {APP_NAME}. If you are under 18, you should use the
        service with a parent or guardian&apos;s permission.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You are responsible for your account credentials and activity.</li>
        <li>Choose a display name and @handle that are not misleading or offensive.</li>
        <li>You may delete your account at any time from your profile.</li>
      </ul>

      <h2>User content</h2>
      <p>
        You keep ownership of dubs, recordings, and other content you create.
        By posting content to the forum or sharing it in multiplayer, you grant
        us a non-exclusive license to host, store, reproduce, and display that
        content so we can operate the service.
      </p>
      <p>You agree not to post content that:</p>
      <ul>
        <li>Violates someone else&apos;s rights, including copyright.</li>
        <li>Is illegal, harassing, hateful, or sexually explicit.</li>
        <li>Contains personal information of others without consent.</li>
        <li>Attempts to disrupt or abuse the platform.</li>
      </ul>
      <p>
        We may remove content or suspend accounts that violate these Terms or
        create risk for the community, at our discretion.
      </p>

      <h2>Community ratings</h2>
      <p>
        Stars and rankings reflect other players&apos; opinions, not automated
        AI judgments. We do not guarantee accuracy, fairness, or availability of
        any rating feature.
      </p>

      <h2>Microphone and recording</h2>
      <p>
        Recording features require microphone permission. Only record content
        you have the right to dub and share. Do not record private conversations
        or copyrighted material unless you have permission.
      </p>

      <h2>Platform differences</h2>
      <p>
        Some features (such as creating dub packs) may only be available on
        desktop web. Mobile apps access the same account and core gameplay
        through our web-based game shell.
      </p>

      <h2>Disclaimer</h2>
      <p>
        {APP_NAME} is provided &quot;as is&quot; without warranties of any kind.
        We do not guarantee uninterrupted or error-free service.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, we are not liable for indirect,
        incidental, or consequential damages arising from your use of the
        service. Our total liability for any claim is limited to the amount you
        paid us in the past twelve months (typically zero for free users).
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using {APP_NAME} at any time. We may suspend or terminate
        access if you violate these Terms or if we discontinue the service.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these Terms. Continued use after changes means you accept
        the updated Terms. Material changes will be posted on this page.
      </p>

      <h2>Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of California, USA,
        without regard to conflict-of-law rules, except where local consumer
        protection laws require otherwise.
      </p>

      <h2>Contact</h2>
      <p>
        Legal:{" "}
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
