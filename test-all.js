// test-all.js
const axios = require("axios");

const BASE_URL = "http://localhost:5000"; // your backend test server
const ORIGIN = "http://localhost:5000";   // must match ALLOWED_ORIGINS

// List your routes to test
const routes = [
  { path: "/", type: "non-API" },
  { path: "/about", type: "non-API" }, // example page
  { path: "/api/users", type: "API" },
  { path: "/api/messages", type: "API" },
];

(async () => {
  console.log("---- Testing all routes ----");

  for (const route of routes) {
    try {
      const url = `${BASE_URL}${route.path}`;
      const response = await axios.get(url, {
        headers: { Origin: ORIGIN },
      });
      console.log(`[PASS] ${route.type} route: ${route.path} =>`, response.status);
    } catch (err) {
      if (err.response) {
        console.error(`[FAIL] ${route.type} route: ${route.path} =>`, err.response.status, err.response.data);
      } else {
        console.error(`[FAIL] ${route.type} route: ${route.path} =>`, err.message);
      }
    }
  }

  console.log("---- All route tests completed ----");
})();