import React, { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const API = "";  // uses CRA proxy → localhost:3001

const LEVELS = [
  { id: "baby",         emoji: "👶", label: "Baby Mode",    color: "#ff9f7b", desc: "5-year-old friendly" },
  { id: "beginner",     emoji: "🌱", label: "Beginner",     color: "#5dffa0", desc: "Just started coding" },
  { id: "intermediate", emoji: "🔥", label: "Intermediate", color: "#7c8fff", desc: "A few months in" },
  { id: "expert",       emoji: "🚀", label: "Expert",       color: "#f7c948", desc: "Full technical depth" },
];

const LINE_TYPE_COLORS = {
  declaration: "#7c8fff",
  logic:       "#f7c948",
  loop:        "#ff9f7b",
  function:    "#5dffa0",
  import:      "#b57bff",
  comment:     "#5c6488",
  other:       "#9ba3cc",
};

const SAMPLES = {
  python: {
    label: "🐍 Python", code: `def calculate_average(numbers):
    if len(numbers) == 0:
        return 0
    total = sum(numbers)
    count = len(numbers)
    average = total / count
    return average

scores = [85, 92, 78, 96, 88]
result = calculate_average(scores)
print(f"Class average: {result:.1f}")`,
  },
  javascript: {
    label: "⚡ JS", code: `const fetchUser = async (userId) => {
  try {
    const response = await fetch(\`/api/users/\${userId}\`);
    if (!response.ok) {
      throw new Error("User not found");
    }
    const user = await response.json();
    return user;
  } catch (error) {
    console.error("Error:", error.message);
    return null;
  }
};

fetchUser(42).then(user => console.log(user));`,
  },
  java: {
    label: "☕ Java", code: `import java.util.ArrayList;
import java.util.List;

public class ShoppingCart {
    private List<String> items = new ArrayList<>();
    private double total = 0.0;

    public void addItem(String name, double price) {
        items.add(name);
        total += price;
        System.out.println(name + " added! Total: $" + total);
    }

    public void checkout() {
        System.out.println("Buying " + items.size() + " items for $" + total);
    }
}`,
  },
  sql: {
    label: "🗄️ SQL", code: `SELECT 
    customers.name,
    COUNT(orders.id) AS total_orders,
    SUM(orders.amount) AS total_spent
FROM customers
LEFT JOIN orders ON customers.id = orders.customer_id
WHERE orders.created_at >= '2024-01-01'
GROUP BY customers.id, customers.name
HAVING total_spent > 100
ORDER BY total_spent DESC
LIMIT 10;`,
  },
};

// ─── API Calls ────────────────────────────────────────────────────────────────
async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function apiGet(path) {
  const res = await fetch(API + path);
  if (!res.ok) return null;
  return res.json();
}

async function apiPatch(path) {
  const res = await fetch(API + path, { method: "PATCH" });
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(API + path, { method: "DELETE" });
  return res.json();
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, []);
  return [copied, copy];
}

// ─── Small Components ─────────────────────────────────────────────────────────
function CopyBtn({ text, small }) {
  const [copied, copy] = useCopy();
  return (
    <button
      className={`copy-btn ${small ? "small" : ""} ${copied ? "copied" : ""}`}
      onClick={(e) => { e.stopPropagation(); copy(text); }}
      title="Copy to clipboard"
    >
      {copied ? "✓ Copied" : "⎘ Copy"}
    </button>
  );
}

function Badge({ children, color, style }) {
  return (
    <span className="badge" style={{ "--badge-color": color, ...style }}>
      {children}
    </span>
  );
}

function Spinner({ size = 32 }) {
  return (
    <div className="spinner" style={{ width: size, height: size }} />
  );
}

// ─── Level Picker ─────────────────────────────────────────────────────────────
function LevelPicker({ selected, onChange }) {
  return (
    <div className="level-grid">
      {LEVELS.map((l) => (
        <button
          key={l.id}
          className={`level-card ${selected === l.id ? "active" : ""}`}
          style={{ "--lc": l.color }}
          onClick={() => onChange(l.id)}
        >
          <span className="lc-emoji">{l.emoji}</span>
          <span className="lc-label">{l.label}</span>
          <span className="lc-desc">{l.desc}</span>
          {selected === l.id && <span className="lc-check">✓</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Code Editor ──────────────────────────────────────────────────────────────
function CodeEditor({ value, onChange, onExplain, loading, level }) {
  const lvl = LEVELS.find((l) => l.id === level);
  const lineCount = value.split("\n").length;

  return (
    <div className="editor-panel">
      <div className="editor-topbar">
        <div className="editor-dots">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <span className="editor-label">code_to_explain.txt</span>
        <div className="editor-actions">
          <span className="editor-meta">{lineCount} lines · {value.length} chars</span>
          {value && <CopyBtn text={value} small />}
          {value && (
            <button className="editor-clear" onClick={() => onChange("")}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      <div className="editor-body">
        <div className="line-numbers" aria-hidden="true">
          {value.split("\n").map((_, i) => (
            <div key={i} className="ln">{i + 1}</div>
          ))}
        </div>
        <textarea
          className="code-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"// Paste your code here...\n// Or pick a sample above 👆\n\nfunction magic() {\n  return 'ready to learn!';\n}"}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>

      <div className="editor-bottombar">
        <div className="sample-row">
          {Object.entries(SAMPLES).map(([key, s]) => (
            <button key={key} className="sample-chip" onClick={() => onChange(s.code)}>
              {s.label}
            </button>
          ))}
        </div>
        <button
          className="explain-btn"
          onClick={onExplain}
          disabled={loading || !value.trim()}
          style={{ "--lc": lvl?.color }}
        >
          {loading
            ? <><Spinner size={18} /> Thinking…</>
            : <>{lvl?.emoji} Explain as {lvl?.label}</>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Concepts Panel ───────────────────────────────────────────────────────────
function ConceptsPanel({ concepts }) {
  if (!concepts?.length) return null;
  return (
    <div className="concepts-panel">
      <div className="panel-title">🧩 Key Concepts</div>
      <div className="concepts-grid">
        {concepts.map((c, i) => (
          <div key={i} className="concept-card">
            <span className="concept-emoji">{c.emoji}</span>
            <div>
              <div className="concept-name">{c.concept}</div>
              <div className="concept-desc">{c.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Line Explainer ───────────────────────────────────────────────────────────
function LineExplainer({ lines }) {
  const [openIdx, setOpenIdx] = useState(null);
  const [expandAll, setExpandAll] = useState(false);

  const toggle = (i) => setOpenIdx(openIdx === i ? null : i);

  const isOpen = (i) => expandAll || openIdx === i;

  return (
    <div className="line-explainer">
      <div className="le-header">
        <div className="panel-title">🔍 Line-by-Line Breakdown</div>
        <button className="expand-all-btn" onClick={() => { setExpandAll(!expandAll); setOpenIdx(null); }}>
          {expandAll ? "Collapse All ▲" : "Expand All ▼"}
        </button>
      </div>
      <div className="le-list">
        {lines.map((item, i) => (
          <div
            key={i}
            className={`le-row ${isOpen(i) ? "open" : ""}`}
            onClick={() => !expandAll && toggle(i)}
            style={{ "--type-color": LINE_TYPE_COLORS[item.type] || LINE_TYPE_COLORS.other }}
          >
            <div className="le-top">
              <span className="le-num">{item.line ?? i + 1}</span>
              <div className="le-type-dot" title={item.type} />
              <code className="le-code">{item.code}</code>
              {!expandAll && (
                <span className="le-arrow">{isOpen(i) ? "▲" : "▼"}</span>
              )}
            </div>
            {isOpen(i) && (
              <div className="le-explanation">
                <span className="le-bubble">💬</span>
                <span>{item.explanation}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="le-legend">
        {Object.entries(LINE_TYPE_COLORS).map(([type, color]) => (
          <span key={type} className="legend-item" style={{ "--tc": color }}>
            <span className="legend-dot" />
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────
function QuizSection({ quiz, explanationId }) {
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const pick = (qi, oi) => {
    if (submitted) return;
    setAnswers((p) => ({ ...p, [qi]: oi }));
  };

  const submit = async () => {
    let s = 0;
    quiz.forEach((q, i) => { if (answers[i] === q.correct) s++; });
    setScore(s);
    setSubmitted(true);
    if (s === quiz.length) setShowConfetti(true);
    try {
      await apiPost("/api/quiz-result", { explanationId, score: s, total: quiz.length });
    } catch {}
  };

  const reset = () => { setAnswers({}); setSubmitted(false); setScore(0); setShowConfetti(false); };

  const pct = Math.round((score / quiz.length) * 100);
  const allAnswered = Object.keys(answers).length === quiz.length;

  return (
    <div className="quiz-section">
      <div className="panel-title">🧠 Knowledge Check</div>

      {submitted && (
        <div className={`score-card ${pct === 100 ? "perfect" : pct >= 50 ? "good" : "retry"}`}>
          {showConfetti && <div className="confetti-row">🎊🎉🥳🎊🎉</div>}
          <div className="score-circle">{pct}%</div>
          <div className="score-msg">
            {pct === 100 ? "Perfect! You absolutely crushed it! 🔥"
              : pct >= 75 ? `Awesome! ${score}/${quiz.length} — Keep it up! 💪`
              : pct >= 50 ? `Good effort! ${score}/${quiz.length} — Review and retry 👍`
              : `${score}/${quiz.length} — No worries, keep practicing! 🌱`}
          </div>
          <button className="retry-btn" onClick={reset}>Try Again 🔄</button>
        </div>
      )}

      {quiz.map((q, qi) => (
        <div key={qi} className={`quiz-card ${submitted ? "revealed" : ""}`}>
          <div className="qcard-header">
            <span className="q-badge">Q{qi + 1}</span>
            <span className="q-text">{q.question}</span>
          </div>
          <div className="q-options">
            {q.options.map((opt, oi) => {
              const sel = answers[qi] === oi;
              const correct = oi === q.correct;
              let cls = "q-opt";
              if (submitted) {
                if (correct) cls += " correct";
                else if (sel && !correct) cls += " wrong";
                else cls += " dimmed";
              } else if (sel) cls += " selected";
              return (
                <button key={oi} className={cls} onClick={() => pick(qi, oi)}>
                  <span className="opt-letter">{String.fromCharCode(65 + oi)}</span>
                  <span className="opt-text">{opt}</span>
                  {submitted && correct && <span className="opt-icon">✓</span>}
                  {submitted && sel && !correct && <span className="opt-icon">✗</span>}
                </button>
              );
            })}
          </div>
          {submitted && q.explanation && (
            <div className="q-hint">
              <span>💡</span> <span>{q.explanation}</span>
            </div>
          )}
        </div>
      ))}

      {!submitted && (
        <button
          className="submit-quiz"
          disabled={!allAnswered}
          onClick={submit}
        >
          {allAnswered ? "Submit Answers ✅" : `Answer all ${quiz.length - Object.keys(answers).length} remaining…`}
        </button>
      )}
    </div>
  );
}

// ─── Result Panel ─────────────────────────────────────────────────────────────
function ResultPanel({ result, onClose }) {
  const [tab, setTab] = useState("overview");
  const lvl = LEVELS.find((l) => l.id === result.level);

  return (
    <div className="result-panel">
      {/* Result header */}
      <div className="rp-header">
        <div className="rp-title-row">
          <span className="rp-lang-emoji">{result.emoji}</span>
          <div>
            <div className="rp-title">{result.title}</div>
            <div className="rp-meta-row">
              <Badge color={lvl?.color}>{lvl?.emoji} {lvl?.label}</Badge>
              <Badge color="#7c8fff">{result.language}</Badge>
              {result.lineCount > 0 && <Badge color="#9ba3cc">{result.lineCount} lines</Badge>}
            </div>
          </div>
          <div className="rp-actions">
            <CopyBtn text={result.overall} />
            <button className="rp-close" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="rp-tabs">
          {[
            { id: "overview", label: "💡 Overview" },
            ...(result.concepts?.length ? [{ id: "concepts", label: "🧩 Concepts" }] : []),
            ...(result.lines?.length ? [{ id: "lines", label: `🔍 Lines (${result.lines.length})` }] : []),
            ...(result.quiz?.length ? [{ id: "quiz", label: `🧠 Quiz (${result.quiz.length})` }] : []),
          ].map((t) => (
            <button
              key={t.id}
              className={`rp-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="rp-body">
        {tab === "overview" && (
          <div className="overview-tab">
            <div className="ai-bubble">
              <div className="ai-avatar">🤖</div>
              <div className="ai-text">{result.overall}</div>
            </div>
            {/* Original code */}
            <div className="code-preview">
              <div className="cp-header">
                <span className="cp-label">{result.emoji} Original Code</span>
                <CopyBtn text={result.code} small />
              </div>
              <pre className="cp-code"><code>{result.code}</code></pre>
            </div>
            {/* Quick-nav hints */}
            <div className="quick-nav">
              {result.concepts?.length > 0 && (
                <button className="qn-btn" onClick={() => setTab("concepts")}>
                  🧩 {result.concepts.length} key concepts →
                </button>
              )}
              {result.lines?.length > 0 && (
                <button className="qn-btn" onClick={() => setTab("lines")}>
                  🔍 Line-by-line breakdown →
                </button>
              )}
              {result.quiz?.length > 0 && (
                <button className="qn-btn accent" onClick={() => setTab("quiz")}>
                  🧠 Test your knowledge →
                </button>
              )}
            </div>
          </div>
        )}

        {tab === "concepts" && <ConceptsPanel concepts={result.concepts} />}
        {tab === "lines" && result.lines?.length > 0 && <LineExplainer lines={result.lines} />}
        {tab === "quiz" && result.quiz?.length > 0 && (
          <QuizSection quiz={result.quiz} explanationId={result.id} />
        )}
      </div>
    </div>
  );
}

// ─── History Sidebar ──────────────────────────────────────────────────────────
function HistorySidebar({ history, onLoad, onDelete, onBookmark, activeId, onClose }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = history.filter((h) => {
    if (filter === "bookmarked" && !h.bookmarked) return false;
    if (search && !h.title?.toLowerCase().includes(search.toLowerCase()) &&
        !h.language?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <aside className="sidebar">
      <div className="sb-header">
        <span className="sb-title">📚 History</span>
        <button className="sb-close" onClick={onClose}>✕</button>
      </div>

      <div className="sb-search">
        <input
          className="sb-input"
          placeholder="🔎 Search history…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="sb-filters">
        <button className={`sb-filter ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          All ({history.length})
        </button>
        <button className={`sb-filter ${filter === "bookmarked" ? "active" : ""}`} onClick={() => setFilter("bookmarked")}>
          ★ Saved ({history.filter((h) => h.bookmarked).length})
        </button>
      </div>

      <div className="sb-list">
        {filtered.length === 0 && (
          <div className="sb-empty">
            {search ? "No matches found" : filter === "bookmarked" ? "No bookmarks yet" : "No history yet"}
          </div>
        )}
        {filtered.map((h) => (
          <div
            key={h.id}
            className={`sb-item ${activeId === h.id ? "active" : ""}`}
            onClick={() => onLoad(h.id)}
          >
            <div className="sbi-top">
              <span className="sbi-lang">{h.language}</span>
              <span className="sbi-time">{timeAgo(h.created_at)}</span>
            </div>
            <div className="sbi-title">{h.title || "Untitled"}</div>
            <div className="sbi-preview">{h.preview}</div>
            <div className="sbi-actions">
              <button
                className={`sbi-bookmark ${h.bookmarked ? "on" : ""}`}
                title={h.bookmarked ? "Remove bookmark" : "Bookmark"}
                onClick={(e) => { e.stopPropagation(); onBookmark(h.id); }}
              >
                {h.bookmarked ? "★" : "☆"}
              </button>
              <button
                className="sbi-delete"
                title="Delete"
                onClick={(e) => { e.stopPropagation(); onDelete(h.id); }}
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ─── Loader Screen ────────────────────────────────────────────────────────────
function LoadingOverlay() {
  const phrases = [
    "Reading your code carefully… 👀",
    "Understanding every line… 🧐",
    "Cooking up the explanation… 🍳",
    "Generating quiz questions… 📝",
    "Identifying key concepts… 🧩",
    "Almost ready! ✨",
  ];
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(5);

  useEffect(() => {
    const t1 = setInterval(() => setIdx((i) => Math.min(i + 1, phrases.length - 1)), 2200);
    const t2 = setInterval(() => setProgress((p) => Math.min(p + Math.random() * 12, 92)), 800);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  return (
    <div className="loading-overlay">
      <div className="lo-card">
        <div className="lo-spinner-ring" />
        <div className="lo-phrase">{phrases[idx]}</div>
        <div className="lo-bar-wrap">
          <div className="lo-bar" style={{ width: `${progress}%` }} />
        </div>
        <div className="lo-hint">Running 4 AI analyses in parallel…</div>
      </div>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ stats }) {
  if (!stats) return null;
  return (
    <div className="stats-bar">
      <div className="stat"><span className="stat-n">{stats.total}</span><span className="stat-l">Explained</span></div>
      <div className="stat-div" />
      <div className="stat"><span className="stat-n">{stats.bookmarked}</span><span className="stat-l">Saved</span></div>
      <div className="stat-div" />
      <div className="stat"><span className="stat-n">{stats.quizzes}</span><span className="stat-l">Quizzes</span></div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [code, setCode] = useState("");
  const [level, setLevel] = useState("baby");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState("dark");
  const resultRef = useRef(null);

  // Load history + stats on mount
  useEffect(() => {
    loadHistory();
    loadStats();
  }, []);

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const loadHistory = async () => {
    try {
      const data = await apiGet("/api/history");
      if (data) setHistory(data);
    } catch {}
  };

  const loadStats = async () => {
    try {
      const data = await apiGet("/api/stats");
      if (data) setStats(data);
    } catch {}
  };

  const handleExplain = async () => {
    if (!code.trim()) { setError("Please paste some code first!"); return; }
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const data = await apiPost("/api/explain", { code: code.trim(), level });
      setResult(data);
      // Optimistic history update
      setHistory((prev) => [{
        id: data.id, language: data.language, level: data.level,
        title: data.title, bookmarked: false,
        preview: code.trim().substring(0, 100),
        created_at: new Date().toISOString(),
      }, ...prev.slice(0, 49)]);
      loadStats();
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadFromHistory = async (id) => {
    try {
      const data = await apiGet(`/api/explanation/${id}`);
      if (data) {
        setResult(data);
        setCode(data.code_snippet || data.code || "");
        setLevel(data.level);
        setSidebarOpen(false);
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
      }
    } catch (e) {
      setError("Failed to load explanation.");
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiDelete(`/api/explanation/${id}`);
      setHistory((prev) => prev.filter((h) => h.id !== id));
      if (result?.id === id) setResult(null);
      loadStats();
    } catch {}
  };

  const handleBookmark = async (id) => {
    try {
      const res = await apiPatch(`/api/explanation/${id}/bookmark`);
      setHistory((prev) =>
        prev.map((h) => h.id === id ? { ...h, bookmarked: res.bookmarked } : h)
      );
    } catch {}
  };

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""}`}>

      {/* Header */}
      <header className="app-header">
        <div className="ah-left">
          <button
            className={`sidebar-toggle ${sidebarOpen ? "active" : ""}`}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle history"
          >
            <span /><span /><span />
          </button>
          <div className="brand">
            <span className="brand-icon">🤖</span>
            <span className="brand-name">CodeBuddy</span>
            <span className="brand-tag">AI Explainer</span>
          </div>
        </div>

        <div className="ah-center">
          <StatsBar stats={stats} />
        </div>

        <div className="ah-right">
          <button
            className="theme-toggle"
            onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
            title="Toggle theme"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      {sidebarOpen && (
        <>
          <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
          <HistorySidebar
            history={history}
            onLoad={handleLoadFromHistory}
            onDelete={handleDelete}
            onBookmark={handleBookmark}
            activeId={result?.id}
            onClose={() => setSidebarOpen(false)}
          />
        </>
      )}

      {/* Main content */}
      <main className="app-main">
        {/* Hero */}
        <div className="hero">
          <h1 className="hero-title">
            Paste code.<br />
            <span className="hero-highlight">Understand everything.</span>
          </h1>
          <p className="hero-sub">
            Choose your level · Get AI explanations · Learn line by line · Test yourself
          </p>
        </div>

        {/* Step 1: Level */}
        <div className="step-block">
          <div className="step-label">
            <span className="step-num">1</span>
            Choose Your Level
          </div>
          <LevelPicker selected={level} onChange={setLevel} />
        </div>

        {/* Step 2: Code */}
        <div className="step-block">
          <div className="step-label">
            <span className="step-num">2</span>
            Paste Your Code
          </div>
          <CodeEditor
            value={code}
            onChange={(v) => { setCode(v); if (error) setError(""); }}
            onExplain={handleExplain}
            loading={loading}
            level={level}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="error-banner">
            <span>⚠️</span>
            <span>{error}</span>
            <button onClick={() => setError("")}>✕</button>
          </div>
        )}

        {/* Loading */}
        {loading && <LoadingOverlay />}

        {/* Result */}
        {result && !loading && (
          <div ref={resultRef} className="step-block result-wrapper">
            <div className="step-label">
              <span className="step-num">3</span>
              Your Explanation
            </div>
            <ResultPanel
              result={result}
              onClose={() => setResult(null)}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-inner">
          <span className="footer-brand">CodeBuddy</span>
          <span className="footer-sep">·</span>
          <span>AI Code Explainer for Beginners</span>
          <span className="footer-sep">·</span>
          <span>By <strong>Amna Yoosuf</strong></span>
        </div>
      </footer>
    </div>
  );
}
