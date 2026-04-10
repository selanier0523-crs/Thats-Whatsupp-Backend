const express = require("express");
const router = express.Router();

router.get("/", (req, res) => res.send("Backend is running"));

router.get("/health", (req, res) => res.json({
  ok: true,
  service: "thats-whatsupp-backend",
  time: new Date().toISOString(),
}));

router.get("/version", (req, res) => res.json({
  commit: process.env.RENDER_GIT_COMMIT || null,
  node: process.version,
}));

module.exports = router;