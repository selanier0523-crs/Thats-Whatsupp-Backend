const express = require("express");
const router = express.Router();

// Example API route
router.get("/users", (req, res) => {
  res.json([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]);
});

router.get("/messages", (req, res) => {
  res.json([{ from: "Alice", text: "Hello" }]);
});

module.exports = router;