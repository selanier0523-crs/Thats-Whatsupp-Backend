const supabase = require("../database/supabase");

function mapSearchResult(row) {
  const flavors = Array.isArray(row.supplement_flavors)
    ? row.supplement_flavors.map((flavor) => ({
        id: flavor.id,
        flavor: flavor.flavor,
        image: flavor.flavor_image || row.main_image,
        sizes: Array.isArray(flavor.supplement_flavor_sizes)
          ? flavor.supplement_flavor_sizes.map((size) => ({
              id: size.id,
              price: size.price,
              size_numeric: size.size_numeric,
              size_variable: size.size_variable,
              size: `${size.size_numeric} ${size.size_variable}`.trim(),
              price_per_numeric: size.price_per_numeric,
              price_per: size.price_per,
              link: size.link,
              asin: size.asin,
            }))
          : [],
      }))
    : [];

  const supplementSizes = flavors.flatMap((flavor) =>
    flavor.sizes.map((size) => ({
      ...size,
      flavor: flavor.flavor,
      flavor_image: flavor.image,
    }))
  );

  return {
    id: row.id,
    product_name: row.product_name,
    brand: row.brand,
    delivery_method: row.delivery_method,
    allergens: row.allergens,
    description: row.description,
    image: row.main_image,
    main_image: row.main_image,
    supplement_type: row.supplement_type,
    flavors,
    supplement_sizes: supplementSizes,
  };
}

exports.search = async (req, res) => {
  const q = String(req.query.q || "").trim();

  let query = supabase
    .from("supplements")
    .select(`
      id,
      product_name,
      brand,
      delivery_method,
      allergens,
      description,
      main_image,
      supplement_type,
      supplement_flavors (
        id,
        flavor,
        flavor_image,
        supplement_flavor_sizes (
          id,
          price,
          size_numeric,
          size_variable,
          price_per_numeric,
          price_per,
          link,
          asin
        )
      )
    `)
    .order("created_at", { ascending: false })
    .limit(25);

  if (q) {
    query = query.or(
      `product_name.ilike.%${q}%,brand.ilike.%${q}%,supplement_type.ilike.%${q}%`
    );
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  res.json({ query: q, results: data.map(mapSearchResult) });
};
