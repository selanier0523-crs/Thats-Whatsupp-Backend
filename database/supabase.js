// database/supabase.js

const { createClient } = require("@supabase/supabase-js");

// Use environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.supabase_service_role_key;

// IMPORTANT:
// Use the SERVICE ROLE key in the backend.
// Never expose this to the frontend.
const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = supabase;