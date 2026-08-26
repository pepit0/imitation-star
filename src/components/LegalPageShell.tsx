import type { ReactNode } from "react";
import Link from "next/link";
import LegalLinks from "@/components/LegalLinks";
import { APP_NAME } from "@/lib/legal";

type LegalPageShellProps = {
  title: string;
  children: ReactNode;
};

export default function LegalPageShell({ title, children }: LegalPageShellProps) {
  return (
    <div className="legal-page">
      <article className="legal-page__card">
        <p className="legal-page__eyebrow">{APP_NAME}</p>
        <h1 className="legal-page__title">{title}</h1>
        <div className="legal-page__body">{children}</div>
        <footer className="legal-page__footer">
          <LegalLinks layout="stack" />
          <Link href="/play" className="legal-page__back">
            ← Back to game
          </Link>
        </footer>
      </article>
    </div>
  );
}
