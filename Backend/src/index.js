// index.js
// Azure API (Express) for That's Whatsupp
// - Frontend: Vercel / local Next.js
// - Backend: Azure (this server)
// - DB: Supabase Postgres (database only for now)
// - NIH DSLD ingestion will be a separate script/job later

require("dotenv").config();

const express = require("express");
const app = express();

/**
 * ---- Config ----
 * Set these in Azure App Settings (and locally in your shell):
 *
 *   PORT=5000 (local only)
 *   ALLOWED_ORIGINS=http://localhost:3000,https://your-vercel-domain.vercel.app
 *
 * (Later)
 *   DATABASE_URL=postgres://...
 */
const PORT = process.env.PORT || 5000;

// Allow local dev + your Vercel domain(s)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ---- Middleware ----

// Parse JSON bodies
app.use(express.json({ limit: "1mb" }));

// Simple CORS (no extra dependency)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Allow requests with no origin (curl/postman/server-to-server)
  if (!origin) return next();

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ---- Health ----
app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "thats-whatsupp-backend",
    time: new Date().toISOString(),
  });
});

// ---- API (stubs for now) ----

// Visual filters for your Search page (frontend can use these immediately)
app.get("/api/filters", (req, res) => {
  res.json({
    goals: ["Energy", "Sleep", "Focus", "Stress", "Gut", "Recovery"],
    forms: ["Capsule", "Tablet", "Powder", "Gummy", "Liquid"],
    budgets: ["$", "$$", "$$$"],
    certifications: ["Third-party tested", "NSF", "USP", "Informed Choice"],
    avoidCommon: ["Melatonin", "Caffeine", "Artificial colors", "Gelatin"],
    allergens: ["Dairy", "Gluten", "Soy", "Egg", "Tree nuts", "Peanuts"],
  });
});

// Search endpoint (will query Supabase Postgres later)
app.get("/api/search", (req, res) => {
  const q = String(req.query.q || "").trim();

  res.json({
    query: q,
    results: [],
    message:
      "No results yet. Once Supabase is connected and NIH ingestion runs, results will show here.",
  });
});

// Chat endpoint (will call your recommendation logic later)
app.post("/api/chat", (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message : "";

  res.json({
    reply:
      "Got it. Chat is not connected yet. Next step is wiring this to search + filters and then the database.",
    received: message,
  });
});

// ---- 404 ----
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ") || "(none)"}`);
});
