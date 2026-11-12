import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  MoreHorizontal,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AppSidebar } from "../components/AppSidebar";
import { AppTopbar } from "../components/AppTopbar";
import { mockConversations } from "../services/api";

export function HistoryPage() {
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState(mockConversations);
  const [selected, setSelected] = useState(mockConversations[0]);
  const filtered = useMemo(
    () => conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase())),
    [conversations, query],
  );
  function deleteSelected() {
    const remaining = conversations.filter((conversation) => conversation.id !== selected.id);
    setConversations(remaining);
    if (remaining[0]) setSelected(remaining[0]);
  }
  return (
    <div className="app-frame">
      <AppSidebar />
      <main className="app-main">
        <AppTopbar title="Conversation history" subtitle="Revisit the moments that mattered" />
        <div className="history-layout">
          <section className="history-list-panel">
            <div className="search-row">
              <label>
                <Search size={18} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search conversations"
                />
              </label>
              <button className="icon-btn">
                <SlidersHorizontal size={18} />
              </button>
            </div>
            <div className="history-label">
              <span>RECENT</span>
              <small>{filtered.length} conversations</small>
            </div>
            <div className="history-list">
              {filtered.map((conversation, index) => (
                <motion.button
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.06 }}
                  key={conversation.id}
                  onClick={() => setSelected(conversation)}
                  className={selected.id === conversation.id ? "active" : ""}
                >
                  <span className="history-icon">
                    <Sparkles />
                  </span>
                  <span>
                    <strong>{conversation.title}</strong>
                    <small>
                      <CalendarDays /> {conversation.date} · {conversation.language}
                    </small>
                  </span>
                  <ChevronRight />
                </motion.button>
              ))}
              {!filtered.length && (
                <div className="empty-history">
                  <Search />
                  <h3>No conversations found</h3>
                  <p>Try a different word or filter.</p>
                </div>
              )}
            </div>
          </section>
          <section className="history-detail">
            <div className="detail-head">
              <div>
                <span className="language-badge">
                  {selected.language.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h2>{selected.title}</h2>
                  <p>
                    <Clock3 /> {selected.date} · {selected.messages.length} messages
                  </p>
                </div>
              </div>
              <div>
                <button className="icon-btn" aria-label="Delete" onClick={deleteSelected}>
                  <Trash2 />
                </button>
                <button className="icon-btn">
                  <MoreHorizontal />
                </button>
              </div>
            </div>
            <div className="history-messages">
              <div className="date-divider">
                <span>Conversation transcript</span>
              </div>
              {selected.messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08 }}
                  className={`history-message ${message.role}`}
                >
                  <span className="message-author">
                    {message.role === "user" ? "YOU SIGNED" : "SIGNARA"} · {message.time}
                  </span>
                  <div>
                    <p>{message.text}</p>
                    {message.translated && <small>{message.translated}</small>}
                    {message.role === "assistant" && (
                      <button>
                        <Play size={14} /> Play audio
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
