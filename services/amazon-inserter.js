// services/amazon-inserter.js
//
// This version does NOT insert into Supabase directly.
// It scrapes the data, builds the final add_product(...) SQL statement,
// and prints that statement so you can paste it into Supabase manually.
//
// Assumptions:
// - You already have services/amazon-scraper.js working
// - That scraper exports scrapeAmazonProduct
// - Your final SQL function is add_product(..., p_flavors jsonb)
// - You are NOT using flavor_allergens anymore
//
// Fill in the INPUT BLOCK below, then run:
// node services/amazon-inserter.js

const { scrapeAmazonProduct } = require("./amazon-scraper");

const CANNOT_VERIFY = "cannot verify";
const CANNOT_FOLLOW_LINK = "cannot follow link";

// =========================================================
// INPUT BLOCK
// Replace every placeholder below before running the file.
// =========================================================
const input = {
    overall_product_link: "https://www.amazon.com/Momentous-Essential-Grass-Fed-Gluten-Free-Certified/dp/B09F21D98X/ref=sxin_17_pa_sp_search_thematic_sspa?cv_ct_cx=protein%2Bpowder&rdc=1&sbo=RZvfv%2F%2FHxDF%2BO5021pAnSA%3D%3D&sr=1-2-2c727eeb-987f-452f-86bd-c2978cc9d8b9-spons&aref=rdCWYMaZMC&sp_csd=d2lkZ2V0TmFtZT1zcF9zZWFyY2hfdGhlbWF0aWM",
    affiliate_links: [
        "https://amzn.to/4cPu5hm",
        "https://amzn.to/4cPkaZ5",
        "https://amzn.to/4dTSIKY",
        "https://amzn.to/4citbtH",
        "https://amzn.to/3Qe9ieE",
        "https://amzn.to/4mFJcNW",
        "https://amzn.to/4cuT5JA",
        "https://amzn.to/4sCOkn6"
    ],
    supplement_type: "Pump Enhancer",
    description: "Hard-Hitting Pump with Zero Stimulants: GHOST Pump raises the bar with pump ingredients we all love and zero stimulants, meaning you can take it solo or stack it with GHOST Legend. WARHEADS Sour Watermelon flavor. 40 scoops per container. Vegan Fermented L- Citrulline: Citrulline delivers amazing pumps without the potential for stomach discomfort, and since its vegan fermented, GHOST Pump is vegan friendly! Yup, We’re Obsessed with Nitric Oxide Products: Our nitrate ingredient NO3 - T Arginine Nitrate attacks nitric oxide from a much different and more advanced angle than the rest of the GHOST Pump formula, delivering a complete, all - out pump experience unlike anything we’ve tried or tested.* Ever. Total Transparency: All GHOST products feature a transparent label that fully discloses the dose of each active ingredient.Zero proprietary blends means you know what you’re getting in each and every scoop.GHOST Pump is vegan, soy - free, gluten - free, and sugar - free. BE SEEN: As a premium active lifestyle brand, GHOST is powering and empowering users to BE SEEN beyond the walls of the gym.The name GHOST and mantra “BE SEEN” come from that feeling of being behind the scenes and wanting to be heard, waiting to make an impact.We’re all Ghosts.This is our time.",
    allergens: "NONE",
};

// =========================================================
// HELPERS
// =========================================================

function normalizeWhitespace(value) {
    if (typeof value !== "string") return value;
    return value.replace(/\s+/g, " ").trim();
}

function isBlank(value) {
    return !normalizeWhitespace(String(value || ""));
}

function isPlaceholder(value) {
    return normalizeWhitespace(String(value || "")).includes("PASTE_");
}

function safeText(value) {
    return normalizeWhitespace(String(value || ""));
}

function sqlLiteral(value) {
    if (value == null) return "NULL";
    const text = String(value).replace(/'/g, "''");
    return `'${text}'`;
}

function parseDollarAmount(value) {
    if (!value) return null;

    const cleaned = normalizeWhitespace(String(value));
    const match = cleaned.match(/([\d,]+(?:\.\d+)?)/);

    if (!match) return null;

    const numeric = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
}

function roundToTwo(value) {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100) / 100;
}

function formatMoney(value) {
    if (!Number.isFinite(value)) return null;
    return value.toFixed(2);
}

function parseSizeNumeric(sizeVariable) {
    if (!sizeVariable) return null;

    const cleaned = normalizeWhitespace(sizeVariable);

    if (!cleaned || cleaned === CANNOT_VERIFY) {
        return null;
    }

    const match = cleaned.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);

    if (!match) {
        return null;
    }

    const numeric = Number(match[1]);

    return Number.isFinite(numeric) ? numeric : null;
}

function parseSizeUnit(sizeVariable) {
    if (!sizeVariable) return null;

    const cleaned = normalizeWhitespace(sizeVariable);

    if (!cleaned || cleaned === CANNOT_VERIFY) {
        return null;
    }

    const unit = cleaned
        .replace(/^[\d.,]+\s*/, "")
        .replace(/\(.*?\)/g, "")
        .trim();

    return unit || null;
}

function escapeForRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deriveProductName(headerResult) {
    const title = safeText(headerResult.product_title);
    const flavor = safeText(headerResult.flavor);
    const selectedSize = safeText(headerResult.selected_size);

    if (!title) return "";

    let productName = title;

    if (flavor) {
        const flavorPattern = new RegExp(`,\\s*${escapeForRegex(flavor)}\\b.*$`, "i");
        productName = productName.replace(flavorPattern, "");
    }

    if (productName === title && selectedSize) {
        const sizePattern = new RegExp(`,\\s*${escapeForRegex(selectedSize)}\\b.*$`, "i");
        productName = productName.replace(sizePattern, "");
    }

    return normalizeWhitespace(productName.replace(/[,\s]+$/, ""));
}

function parseScrapedPricePer(pricePerText) {
    if (!pricePerText) {
        return {
            price_per_numeric: null,
            price_per: null,
        };
    }

    const cleaned = normalizeWhitespace(pricePerText);

    if (!cleaned || cleaned === CANNOT_VERIFY) {
        return {
            price_per_numeric: null,
            price_per: null,
        };
    }

    const numeric = parseDollarAmount(cleaned);

    return {
        price_per_numeric: numeric != null ? roundToTwo(numeric) : null,
        price_per: cleaned,
    };
}

function buildFallbackPricePer(price, sizeNumeric, sizeVariable) {
    if (!Number.isFinite(price) || !Number.isFinite(sizeNumeric) || sizeNumeric === 0) {
        return {
            price_per_numeric: null,
            price_per: null,
        };
    }

    const pricePerNumeric = roundToTwo(price / sizeNumeric);

    return {
        price_per_numeric: pricePerNumeric,
        price_per: `$${formatMoney(pricePerNumeric)} / ${sizeVariable}`,
    };
}

function getPricePerValues(scrapedPricePerText, price, sizeNumeric, sizeVariable) {
    const scraped = parseScrapedPricePer(scrapedPricePerText);

    if (scraped.price_per_numeric != null && scraped.price_per) {
        return scraped;
    }

    return buildFallbackPricePer(price, sizeNumeric, sizeVariable);
}

function validateInputBlock(config) {
    const errors = [];

    if (isBlank(config.overall_product_link) || isPlaceholder(config.overall_product_link)) {
        errors.push("overall_product_link");
    }

    if (!Array.isArray(config.affiliate_links) || config.affiliate_links.length === 0) {
        errors.push("affiliate_links");
    }

    const cleanedAffiliateLinks = Array.isArray(config.affiliate_links)
        ? config.affiliate_links
            .map((link) => safeText(link))
            .filter((link) => !isBlank(link))
        : [];

    if (cleanedAffiliateLinks.length === 0) {
        errors.push("affiliate_links");
    }

    cleanedAffiliateLinks.forEach((link, index) => {
        if (isPlaceholder(link)) {
            errors.push(`affiliate_links[${index}]`);
        }
    });

    if (isBlank(config.supplement_type) || isPlaceholder(config.supplement_type)) {
        errors.push("supplement_type");
    }

    if (isBlank(config.description) || isPlaceholder(config.description)) {
        errors.push("description");
    }

    if (isBlank(config.allergens) || isPlaceholder(config.allergens)) {
        errors.push("allergens");
    }

    if (errors.length > 0) {
        throw new Error(
            `Fill in the input block before running this file. Missing/placeholder values: ${errors.join(", ")}`
        );
    }

    return {
        overall_product_link: safeText(config.overall_product_link),
        affiliate_links: cleanedAffiliateLinks,
        supplement_type: safeText(config.supplement_type),
        description: safeText(config.description),
        allergens: safeText(config.allergens),
    };
}

function validateHeaderResult(headerResult) {
    const missing = [];

    if (!headerResult || headerResult.status !== "ok") {
        missing.push("status");
    }
    if (!safeText(headerResult.product_title) || headerResult.product_title === CANNOT_VERIFY) {
        missing.push("product_title");
    }
    if (!safeText(headerResult.brand) || headerResult.brand === CANNOT_VERIFY) {
        missing.push("brand");
    }
    if (!safeText(headerResult.delivery_method) || headerResult.delivery_method === CANNOT_VERIFY) {
        missing.push("delivery_method");
    }
    if (!safeText(headerResult.image_link) || headerResult.image_link === CANNOT_VERIFY) {
        missing.push("image_link");
    }

    if (missing.length > 0) {
        throw new Error(
            `Overall product link could not provide required data. Missing: ${missing.join(", ")}`
        );
    }
}

function validateVariantResult(result, link) {
    const missing = [];

    if (!result || result.status !== "ok") {
        missing.push("status");
    }
    if (!safeText(result.flavor) || result.flavor === CANNOT_VERIFY) {
        missing.push("flavor");
    }
    if (!safeText(result.selected_size) || result.selected_size === CANNOT_VERIFY) {
        missing.push("selected_size");
    }
    if (!safeText(result.current_visible_price) || result.current_visible_price === CANNOT_VERIFY) {
        missing.push("current_visible_price");
    }
    if (!safeText(result.asin) || result.asin === CANNOT_VERIFY) {
        missing.push("asin");
    }

    const parsedPrice = parseDollarAmount(result.current_visible_price);
    if (parsedPrice == null) {
        missing.push("parsed_price");
    }

    const parsedSizeNumeric = parseSizeNumeric(result.selected_size);
    if (parsedSizeNumeric == null) {
        missing.push("parsed_size_numeric");
    }

    if (missing.length > 0) {
        throw new Error(
            `Affiliate link failed validation: ${link}\nMissing/invalid: ${missing.join(", ")}`
        );
    }
}

function checkForDuplicateAsins(variantResults) {
    const seen = new Map();

    for (const result of variantResults) {
        const asin = safeText(result.asin);

        if (seen.has(asin)) {
            const firstLink = seen.get(asin);
            throw new Error(
                `Duplicate ASIN detected: ${asin}\nFirst link: ${firstLink}\nDuplicate link: ${result.original_input}`
            );
        }

        seen.set(asin, result.original_input);
    }
}
// The following function is currently disabled because it threw errors when it shouldn't have.
//function checkForDuplicateFlavorSize(variantResults) {
//    const seen = new Map();

//    for (const result of variantResults) {
//        const key = `${safeText(result.flavor)} || ${safeText(result.selected_size)}`;

//        if (seen.has(key)) {
//            const firstLink = seen.get(key);
//            throw new Error(
//                `Duplicate flavor/size detected: ${key}\nFirst link: ${firstLink}\nDuplicate link: ${result.original_input}`
//            );
//        }
//
//        seen.set(key, result.original_input);
//    }
//}

function buildFlavorsJson(headerResult, variantResults) {
    const flavorsMap = new Map();

    for (const result of variantResults) {
        const flavor = safeText(result.flavor);
        const rawSize = safeText(result.selected_size);
        const price = parseDollarAmount(result.current_visible_price);
        const sizeNumeric = parseSizeNumeric(rawSize);
        const sizeVariable = parseSizeUnit(rawSize);
        if (!sizeVariable) {
            throw new Error(
                `Could not parse size_variable from selected_size: ${result.selected_size}\nLink: ${result.original_input}`
            );
        }
        const image =
            safeText(result.image_link) && result.image_link !== CANNOT_VERIFY
                ? safeText(result.image_link)
                : safeText(headerResult.image_link);

        const { price_per_numeric, price_per } = getPricePerValues(
            result.price_per_unit,
            price,
            sizeNumeric,
            sizeVariable
        );

        if (price == null) {
            throw new Error(
                `Could not parse price for affiliate link: ${result.original_input}\nRaw value: ${result.current_visible_price}`
            );
        }

        if (sizeNumeric == null) {
            throw new Error(
                `Could not parse size_numeric for affiliate link: ${result.original_input}\nRaw value: ${result.selected_size}`
            );
        }

        if (price_per_numeric == null || !price_per) {
            throw new Error(
                `Could not determine price_per for affiliate link: ${result.original_input}`
            );
        }

        if (!flavorsMap.has(flavor)) {
            flavorsMap.set(flavor, {
                flavor,
                image,
                sizes: [],
            });
        }

        flavorsMap.get(flavor).sizes.push({
            price,
            size_numeric: sizeNumeric,
            size_variable: sizeVariable,
            price_per_numeric,
            price_per,
            link: safeText(result.original_input),
            asin: safeText(result.asin),
        });
    }

    const flavors = Array.from(flavorsMap.values());

    for (const flavor of flavors) {
        flavor.sizes.sort((a, b) => a.size_numeric - b.size_numeric);
    }

    return flavors;
}

function buildAddProductSql(payload) {
    const prettyJson = JSON.stringify(payload.p_flavors, null, 2);

    return [
        "SELECT add_product(",
        `  ${sqlLiteral(payload.p_product_name)},`,
        `  ${sqlLiteral(payload.p_brand)},`,
        `  ${sqlLiteral(payload.p_supplement_type)},`,
        `  ${sqlLiteral(payload.p_delivery_method)},`,
        `  ${sqlLiteral(payload.p_allergens)},`,
        `  ${sqlLiteral(payload.p_description)},`,
        `  ${sqlLiteral(payload.p_main_image)},`,
        `  ${sqlLiteral(prettyJson)}::jsonb`,
        ");",
    ].join("\n");
}

async function runInserter(config) {
    const cleanedConfig = validateInputBlock(config);

    console.log("Scraping overall product link...");
    const headerResult = await scrapeAmazonProduct(cleanedConfig.overall_product_link);
    validateHeaderResult(headerResult);

    console.log("Scraping affiliate links...");
    const variantResults = [];

    for (const link of cleanedConfig.affiliate_links) {
        console.log(`- ${link}`);

        const result = await scrapeAmazonProduct(link);

        if (!result || result.status !== "ok") {
            throw new Error(`Affiliate link failed to load: ${link}`);
        }

        validateVariantResult(result, link);
        variantResults.push(result);
    }

    checkForDuplicateAsins(variantResults);
    //checkForDuplicateFlavorSize(variantResults);

    const productName = deriveProductName(headerResult);

    if (!productName) {
        throw new Error(
            `Could not derive product_name from the overall product title: ${headerResult.product_title}`
        );
    }

    const payload = {
        p_product_name: productName,
        p_brand: safeText(headerResult.brand),
        p_supplement_type: cleanedConfig.supplement_type,
        p_delivery_method: safeText(headerResult.delivery_method),
        p_allergens: cleanedConfig.allergens,
        p_description: cleanedConfig.description,
        p_main_image: safeText(headerResult.image_link),
        p_flavors: buildFlavorsJson(headerResult, variantResults),
    };

    const sql = buildAddProductSql(payload);

    console.log("\nCOPY AND PASTE THIS INTO SUPABASE:\n");
    console.log(sql);
}

if (require.main === module) {
    runInserter(input).catch((error) => {
        console.error("\nINSERTER FAILED\n");
        console.error(error.message || error);
        process.exit(1);
    });
}

module.exports = {
    runInserter,
};