import { lazy, Suspense, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Logo } from "../components/Logo";
import { signIn, signUp } from "../services/auth";

const KeypointScene = lazy(() => import("../components/KeypointScene"));

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await (mode === "login" ? signIn : signUp)(email, password);
      navigate("/session");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function continueWithGoogle() {
    setError("");
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    navigate("/session");
  }

  return (
    <main className="auth-page">
      <section className="auth-form-side">
        <div className="auth-top">
          <Logo />
          <Link to="/">
            <ArrowLeft size={16} /> Back home
          </Link>
        </div>
        <motion.div
          className="auth-form-wrap"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="kicker">{mode === "login" ? "WELCOME BACK" : "CREATE YOUR SPACE"}</span>
          <h1>{mode === "login" ? "Continue the conversation." : "Start being understood."}</h1>
          <p>
            {mode === "login"
              ? "Sign in to access your conversations and preferences."
              : "Create a free account to save conversations across devices."}
          </p>
          <button className="google-btn" onClick={continueWithGoogle} disabled={loading}>
            <span className="google-g">G</span> Continue with Google
          </button>
          <div className="form-divider">
            <span>or continue with email</span>
          </div>
          <form onSubmit={submit}>
            <label>
              Email address
              <div className="input-wrap">
                <Mail size={18} />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                />
              </div>
            </label>
            <label>
              Password
              <div className="input-wrap">
                <LockKeyhole size={18} />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {mode === "login" && (
              <div className="form-meta">
                <label>
                  <input type="checkbox" defaultChecked /> Remember me
                </label>
                <button type="button">Forgot password?</button>
              </div>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="btn btn-primary auth-submit" disabled={loading}>
              {loading ? (
                <LoaderCircle className="spin" size={19} />
              ) : (
                <>
                  {mode === "login" ? "Sign in" : "Create account"} <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <p className="auth-switch">
            {mode === "login" ? "New to Signara?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </motion.div>
        <p className="auth-legal">By continuing, you agree to our Terms and Privacy Policy.</p>
      </section>
      <section className="auth-visual-side">
        <div className="auth-orb orb-a" />
        <div className="auth-orb orb-b" />
        <Suspense fallback={<div className="scene-loader" />}>
          <KeypointScene />
        </Suspense>
        <motion.div
          className="auth-detection"
          animate={{ y: [0, -9, 0] }}
          transition={{ duration: 4, repeat: Infinity }}
        >
          <span>
            <CheckCircle2 />
          </span>
          <div>
            <small>LIVE RECOGNITION</small>
            <strong>Movement understood</strong>
          </div>
        </motion.div>
        <div className="auth-quote">
          <p>“Communication should never depend on who can hear it.”</p>
          <span>Built visual-first, for everyone.</span>
        </div>
      </section>
    </main>
  );
}
