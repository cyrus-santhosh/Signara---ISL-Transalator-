import { Bell } from "lucide-react";
import { ReactNode } from "react";

export function AppTopbar({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="app-topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="app-top-actions">
        {children}
        <button className="icon-btn" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <span className="avatar">AM</span>
      </div>
    </header>
  );
}
