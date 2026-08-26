import Link from "next/link";
import { LEGAL_ROUTES } from "@/lib/legal";

type LegalLinksProps = {
  className?: string;
  /** Vertical stack for narrow auth cards. */
  layout?: "inline" | "stack";
};

export default function LegalLinks({
  className = "",
  layout = "inline",
}: LegalLinksProps) {
  const sep = layout === "inline" ? " · " : null;

  return (
    <nav
      className={`legal-links legal-links--${layout} ${className}`.trim()}
      aria-label="Legal"
    >
      <Link href={LEGAL_ROUTES.privacy} className="legal-links__link">
        Privacy Policy
      </Link>
      {sep ? <span className="legal-links__sep" aria-hidden="true">{sep}</span> : null}
      <Link href={LEGAL_ROUTES.terms} className="legal-links__link">
        Terms of Service
      </Link>
      {sep ? <span className="legal-links__sep" aria-hidden="true">{sep}</span> : null}
      <Link href={LEGAL_ROUTES.support} className="legal-links__link">
        Support
      </Link>
    </nav>
  );
}
