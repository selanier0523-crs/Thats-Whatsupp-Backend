// middleware/cors.js
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5000,http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = (req, res, next) => {
  // 🔹 Add debug logs here
  console.log("Incoming origin:", req.headers.origin);
  console.log("Allowed origins:", allowedOrigins);

  const origin = req.headers.origin;

  // If no origin (Postman, curl), allow
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

    if (req.method === "OPTIONS") return res.sendStatus(204);

    return next();
  }

  console.log("CORS blocked:", origin);
  return res.status(403).json({ error: "CORS: Origin not allowed" });
};