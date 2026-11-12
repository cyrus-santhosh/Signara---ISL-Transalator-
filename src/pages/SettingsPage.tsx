import { useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  LogOut,
  Mail,
  Save,
  ShieldCheck,
  UserRound,
  Volume2,
} from "lucide-react";
import { useNavigate } from "react-router";
import { AppSidebar } from "../components/AppSidebar";
import { AppTopbar } from "../components/AppTopbar";
import { ThemeToggle } from "../components/ThemeToggle";
import { signOut } from "../services/auth";

export function SettingsPage() {
  const navigate = useNavigate();
  const [language, setLanguage] = useState("Hindi");
  const [speed, setSpeed] = useState(1);
  const [saved, setSaved] = useState(false);
  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }
  async function logout() {
    await signOut();
    navigate("/login");
  }
  return (
    <div className="app-frame">
      <AppSidebar />
      <main className="app-main settings-main">
        <AppTopbar title="Profile & settings" subtitle="Make Signara work the way you do" />
        <div className="settings-grid">
          <section className="profile-card">
            <div className="profile-cover">
              <span className="profile-shape one" />
              <span className="profile-shape two" />
            </div>
            <div className="profile-avatar">
              AM
              <button aria-label="Change profile picture">
                <Camera />
              </button>
            </div>
            <h2>Aarav Mehta</h2>
            <p>aarav.mehta@example.com</p>
            <span className="member-badge">
              <ShieldCheck /> Signara member
            </span>
            <div className="profile-stats">
              <div>
                <strong>24</strong>
                <small>Conversations</small>
              </div>
              <div>
                <strong>4</strong>
                <small>Languages</small>
              </div>
            </div>
            <button className="logout-btn" onClick={logout}>
              <LogOut /> Log out
            </button>
          </section>
          <div className="settings-content">
            <section className="settings-card">
              <div className="settings-title">
                <span>
                  <UserRound />
                </span>
                <div>
                  <h2>Personal information</h2>
                  <p>Update your account details.</p>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Full name
                  <div className="input-wrap">
                    <UserRound />
                    <input defaultValue="Aarav Mehta" />
                  </div>
                </label>
                <label>
                  Email address
                  <div className="input-wrap">
                    <Mail />
                    <input defaultValue="aarav.mehta@example.com" />
                  </div>
                </label>
              </div>
            </section>
            <section className="settings-card">
              <div className="settings-title">
                <span>
                  <Volume2 />
                </span>
                <div>
                  <h2>Conversation preferences</h2>
                  <p>Choose how translated replies are delivered.</p>
                </div>
              </div>
              <div className="preference-row">
                <div>
                  <strong>Preferred language</strong>
                  <small>Used for text and spoken replies</small>
                </div>
                <label className="settings-select">
                  <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                    {["Hindi", "Kannada", "Tamil", "English"].map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                  <ChevronDown />
                </label>
              </div>
              <div className="preference-row speed-row">
                <div>
                  <strong>Speech speed</strong>
                  <small>Preview voice playback speed</small>
                </div>
                <div className="speed-control">
                  <button onClick={() => setSpeed(Math.max(0.5, speed - 0.25))}>−</button>
                  <span>{speed.toFixed(2)}×</span>
                  <button onClick={() => setSpeed(Math.min(2, speed + 0.25))}>+</button>
                </div>
              </div>
              <div className="preference-row">
                <div>
                  <strong>Appearance</strong>
                  <small>Switch between light and dark mode</small>
                </div>
                <ThemeToggle />
              </div>
            </section>
            <button className="btn btn-primary save-settings" onClick={save}>
              {saved ? (
                <>
                  <Check /> Saved
                </>
              ) : (
                <>
                  <Save /> Save changes
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
