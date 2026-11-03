import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";

/** Date / greeting / optional subtitle on the left, avatar on the right (opens Settings). */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  const { profile } = useAuth();
  const initial = (profile?.display_name?.trim()[0] ?? "S").toUpperCase();
  return (
    <header className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      <Link to="/settings" className="avatar" aria-label="Settings">
        {initial}
      </Link>
    </header>
  );
}
