require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");
let Anthropic = null;
try {
  Anthropic = require("@anthropic-ai/sdk");
} catch (_) {}

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50kb" }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: "Too many requests — please wait a few minutes." },
});
app.use("/api/", apiLimiter);

const useAnthropic = Boolean(process.env.ANTHROPIC_API_KEY) && process.env.USE_ANTHROPIC === "true";
const anthropic = useAnthropic && Anthropic
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// ─── In-Memory Fallback Store ─────────────────────────────────────────────────
const memStore = { explanations: [], quizAttempts: [] };

// ─── DB ───────────────────────────────────────────────────────────────────────
let db = null;

async function initDB() {
  const host = process.env.DB_HOST || "localhost";
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME || "codebuddy";

  try {
    // Bootstrap database if it does not exist yet.
    const bootstrap = await mysql.createConnection({
      host,
      user,
      password,
      connectTimeout: 5000,
    });
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    await bootstrap.end();

    db = await mysql.createConnection({
      host,
      user,
      password,
      database,
      connectTimeout: 5000,
    });

    await db.execute(`CREATE TABLE IF NOT EXISTS explanations (
      id VARCHAR(36) PRIMARY KEY,
      code_snippet MEDIUMTEXT NOT NULL,
      language VARCHAR(60),
      level VARCHAR(20),
      title VARCHAR(200),
      overall_explanation LONGTEXT,
      line_explanations LONGTEXT,
      quiz LONGTEXT,
      concepts LONGTEXT,
      bookmarked TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.execute(`CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      explanation_id VARCHAR(36),
      score INT,
      total INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log("✅  MySQL connected");
  } catch (err) {
    console.warn("⚠️   MySQL unavailable — using in-memory store:", err.message);
    db = null;
  }
}

// ─── Language Detection ───────────────────────────────────────────────────────
function detectLanguage(code) {
  const c = code.trim();
  if (/^\s*(def |class |import |from .+ import|if __name__)/.test(c)) return "Python";
  if (/public\s+class|System\.out|void\s+main/.test(c)) return "Java";
  if (/#include|cout\s*<<|cin\s*>>|std::/.test(c)) return "C++";
  if (/^\s*(<\?php|echo\s+['"]|\$[a-z])/.test(c)) return "PHP";
  if (/^\s*(using\s+System|namespace\s+|Console\.Write)/.test(c)) return "C#";
  if (/^\s*(func\s+\w+|package\s+main|fmt\.)/.test(c)) return "Go";
  if (/^\s*(fn\s+\w+|let\s+mut|println!|use\s+std)/.test(c)) return "Rust";
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)/i.test(c)) return "SQL";
  if (/<[a-z]+[\s>]|className=|<\/[a-z]+>/.test(c)) return "HTML/JSX";
  if (/const |let |var |=>|function |require\(|module\.exports|import .+ from/.test(c)) return "JavaScript";
  if (/:\s*(string|number|boolean|any|void)|interface\s+\w+|<[A-Z]\w*>/.test(c)) return "TypeScript";
  return "Code";
}

function getLanguageEmoji(lang) {
  const map = {
    Python: "🐍", JavaScript: "⚡", TypeScript: "🔷", Java: "☕",
    "C++": "⚙️", "C#": "💜", Go: "🐹", Rust: "🦀",
    PHP: "🐘", SQL: "🗄️", "HTML/JSX": "🌐", Code: "📄",
  };
  return map[lang] || "📄";
}

function makeShortTitle(code, language) {
  const firstLine = (code.split("\n").find((l) => l.trim()) || "").trim();
  const clean = firstLine.replace(/\s+/g, " ").replace(/[{}();]/g, "");
  if (clean) return `${language}: ${clean.slice(0, 48)}`;
  return `${language} code explanation`;
}

function inferLineType(line) {
  const s = line.trim();
  if (!s) return "other";
  if (/^(import |from |#include|using\s+|require\(|<\?php)/.test(s)) return "import";
  if (/^(\/\/|#|\/\*|\*)/.test(s)) return "comment";
  if (/^(for|while|do)\b/.test(s)) return "loop";
  if (/^(if|else|switch|case|try|catch|return|throw)\b/.test(s)) return "logic";
  if (/^(function|def|class|public|private|protected|const |let |var |fn |async function)/.test(s)) return "function";
  if (/(=|:=|\+=|-=|\*=|\/=)/.test(s)) return "declaration";
  return "other";
}

function localOverall(code, language, level) {
  const trimmed = code.trim();
  const lineCount = trimmed ? trimmed.split("\n").filter((l) => l.trim()).length : 0;
  const fnCount = (trimmed.match(/\b(function|def|class|=>)\b/g) || []).length;
  const condCount = (trimmed.match(/\b(if|else|switch|case)\b/g) || []).length;
  const loopCount = (trimmed.match(/\b(for|while)\b/g) || []).length;

  if (level === "baby") {
    return `This ${language} code is like a tiny recipe with ${lineCount} important steps. It uses ${fnCount || "some"} helper blocks, ${condCount || "a few"} decision checks, and ${loopCount || "some"} repeats to do its job. The program reads instructions, does work in order, and gives a result at the end.`;
  }
  if (level === "beginner") {
    return `This ${language} snippet has ${lineCount} non-empty lines and is organized into reusable logic blocks. It combines control flow (conditions: ${condCount}, loops: ${loopCount}) with data handling to produce output. Read it top-to-bottom: setup/imports, core logic, then result handling.`;
  }
  if (level === "expert") {
    return `The ${language} snippet spans ${lineCount} non-empty lines and uses ${fnCount} functional/structural declarations, ${condCount} branch points, and ${loopCount} iteration constructs. Behavior is straightforward and linear, with complexity dominated by contained loops/operations. Primary review focus should be input validation, edge handling, and side effects around mutation/I/O boundaries.`;
  }
  return `This ${language} snippet contains ${lineCount} non-empty lines and follows a clear flow from setup to execution. It uses ${condCount} condition checks and ${loopCount} loops, with logic grouped into ${fnCount} reusable declarations. Overall, the code transforms input/state into a final output through sequential steps.`;
}

function localConcepts(code, language) {
  const c = code;
  const concepts = [];
  if (/\b(function|def|=>)\b/.test(c)) concepts.push({ concept: "Functions", emoji: "🧰", description: "Reusable blocks that package logic into callable units." });
  if (/\b(if|else|switch|case)\b/.test(c)) concepts.push({ concept: "Conditional Logic", emoji: "🧭", description: "Branches execution based on boolean conditions." });
  if (/\b(for|while)\b/.test(c)) concepts.push({ concept: "Loops", emoji: "🔁", description: "Repeats operations over a range or until a condition changes." });
  if (/=|:=/.test(c)) concepts.push({ concept: "Variables and State", emoji: "📦", description: "Stores values and updates them as execution progresses." });
  if (/\b(fetch|await|async|promise|then)\b/i.test(c)) concepts.push({ concept: "Async Flow", emoji: "⏳", description: "Handles work that completes later without blocking execution." });
  if (concepts.length < 3) {
    concepts.push(
      { concept: "Program Structure", emoji: "🏗️", description: `${language} code is organized in a top-down execution flow.` },
      { concept: "Data Handling", emoji: "🗂️", description: "Values are read, transformed, and used to produce results." }
    );
  }
  return concepts.slice(0, 6);
}

function localQuiz(language, code) {
  const lc = code.toLowerCase();
  const hasCond = /\bif|else|switch|case\b/.test(lc);
  const hasFn = /\bfunction|def|=>|class\b/.test(lc);
  return [
    {
      question: `What is the main goal of this ${language} snippet?`,
      options: [
        "Transform input through a sequence of logical steps",
        "Define CSS styles for a web page",
        "Configure a database server",
        "Install dependencies automatically",
      ],
      correct: 0,
      explanation: "The code executes logic to process values and produce an output.",
    },
    {
      question: "Why are conditions useful in code like this?",
      options: [
        "They pick different paths based on runtime values",
        "They make code run forever",
        "They remove the need for variables",
        "They only affect formatting",
      ],
      correct: hasCond ? 0 : 0,
      explanation: "Conditions allow behavior to adapt when inputs or state differ.",
    },
    {
      question: "What benefit do functions/classes provide here?",
      options: [
        "They group related behavior into reusable units",
        "They make all code synchronous",
        "They disable error handling",
        "They convert code into comments",
      ],
      correct: hasFn ? 0 : 0,
      explanation: "Reusable abstractions improve readability and maintainability.",
    },
    {
      question: "If you wanted better reliability, what should you add first?",
      options: [
        "Input validation and edge-case checks",
        "More emojis in variable names",
        "Random delays before each line",
        "Remove all conditionals",
      ],
      correct: 0,
      explanation: "Validation and edge handling prevent common runtime failures.",
    },
  ];
}

// ─── Prompts ──────────────────────────────────────────────────────────────────
const levelSystem = {
  baby: `You are a super friendly teacher explaining code to a 5-year-old.
Use VERY simple words, fun emojis, and relatable analogies (toys, food, cartoons).
Never use technical terms without explaining them first. Be warm and encouraging. Use short sentences.`,

  beginner: `You are an encouraging coding teacher for beginners (first 1-3 months of coding).
Use simple everyday analogies. Introduce technical terms gently with clear explanations.
Be supportive and positive. Point out what's cool about the code.`,

  intermediate: `You are a knowledgeable tutor for someone with 6-12 months of coding experience.
Use proper technical terminology. Explain patterns and why certain approaches are used.
Mention common pitfalls and best practices.`,

  expert: `You are a senior engineer doing a code review.
Be concise and precise. Mention time/space complexity, design patterns, edge cases,
performance implications, and potential improvements. No hand-holding.`,
};

// ─── DB / Memory Helpers ──────────────────────────────────────────────────────
async function saveExplanation(data) {
  if (db) {
    try {
      await db.execute(
        `INSERT INTO explanations (id, code_snippet, language, level, title, overall_explanation, line_explanations, quiz, concepts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.id, data.code, data.language, data.level, data.title,
          data.overall, JSON.stringify(data.lines), JSON.stringify(data.quiz), JSON.stringify(data.concepts)]
      );
      return;
    } catch (e) {
      console.warn("DB insert failed:", e.message);
    }
  }
  memStore.explanations.unshift({ ...data, bookmarked: false, created_at: new Date().toISOString() });
  if (memStore.explanations.length > 100) memStore.explanations.pop();
}

async function getHistory(limit = 30) {
  if (db) {
    try {
      const [rows] = await db.execute(
        `SELECT id, language, level, title, bookmarked,
         LEFT(code_snippet, 120) AS preview, created_at
         FROM explanations ORDER BY created_at DESC LIMIT ?`, [limit]
      );
      return rows;
    } catch {}
  }
  return memStore.explanations.slice(0, limit).map((e) => ({
    id: e.id, language: e.language, level: e.level, title: e.title,
    bookmarked: e.bookmarked || false,
    preview: e.code?.substring(0, 120), created_at: e.created_at,
  }));
}

async function getExplanationById(id) {
  if (db) {
    try {
      const [rows] = await db.execute("SELECT * FROM explanations WHERE id = ?", [id]);
      if (rows[0]) {
        const r = rows[0];
        return {
          ...r,
          lines: JSON.parse(r.line_explanations || "[]"),
          quiz: JSON.parse(r.quiz || "[]"),
          concepts: JSON.parse(r.concepts || "[]"),
          overall: r.overall_explanation,
        };
      }
    } catch {}
  }
  return memStore.explanations.find((e) => e.id === id) || null;
}

async function toggleBookmark(id) {
  if (db) {
    try {
      await db.execute("UPDATE explanations SET bookmarked = NOT bookmarked WHERE id = ?", [id]);
      const [rows] = await db.execute("SELECT bookmarked FROM explanations WHERE id = ?", [id]);
      return rows[0]?.bookmarked;
    } catch {}
  }
  const item = memStore.explanations.find((e) => e.id === id);
  if (item) item.bookmarked = !item.bookmarked;
  return item?.bookmarked;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", db: db ? "mysql" : "memory", version: "2.0.0" });
});

// Main explain route
app.post("/api/explain", async (req, res) => {
  const { code, level = "baby" } = req.body;
  if (!code || code.trim().length < 3)
    return res.status(400).json({ error: "Please provide some code to explain." });
  if (code.length > 8000)
    return res.status(400).json({ error: "Code too long — please limit to 8000 characters." });
  if (!levelSystem[level])
    return res.status(400).json({ error: "Invalid level." });

  const language = detectLanguage(code.trim());
  const lines = code.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  const id = uuidv4();

  try {
    let title = "";
    let overall = "";
    let parsedLines = [];
    let parsedQuiz = [];
    let parsedConcepts = [];

    if (anthropic) {
      // Run all 5 AI calls in parallel for speed.
      const [titleRes, overallRes, lineRes, quizRes, conceptsRes] = await Promise.all([
        anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 60,
          system: "You generate short, descriptive titles for code snippets. Max 8 words. No quotes. No punctuation at end.",
          messages: [{ role: "user", content: `Title for this ${language} code:\n${code.substring(0, 500)}` }],
        }),
        anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 600,
          system: levelSystem[level],
          messages: [{ role: "user", content: `Explain what this ${language} code does. Write 3-5 clear sentences.\n\n\`\`\`${language.toLowerCase()}\n${code}\n\`\`\`` }],
        }),
        anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 3000,
          system: `${levelSystem[level]}\n\nAlways respond with valid JSON only. No markdown. No commentary.`,
          messages: [{ role: "user", content: `For each line of this ${language} code, give a short plain-English explanation.
Respond ONLY with a JSON array. No extra text. Format:
[{"line": 1, "code": "exact line text", "explanation": "what it does", "type": "one of: declaration|logic|loop|function|import|comment|other"}]

Lines:
${nonEmptyLines.map((l, i) => `${i + 1}: ${l}`).join("\n")}` }],
        }),
        anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1800,
          system: "You create educational quizzes. Always respond with valid JSON only. No markdown. No extra text.",
          messages: [{ role: "user", content: `Create 4 multiple-choice questions about this ${language} code for a ${level}-level learner.
Respond ONLY with a JSON array:
[{"question": "...", "options": ["...", "...", "...", "..."], "correct": 0, "explanation": "why this is correct"}]

Code:
${code}` }],
        }),
        anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          system: "You identify programming concepts. Always respond with valid JSON only. No markdown.",
          messages: [{ role: "user", content: `List 3-6 key programming concepts used in this code. For each, give a short plain explanation suitable for a ${level} learner.
Respond ONLY with JSON array:
[{"concept": "name", "emoji": "relevant emoji", "description": "1 sentence plain explanation"}]

Code:
${code}` }],
        }),
      ]);

      title = titleRes.content[0].text.trim();
      overall = overallRes.content[0].text.trim();

      try {
        const raw = lineRes.content[0].text.replace(/```json\n?|```\n?/g, "").trim();
        parsedLines = JSON.parse(raw);
      } catch {
        parsedLines = [];
      }
      try {
        const raw = quizRes.content[0].text.replace(/```json\n?|```\n?/g, "").trim();
        parsedQuiz = JSON.parse(raw);
      } catch {
        parsedQuiz = [];
      }
      try {
        const raw = conceptsRes.content[0].text.replace(/```json\n?|```\n?/g, "").trim();
        parsedConcepts = JSON.parse(raw);
      } catch {
        parsedConcepts = [];
      }
    } else {
      title = makeShortTitle(code, language);
      overall = localOverall(code, language, level);
      parsedLines = nonEmptyLines.map((line, i) => ({
        line: i + 1,
        code: line,
        explanation: `This line contributes to the program flow by handling "${line.trim().slice(0, 48)}".`,
        type: inferLineType(line),
      }));
      parsedQuiz = localQuiz(language, code);
      parsedConcepts = localConcepts(code, language);
    }

    const result = {
      id, language, level, title, overall,
      lines: parsedLines,
      quiz: parsedQuiz,
      concepts: parsedConcepts,
      emoji: getLanguageEmoji(language),
      lineCount: nonEmptyLines.length,
      code: code.trim(),
    };

    await saveExplanation(result);
    res.json(result);

  } catch (err) {
    console.error("AI error:", err.message);
    if (err.status === 401) return res.status(401).json({ error: "Invalid Anthropic API key. Check your .env file." });
    if (err.status === 429) return res.status(429).json({ error: "AI rate limit hit. Please wait a moment." });
    res.status(500).json({ error: "AI explanation failed: " + err.message });
  }
});

// Get single explanation (for re-loading from history)
app.get("/api/explanation/:id", async (req, res) => {
  const item = await getExplanationById(req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

// History
app.get("/api/history", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const history = await getHistory(limit);
  res.json(history);
});

// Bookmark toggle
app.patch("/api/explanation/:id/bookmark", async (req, res) => {
  const bookmarked = await toggleBookmark(req.params.id);
  res.json({ bookmarked });
});

// Delete explanation
app.delete("/api/explanation/:id", async (req, res) => {
  if (db) {
    try { await db.execute("DELETE FROM explanations WHERE id = ?", [req.params.id]); }
    catch (e) { console.warn(e.message); }
  } else {
    const idx = memStore.explanations.findIndex((e) => e.id === req.params.id);
    if (idx > -1) memStore.explanations.splice(idx, 1);
  }
  res.json({ deleted: true });
});

// Save quiz result
app.post("/api/quiz-result", async (req, res) => {
  const { explanationId, score, total } = req.body;
  if (db && explanationId) {
    try {
      await db.execute(
        "INSERT INTO quiz_attempts (explanation_id, score, total) VALUES (?, ?, ?)",
        [explanationId, score, total]
      );
    } catch {}
  } else if (explanationId) {
    memStore.quizAttempts.push({ explanationId, score, total, created_at: new Date().toISOString() });
  }
  res.json({ saved: true });
});

// Stats
app.get("/api/stats", async (req, res) => {
  if (db) {
    try {
      const [[{ total }]] = await db.execute("SELECT COUNT(*) as total FROM explanations");
      const [[{ bookmarked }]] = await db.execute("SELECT COUNT(*) as bookmarked FROM explanations WHERE bookmarked=1");
      const [[{ quizzes }]] = await db.execute("SELECT COUNT(*) as quizzes FROM quiz_attempts");
      const [byLang] = await db.execute("SELECT language, COUNT(*) as count FROM explanations GROUP BY language ORDER BY count DESC LIMIT 5");
      return res.json({ total, bookmarked, quizzes, byLang });
    } catch {}
  }
  const total = memStore.explanations.length;
  const bookmarked = memStore.explanations.filter((e) => e.bookmarked).length;
  const quizzes = memStore.quizAttempts.length;
  res.json({ total, bookmarked, quizzes, byLang: [] });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀  CodeBuddy server → http://localhost:${PORT}`);
    console.log(`💾  Storage: ${db ? "MySQL" : "in-memory"}`);
    console.log(`🤖  Explainer: ${anthropic ? "Anthropic (paid API)" : "Local offline mode (free)"}`);
    console.log(`🔑  API key: ${process.env.ANTHROPIC_API_KEY ? "found ✓" : "MISSING ✗"}\n`);
  });
});
