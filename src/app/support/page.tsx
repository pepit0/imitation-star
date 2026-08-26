import type { Metadata } from "next";
import LegalPageShell from "@/components/LegalPageShell";
import {
  APP_NAME,
  APP_ORIGIN,
  LEGAL_EFFECTIVE_DATE,
  SUPPORT_EMAIL,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: `Support — ${APP_NAME}`,
  description: `Get help with ${APP_NAME} and manage your account.`,
};

export default function SupportPage() {
  return (
    <LegalPageShell title="Support">
      <p className="legal-page__meta">Last updated {LEGAL_EFFECTIVE_DATE}</p>

      <p>
        Need help with {APP_NAME}? We&apos;re here for gameplay questions,
        account issues, and App Store / Google Play review requests.
      </p>

      <h2>Contact</h2>
      <p>
        Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="legal-page__a">
          {SUPPORT_EMAIL}
        </a>
        . Include your display name or @handle and a short description of the
        issue. We typically respond within a few business days.
      </p>

      <h2>Common topics</h2>
      <ul>
        <li>
          <strong>Sign in / password:</strong> use the login screen in the app
          or at{" "}
          <a href={`${APP_ORIGIN}/login`} className="legal-page__a">
            {APP_ORIGIN}/login
          </a>
          . Password reset flows depend on your Supabase auth settings.
        </li>
        <li>
          <strong>Microphone not working:</strong> allow microphone permission
          in iOS Settings → {APP_NAME} or Android app permissions. Expo Go can
          limit mic access — use a development or store build for recording QA.
        </li>
        <li>
          <strong>Forum posts:</strong> you can archive or delete posts you
          authored from the forum player or your profile.
        </li>
        <li>
          <strong>Create a Dub Pack:</strong> pack creation is available on
          desktop web only; mobile apps support play, forum, and profile.
        </li>
      </ul>

      <h2>Delete your account</h2>
      <p>
        Apple and Google require in-app account deletion when accounts can be
        created in the app. Signed-in users can delete their account from{" "}
        <strong>Profile → Delete account</strong> in the mobile or web app.
        Deletion removes your profile, forum posts, recordings, follows, and
        login credentials.
      </p>
      <p>
        If in-app deletion fails, email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="legal-page__a">
          {SUPPORT_EMAIL}
        </a>{" "}
        from the address on your account with the subject &quot;Delete my
        account&quot;.
      </p>

      <h2>Legal</h2>
      <p>
        See our Privacy Policy and Terms of Service linked below for data
        handling, eligibility, and content rules.
      </p>
    </LegalPageShell>
  );
}
