// services/amazonScraper.service.js
// Amazon scraper v1
// Requirements chosen in chat:
// - JavaScript
// - Playwright
// - Headed mode for now
// - Accept full Amazon URLs and amzn.to links
// - Scrape only what is visibly available
// - Prefer one-time purchase, not Subscribe & Save
// - Print to console
// - Save raw HTML
// - Return "cannot verify" for missing fields
// - Return "cannot follow link" if the page cannot be opened/followed

const { chromium } = require("playwright");

const CANNOT_VERIFY = "cannot verify";
const CANNOT_FOLLOW_LINK = "cannot follow link";

function normalizeWhitespace(value) {
    if (typeof value !== "string") return value;
    return value.replace(/\s+/g, " ").trim();
}

function safeString(value) {
    if (value == null) return CANNOT_VERIFY;
    const cleaned = normalizeWhitespace(String(value));
    return cleaned ? cleaned : CANNOT_VERIFY;
}

function stripLabel(value) {
    const cleaned = normalizeWhitespace(value || "");
    return cleaned || CANNOT_VERIFY;
}

function extractAsinFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i);
    return match ? match[1].toUpperCase() : null;
}

function extractAsinFromFlavorValue(value) {
    if (!value || typeof value !== "string") return null;
    const parts = value.split(",");
    const maybeAsin = parts[parts.length - 1]?.trim();
    return /^[A-Z0-9]{10}$/i.test(maybeAsin || "") ? maybeAsin.toUpperCase() : null;
}

function extractPriceText(rawText) {
    if (!rawText) return CANNOT_VERIFY;
    const text = normalizeWhitespace(rawText);
    const match = text.match(/\$?\s*([\d,]+(?:\.\d{2})?)/);
    if (!match) return CANNOT_VERIFY;
    return `$${match[1].replace(/^\$/, "")}`;
}

function extractPercent(rawText) {
    if (!rawText) return CANNOT_VERIFY;
    const text = normalizeWhitespace(rawText);
    const match = text.match(/-?\s*(\d+)\s*%/);
    if (!match) return CANNOT_VERIFY;
    return `${match[1]}%`;
}

function detectDeliveryMethod(title, flavor, size) {
    const combined = `${title} ${flavor} ${size}`.toLowerCase();

    if (combined.includes("gummy")) return "gummy";
    if (combined.includes("capsule")) return "capsule";
    if (combined.includes("tablet")) return "tablet";
    if (combined.includes("softgel")) return "softgel";
    if (combined.includes("powder")) return "powder";
    if (combined.includes("drink")) return "drink";
    if (combined.includes("liquid")) return "liquid";

    return CANNOT_VERIFY;
}

async function extractBrand(page) {
    const brandText = await firstVisibleText(page, [
        ".po-brand .po-break-word",
        "tr.po-brand td.a-span9 .po-break-word",
        "#bylineInfo",
        "#bylineInfo_feature_div #bylineInfo",
        "#brand",
    ]);

    if (!brandText) return null;

    let cleaned = normalizeWhitespace(brandText);

    cleaned = cleaned
        .replace(/^Visit the\s+/i, "")
        .replace(/\s+Store\s*$/i, "")
        .replace(/^Brand:\s*/i, "")
        .trim();

    return cleaned || null;
}
async function firstVisibleText(page, selectors) {
    for (const selector of selectors) {
        try {
            const locator = page.locator(selector).first();
            if ((await locator.count()) > 0 && (await locator.isVisible())) {
                const text = await locator.textContent();
                const cleaned = normalizeWhitespace(text || "");
                if (cleaned) return cleaned;
            }
        } catch {
            // ignore and continue
        }
    }
    return null;
}
async function firstText(page, selectors) {
    for (const selector of selectors) {
        try {
            const locator = page.locator(selector).first();
            if ((await locator.count()) > 0) {
                const text = await locator.textContent();
                const cleaned = normalizeWhitespace(text || "");
                if (cleaned) return cleaned;
            }
        } catch {
            // ignore and continue
        }
    }
    return null;
}
async function firstAttribute(page, selector, attributeName) {
    try {
        const locator = page.locator(selector).first();
        if ((await locator.count()) > 0) {
            const value = await locator.getAttribute(attributeName);
            return value ? normalizeWhitespace(value) : null;
        }
    } catch {
        // ignore
    }
    return null;
}

async function extractTitle(page) {
    return (
        (await firstVisibleText(page, ["#productTitle", "#title #productTitle"])) ||
        null
    );
}

async function extractSelectedFlavor(page) {
    try {
        const selectedOption = page.locator(
            "#native_dropdown_selected_flavor_name option[selected]"
        ).first();

        if ((await selectedOption.count()) > 0) {
            const text = normalizeWhitespace(await selectedOption.textContent());
            if (text) return text;
        }
    } catch {
        // ignore
    }

    const visiblePrompt = await firstVisibleText(page, [
        "#dropdown_selected_flavor_name .a-dropdown-prompt",
        "#variation_flavor_name .a-dropdown-prompt",
    ]);

    if (visiblePrompt) return visiblePrompt;

    const tableFlavor = await firstText(page, [
        ".po-flavor .po-break-word",
        "tr.po-flavor td.a-span9 .po-break-word",
    ]);

    if (tableFlavor) return tableFlavor;

    return null;
}

async function extractSelectedFlavorAsin(page, finalUrl) {
    try {
        const selectedOption = page.locator(
            "#native_dropdown_selected_flavor_name option[selected]"
        ).first();

        if ((await selectedOption.count()) > 0) {
            const value = await selectedOption.getAttribute("value");
            const asin = extractAsinFromFlavorValue(value);
            if (asin) return asin;
        }
    } catch {
        // ignore
    }

    return extractAsinFromUrl(finalUrl);
}

async function extractSelectedSize(page) {
    const visibleSize = await firstVisibleText(page, [
        "[id^='size_name_'][id$='-announce'] .swatch-title-text",
        "#variation_size_name .a-dropdown-prompt",
        "#native_dropdown_selected_size_name option[selected]",
    ]);

    if (visibleSize) return visibleSize;

    const tableSize = await firstText(page, [
        ".po-unit_count .po-break-word",
        "tr.po-unit_count td.a-span9 .po-break-word",
    ]);

    if (tableSize) return tableSize;

    return null;
}
async function extractAvailability(page) {
    return (
        (await firstVisibleText(page, [
            "#twisterAvailability",
            "#availability span",
            "#availability",
        ])) || null
    );
}

async function extractImageLink(page) {
    const hiRes = await firstAttribute(page, "#landingImage", "data-old-hires");
    if (hiRes) return hiRes;

    const src = await firstAttribute(page, "#landingImage", "src");
    if (src) return src;

    return null;
}

async function extractPriceBundle(page) {
    // Prefer the main visible one-time price block.
    // Fallback to the twister block if needed.
    const accessibilityLabel = await firstVisibleText(page, [
        "#apex-pricetopay-accessibility-label",
        ".apex-core-price-identifier .apex-pricetopay-accessibility-label",
        ".apex-core-price-identifier .aok-offscreen",
    ]);

    const priceVisibleText = await firstVisibleText(page, [
        ".apex-core-price-identifier .apex-pricetopay-value",
        "#apex_price .apex-pricetopay-value",
        ".apex-core-price-identifier .a-price",
    ]);

    let listPriceText = null;

    try {
        const offscreenListPrice = page
            .locator(".apex-basisprice-value .a-offscreen")
            .first();

        if ((await offscreenListPrice.count()) > 0) {
            listPriceText = await offscreenListPrice.textContent();
        }

        if (!normalizeWhitespace(listPriceText || "")) {
            const visibleListPrice = page.locator(".apex-basisprice-value").first();

            if ((await visibleListPrice.count()) > 0) {
                listPriceText = await visibleListPrice.textContent();
            }
        }
    } catch {
        // ignore
    }

    const discountText = await firstVisibleText(page, [
        ".apex-savings-percentage",
        ".savingsPercentage",
        ".reinventPriceSavingsPercentageMargin",
    ]);

    const unitPriceText = await firstVisibleText(page, [
        ".apex-priceperunit-accessibility-label",
        ".pricePerUnit",
        ".apex-priceperunit-value",
    ]);

    let currentVisiblePrice = extractPriceText(priceVisibleText);

    if (currentVisiblePrice === CANNOT_VERIFY && accessibilityLabel) {
        currentVisiblePrice = extractPriceText(accessibilityLabel);
    }

    return {
        current_visible_price: currentVisiblePrice,
        list_price: extractPriceText(listPriceText),
        discount_percent: extractPercent(discountText || accessibilityLabel),
        price_per_unit:
            unitPriceText && unitPriceText !== CANNOT_VERIFY
                ? stripLabel(unitPriceText)
                : CANNOT_VERIFY,
    };
}

async function extractPageData(page, originalUrl) {
    const finalUrl = page.url();

    const titleRaw = await extractTitle(page);
    const flavorRaw = await extractSelectedFlavor(page);
    const sizeRaw = await extractSelectedSize(page);
    const availabilityRaw = await extractAvailability(page);
    const imageLinkRaw = await extractImageLink(page);
    const asinRaw = await extractSelectedFlavorAsin(page, finalUrl);
    const priceBundle = await extractPriceBundle(page);

    const product_title = safeString(titleRaw);
    const flavor = safeString(flavorRaw);
    const selected_size = safeString(sizeRaw);
    const availability = safeString(availabilityRaw);
    const image_link = safeString(imageLinkRaw);
    const asin = safeString(asinRaw);

    const brandRaw = await extractBrand(page);
    const brand = safeString(brandRaw);
    const delivery_method = detectDeliveryMethod(
        product_title,
        flavor,
        selected_size
    );

    return {
        status: "ok",
        original_input: originalUrl,
        product_title,
        brand,
        flavor,
        selected_size,
        current_visible_price: priceBundle.current_visible_price,
        list_price: priceBundle.list_price,
        discount_percent: priceBundle.discount_percent,
        price_per_unit: priceBundle.price_per_unit,
        availability,
        image_link,
        asin,
        delivery_method,
    };
}

async function scrapeAmazonProduct(url, options = {}) {
    const browser = await chromium.launch({
        headless: options.headless ?? false,
    });

    const context = await browser.newContext({
        userAgent:
            options.userAgent ||
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        viewport: { width: 1440, height: 1200 },
        locale: "en-US",
    });

    const page = await context.newPage();

    try {
        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: options.timeoutMs ?? 60000,
        });

        await page.waitForTimeout(options.settleMs ?? 3500);

        // Try to let the core product/title render.
        try {
            await page.waitForSelector("#productTitle, #landingImage", {
                timeout: 10000,
            });
        } catch {
            // do not fail here, continue and extract whatever is visible
        }

        const data = await extractPageData(page, url);

        const result = {
            ...data,
        };

        return result;
    } catch (error) {
        return {
            status: CANNOT_FOLLOW_LINK,
            original_input: url,
            product_title: CANNOT_FOLLOW_LINK,
            brand: CANNOT_FOLLOW_LINK,
            flavor: CANNOT_FOLLOW_LINK,
            selected_size: CANNOT_FOLLOW_LINK,
            current_visible_price: CANNOT_FOLLOW_LINK,
            list_price: CANNOT_FOLLOW_LINK,
            discount_percent: CANNOT_FOLLOW_LINK,
            price_per_unit: CANNOT_FOLLOW_LINK,
            availability: CANNOT_FOLLOW_LINK,
            image_link: CANNOT_FOLLOW_LINK,
            asin: CANNOT_FOLLOW_LINK,
            delivery_method: CANNOT_FOLLOW_LINK,
            error_message: normalizeWhitespace(error?.message || "Unknown error"),
        };
    } finally {
        await page.close().catch(() => { });
        await context.close().catch(() => { });
        await browser.close().catch(() => { });
    }
}

function printScrapeResult(result) {
    console.log("AMAZON SCRAPER RESULT");
    console.log("---------------------");
    console.log(`Status: ${result.status}`);
    console.log(`Original Input Link: ${result.original_input}`);
    console.log(`Product Title: ${result.product_title}`);
    console.log(`Brand: ${result.brand}`);
    console.log(`Flavor: ${result.flavor}`);
    console.log(`Selected Size: ${result.selected_size}`);
    console.log(`Current Visible Price: ${result.current_visible_price}`);
    console.log(`List Price: ${result.list_price}`);
    console.log(`Discount Percent: ${result.discount_percent}`);
    console.log(`Price Per Unit: ${result.price_per_unit}`);
    console.log(`Availability: ${result.availability}`);
    console.log(`Image Link: ${result.image_link}`);
    console.log(`ASIN: ${result.asin}`);
    console.log(`Delivery Method: ${result.delivery_method}`);

    if (result.error_message) {
        console.log(`Error Message: ${result.error_message}`);
    }
}

module.exports = {
    scrapeAmazonProduct,
    printScrapeResult,
};

if (require.main === module) {
    const inputUrl = process.argv[2];

    if (!inputUrl) {
        console.error("Usage: node services/amazonScraper.service.js <amazon-url>");
        process.exit(1);
    }

    scrapeAmazonProduct(inputUrl)
        .then((result) => {
            printScrapeResult(result);
        })
        .catch((error) => {
            console.error("Unexpected scraper failure:");
            console.error(error);
            process.exit(1);
        });
}