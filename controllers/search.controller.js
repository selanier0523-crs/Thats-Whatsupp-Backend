const supabase = require("../database/supabase");

exports.search = async (req, res) => {
  const q = String(req.query.q || "").trim();

  let query = supabase
    .from("supplements")
    .select("id,name,brand,form,goals,certifications,contains,allergens,budget_tier,description")
    .limit(25);

  if (q) {
    query = query.or(
      `name.ilike.%${q}%,brand.ilike.%${q}%,description.ilike.%${q}%`
    );
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  res.json({ query: q, results: data });
};