import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem("signara-theme") === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("signara-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <button
      className="icon-btn"
      onClick={() => setDark((value) => !value)}
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
