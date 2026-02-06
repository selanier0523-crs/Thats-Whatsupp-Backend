// index.js
// That's Whatsupp Backend (Express) — Render
// Frontend: Vercel / local Next.js
// DB: Supabase Postgres (database only for now)

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();

// If you ever put this behind a proxy (Render does), this helps with correct IP/proto handling
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT) || 5000;

// Allow local dev + your Vercel domain(s)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ---- Middleware ----

// Parse JSON bodies
app.use(express.json({ limit: "1mb" }));

// Light security headers (kept minimal)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// CORS (no dependency)
// - Always responds to OPTIONS
// - Only grants access to allowed origins
app.use((req, res, next) => {
  const origin = req.headers.origin;

  const setCorsHeaders = () => {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    // Only keep this true if you actually use cookies/session auth.
    // If you do NOT use cookies, you can set this to false and remove it.
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
  };

  // Preflight
  if (req.method === "OPTIONS") {
    // Non-browser / server-to-server preflight isn’t meaningful
    if (!origin) return res.sendStatus(204);

    if (allowedOrigins.includes(origin)) {
      setCorsHeaders();
      return res.sendStatus(204);
    }

    return res.sendStatus(403);
  }

  // Non-browser (curl/postman/server-to-server)
  if (!origin) return next();

  // Browser requests
  if (allowedOrigins.includes(origin)) {
    setCorsHeaders();
    return next();
  }

  // Block unexpected browser origins
  return res.status(403).json({ error: "CORS: Origin not allowed" });
});

// ---- Routes ----

// Root
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// Health
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "thats-whatsupp-backend",
    time: new Date().toISOString(),
  });
});

// Version / commit (Render sets RENDER_GIT_COMMIT)
app.get("/version", (req, res) => {
  res.json({
    commit: process.env.RENDER_GIT_COMMIT || null,
    node: process.version,
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

// ---- Error handler ----
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ---- Start ----
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ") || "(none)"}`);
});

// ---- Graceful shutdown ----
const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down...`);
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });

  // Force-exit if hanging connections remain
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
