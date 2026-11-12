import { Hand } from "lucide-react";
import { Link } from "react-router";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="logo" aria-label="Signara home">
      <span className="logo-mark">
        <Hand size={19} strokeWidth={2.4} />
      </span>
      {!compact && <span>Signara</span>}
    </Link>
  );
}
