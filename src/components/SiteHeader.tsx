import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="nav-shell">
        <Logo />
        <nav className={open ? "nav-links open" : "nav-links"} aria-label="Primary navigation">
          <Link to="/" onClick={() => setOpen(false)}>
            Home
          </Link>
          <a href="/#how" onClick={() => setOpen(false)}>
            How it works
          </a>
          <a href="/#languages" onClick={() => setOpen(false)}>
            Languages
          </a>
          <a href="/#faq" onClick={() => setOpen(false)}>
            FAQ
          </a>
        </nav>
        <div className="nav-actions">
          <ThemeToggle />
          <Link className="login-link" to="/login">
            Log in
          </Link>
          <Link className="btn btn-primary btn-small" to="/session">
            Get started <span aria-hidden>↗</span>
          </Link>
          <button
            className="menu-btn"
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  );
}
