import { History, Home, LogOut, Settings, Video } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const items = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/session", icon: Video, label: "Live session" },
  { to: "/history", icon: History, label: "History" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function AppSidebar() {
  const location = useLocation();
  return (
    <aside className="app-sidebar">
      <Logo />
      <nav aria-label="App navigation">
        {items.map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to} className={location.pathname === to ? "active" : ""}>
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <ThemeToggle />
        <Link to="/login">
          <LogOut size={19} />
          <span>Log out</span>
        </Link>
      </div>
    </aside>
  );
}
