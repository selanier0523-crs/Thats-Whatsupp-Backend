const supabase = require("../database/supabase");

exports.search = async (req, res) => {
  const q = String(req.query.q || "").trim();

  let query = supabase
    .from("supplements")
    .select(`
      product_name,
      brand,
      delivery_method,
      allergens,
      description,
      image,
      supplement_type,
      supplement_sizes (
        price,
        size,
        size_numeric,
        price_per,
        link
      )
    `)
    .limit(25);

  if (q) {
    query = query.or(
      `product_name.ilike.%${q}%,brand.ilike.%${q}%,supplement_type.ilike.%${q}%`
    );
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  res.json({ query: q, results: data });
};