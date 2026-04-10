const express = require("express");
const router = express.Router();

// Example non-API route
router.get("/", (req, res) => {
  res.json({ message: "Welcome to home page" });
});

router.get("/about", (req, res) => {
  res.json({ message: "About page" });
});

module.exports = router;