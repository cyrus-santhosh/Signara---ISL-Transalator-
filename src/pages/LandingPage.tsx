import { Suspense, lazy, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  AudioLines,
  BrainCircuit,
  ChevronDown,
  CirclePlay,
  Hand,
  Languages,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Volume2,
} from "lucide-react";
import { Link } from "react-router";
import { SiteHeader } from "../components/SiteHeader";

const KeypointScene = lazy(() => import("../components/KeypointScene"));
const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.65 },
};

const steps = [
  {
    icon: Hand,
    n: "01",
    title: "You sign naturally",
    text: "Use familiar Indian Sign Language in front of any camera.",
  },
  {
    icon: ScanLine,
    n: "02",
    title: "We map movement",
    text: "Live hand and body keypoints capture every meaningful gesture.",
  },
  {
    icon: BrainCircuit,
    n: "03",
    title: "AI understands",
    text: "Context-aware AI turns glosses into fluent conversation.",
  },
  {
    icon: Volume2,
    n: "04",
    title: "Signara speaks",
    text: "Replies appear as clear text and natural multilingual speech.",
  },
];

const faqs = [
  [
    "Do I need special hardware?",
    "No. Signara works with the camera already built into your phone, tablet, or laptop.",
  ],
  [
    "Which sign language does it recognise?",
    "The current experience is designed around Indian Sign Language, with the architecture ready for additional sign languages.",
  ],
  [
    "Is my camera footage stored?",
    "No video needs to be stored. The production pipeline can send only anonymised keypoint coordinates for recognition.",
  ],
  [
    "Can I use Signara without a camera?",
    "Yes. Manual gloss chips and a text input keep every conversation accessible.",
  ],
];

function HeroVisual() {
  return (
    <motion.div
      className="hero-visual"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.15 }}
    >
      <div className="visual-orbit orbit-one" />
      <div className="visual-orbit orbit-two" />
      <Suspense fallback={<div className="scene-loader" />}>
        <KeypointScene />
      </Suspense>
      <motion.div
        className="float-card card-detected"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity }}
      >
        <span className="status-dot" />
        <div>
          <small>LIVE DETECTION</small>
          <strong>Hand detected</strong>
        </div>
        <ScanLine size={19} />
      </motion.div>
      <motion.div
        className="float-card card-sign"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 4.8, repeat: Infinity }}
      >
        <div className="confidence-ring">94</div>
        <div>
          <small>SIGN RECOGNISED</small>
          <strong>WATER</strong>
        </div>
      </motion.div>
      <motion.div
        className="float-card card-speaking"
        animate={{ x: [0, 6, 0] }}
        transition={{ duration: 4.4, repeat: Infinity }}
      >
        <span className="sound-icon">
          <AudioLines size={18} />
        </span>
        <div>
          <small>VOICE OUTPUT</small>
          <strong>Speaking Hindi</strong>
        </div>
      </motion.div>
      <div className="hotspot hotspot-one" />
      <div className="hotspot hotspot-two" />
      <div className="hotspot hotspot-three" />
    </motion.div>
  );
}

function ProductPreview() {
  return (
    <div className="preview-stage">
      <motion.div className="desktop-preview" whileHover={{ y: -5 }}>
        <div className="mock-bar">
          <div className="mock-logo">
            <Hand size={14} /> Signara
          </div>
          <span>Live conversation</span>
          <div className="mock-user">AM</div>
        </div>
        <div className="mock-layout">
          <div className="mock-video">
            <div className="recording">
              <i /> RECORDING
            </div>
            <svg viewBox="0 0 500 280" aria-hidden="true">
              <path d="M250 42v44m0 0-85 62m85-62 88 62M165 148l-38 74m38-74 45 70m128-70 35 74m-35-74-48 70M250 86l-8 116m8-116 42 116" />
              {[250, 250, 165, 338, 127, 210, 373, 290, 242, 292].map((x, i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={[42, 86, 148, 148, 222, 218, 222, 218, 202, 202][i]}
                  r="6"
                />
              ))}
            </svg>
            <div className="mock-caption">
              <span>ISL</span>I want water.
            </div>
          </div>
          <div className="mock-chat">
            <p className="mock-label">CONVERSATION</p>
            <div className="mini-bubble user">I want water.</div>
            <div className="mini-bubble assistant">ज़रूर। ठंडा या सामान्य?</div>
            <div className="mini-wave">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((v) => (
                <i key={v} />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
      <motion.div
        className="mobile-preview"
        initial={{ y: 20 }}
        whileInView={{ y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="phone-notch" />
        <small>Signara live</small>
        <div className="phone-video">
          <div className="phone-hand">
            <Hand />
          </div>
          <span>Signing</span>
        </div>
        <div className="phone-caption">“I want water.”</div>
        <div className="phone-action">
          <AudioLines size={17} /> Playing in Hindi
        </div>
      </motion.div>
    </div>
  );
}

export function LandingPage() {
  const [openFaq, setOpenFaq] = useState(0);
  return (
    <div className="landing-page">
      <SiteHeader />
      <main>
        <section className="hero section-shell">
          <div className="hero-copy">
            <motion.div
              className="eyebrow"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Sparkles size={15} /> Built for Indian Sign Language
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
            >
              Sign. Be understood.
              <br />
              In <span>any language.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
            >
              Real-time ISL recognition that turns every sign into a natural conversation — in text
              and speech.
            </motion.p>
            <motion.div
              className="hero-actions"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24 }}
            >
              <Link className="btn btn-dark" to="/session">
                Start signing <ArrowRight size={18} />
              </Link>
              <a className="btn btn-ghost" href="#preview">
                <CirclePlay size={19} /> Watch demo
              </a>
            </motion.div>
            <div className="trust-row">
              <span className="avatar-stack">
                <i>R</i>
                <i>M</i>
                <i>K</i>
              </span>
              <span>
                <strong>4.9/5</strong> from early testers
              </span>
              <span className="trust-divider" />
              <span>
                <ShieldCheck size={16} /> Private by design
              </span>
            </div>
          </div>
          <HeroVisual />
        </section>

        <section className="trust-strip">
          <span>Designed for everyday connection</span>
          <b>ISLRTC</b>
          <b>AI4BHARAT</b>
          <b>BHASHINI</b>
          <b>NASSCOM</b>
          <b>INDIAai</b>
        </section>

        <section id="how" className="section-shell content-section">
          <motion.div className="section-heading" {...reveal}>
            <div>
              <span className="kicker">HOW IT WORKS</span>
              <h2>
                From movement to meaning,
                <br />
                in four simple steps.
              </h2>
            </div>
            <p>
              No wearables. No complicated setup.
              <br />
              Just open your camera and communicate.
            </p>
          </motion.div>
          <div className="steps-grid">
            {steps.map(({ icon: Icon, n, title, text }, index) => (
              <motion.article
                className="step-card"
                key={title}
                {...reveal}
                transition={{ delay: index * 0.08, duration: 0.55 }}
              >
                <div className="step-top">
                  <span className="step-icon">
                    <Icon />
                  </span>
                  <small>{n}</small>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section id="preview" className="preview-section content-section">
          <div className="section-shell">
            <motion.div className="center-heading" {...reveal}>
              <span className="kicker">ONE SPACE. NATURAL CONVERSATION.</span>
              <h2>
                A conversation that
                <br />
                <span>looks as good as it feels.</span>
              </h2>
              <p>
                Everything important stays visible — your signs, live captions, translations, and
                the reply.
              </p>
            </motion.div>
            <motion.div {...reveal}>
              <ProductPreview />
            </motion.div>
          </div>
        </section>

        <section id="languages" className="section-shell content-section">
          <motion.div className="section-heading" {...reveal}>
            <div>
              <span className="kicker">SPEAKS YOUR LANGUAGE</span>
              <h2>
                One sign. Four voices.
                <br />
                More coming soon.
              </h2>
            </div>
            <p>
              Choose how Signara responds — every reply is displayed as text and can be spoken
              aloud.
            </p>
          </motion.div>
          <div className="language-grid">
            {[
              ["हिंदी", "Hindi", "नमस्ते, मैं आपकी मदद कर सकता हूँ।", "#fff3d8"],
              ["ಕನ್ನಡ", "Kannada", "ನಮಸ್ಕಾರ, ನಾನು ಸಹಾಯ ಮಾಡಬಲ್ಲೆ.", "#dff5e8"],
              ["தமிழ்", "Tamil", "வணக்கம், நான் உதவ முடியும்.", "#e4edff"],
              ["English", "English", "Hello, I can help you.", "#f1e8ff"],
            ].map(([script, name, phrase, color], index) => (
              <motion.article
                className="language-card"
                key={name}
                style={{ "--card-color": color } as React.CSSProperties}
                {...reveal}
                transition={{ delay: index * 0.07 }}
              >
                <span className="language-index">0{index + 1}</span>
                <strong>{script}</strong>
                <h3>{name}</h3>
                <p>{phrase}</p>
                <button aria-label={`Listen in ${name}`}>
                  <Volume2 size={17} />
                </button>
              </motion.article>
            ))}
          </div>
        </section>

        <section id="faq" className="faq-section content-section">
          <div className="section-shell faq-layout">
            <motion.div {...reveal}>
              <span className="kicker">QUESTIONS, ANSWERED</span>
              <h2>
                Curious about
                <br />
                Signara?
              </h2>
              <p>Everything you need to know before your first conversation.</p>
              <Link to="/session">
                Try it for free <ArrowRight size={16} />
              </Link>
            </motion.div>
            <motion.div className="faq-list" {...reveal}>
              {faqs.map(([q, a], index) => (
                <div className={`faq-item ${openFaq === index ? "open" : ""}`} key={q}>
                  <button
                    onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
                    aria-expanded={openFaq === index}
                  >
                    <span>{q}</span>
                    <ChevronDown />
                  </button>
                  <div className="faq-answer">
                    <p>{a}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="cta-section section-shell">
          <motion.div className="cta-card" {...reveal}>
            <div className="cta-glow" />
            <Languages size={40} />
            <h2>
              Every conversation
              <br />
              deserves to be heard.
            </h2>
            <p>Start signing. Signara will take care of the rest.</p>
            <Link className="btn btn-light" to="/session">
              Start a conversation <ArrowRight size={18} />
            </Link>
          </motion.div>
        </section>
      </main>
      <footer>
        <div className="section-shell footer-inner">
          <div>
            <span className="footer-brand">
              <Hand /> Signara
            </span>
            <p>Making every sign part of the conversation.</p>
          </div>
          <div className="footer-links">
            <div>
              <strong>Product</strong>
              <a href="#how">How it works</a>
              <a href="#languages">Languages</a>
            </div>
            <div>
              <strong>Company</strong>
              <a href="#faq">Accessibility</a>
              <a href="#faq">Privacy</a>
            </div>
            <div>
              <strong>App</strong>
              <Link to="/session">Live session</Link>
              <Link to="/history">History</Link>
            </div>
          </div>
        </div>
        <div className="section-shell footer-bottom">
          <span>© 2026 Signara</span>
          <span>Designed with care in India</span>
        </div>
      </footer>
    </div>
  );
}
