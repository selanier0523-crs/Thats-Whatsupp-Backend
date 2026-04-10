// middleware/cors.js
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5000,http://localhost:3000")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

console.log("CORS middleware loaded. Allowed origins:", allowedOrigins);

module.exports = (req, res, next) => {
  const origin = req.headers.origin;

  console.log("Incoming request:", req.method, req.url, "Origin:", origin);

  // If no origin (curl, Postman), allow
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

  console.log("CORS BLOCKED:", origin);
  return res.status(403).json({ error: "CORS: Origin not allowed" });
};