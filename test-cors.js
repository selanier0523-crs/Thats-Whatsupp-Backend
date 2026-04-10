const express = require("express");
const corsMiddleware = require("./middleware/cors"); // no parentheses

const app = express();

app.use(corsMiddleware); // ✅ pass the function, do NOT call it

app.get("/", (req, res) => {
  res.json({ message: "CORS middleware works!" });
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Middleware test server running on http://localhost:${PORT}`);
});