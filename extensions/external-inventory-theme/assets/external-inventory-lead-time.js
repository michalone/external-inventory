(() => {
    const ATTR_ROOT = "[data-external-inventory-lead-time]";
    const ATTR_MSG = "[data-external-inventory-message]";

    const cache = new Map();

    function toInt(value) {
        const parsed = Number.parseInt(String(value), 10);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function asProductIds(container) {
        const ids = new Set();
        for (const node of container.querySelectorAll(ATTR_MSG)) {
            const id = toInt(node.getAttribute("data-product-id"));
            if (id !== null) ids.add(id);
        }
        return Array.from(ids);
    }

    function formatDate(date, locale) {
        return new Intl.DateTimeFormat(locale, {
            day: "numeric",
            month: "numeric",
            year: "numeric",
        }).format(date);
    }

    function addDays(date, days) {
        const copy = new Date(date);
        copy.setDate(copy.getDate() + days);
        return copy;
    }

    function buildMessage(orderDate, deliveryDate, locale) {
        if (locale && locale.toLowerCase().startsWith("cs")) {
            return `Objednejte dnes ${orderDate} a zboží vám doručíme dne ${deliveryDate}.`;
        }

        return `Order today ${orderDate} and we will deliver on ${deliveryDate}.`;
    }

    async function fetchLeadTimes(endpoint, productIds) {
        if (productIds.length === 0) return {};

        const key = `${endpoint}|${productIds.slice().sort((a, b) => a - b).join(",")}`;
        if (cache.has(key)) return cache.get(key);

        const params = new URLSearchParams({ product_ids: productIds.join(",") });
        const response = await fetch(`${endpoint}?${params.toString()}`, {
            headers: { Accept: "application/json" },
            credentials: "same-origin",
        });

        if (!response.ok) {
            cache.set(key, {});
            return {};
        }

        const json = await response.json();
        const leadTimes = json && typeof json === "object" ? json.leadTimes || {} : {};
        cache.set(key, leadTimes);
        return leadTimes;
    }

    async function hydrateContainer(container) {
        const endpoint = container.getAttribute("data-endpoint") || "/apps/external-inventory";
        const locale = container.getAttribute("data-locale") || "cs-CZ";
        const productIds = asProductIds(container);
        const leadTimes = await fetchLeadTimes(endpoint, productIds);

        for (const node of container.querySelectorAll(ATTR_MSG)) {
            const productId = toInt(node.getAttribute("data-product-id"));
            if (productId === null) continue;

            const leadTime = toInt(leadTimes[String(productId)]);
            if (leadTime === null || leadTime < 0) continue;

            const orderDate = new Date();
            const deliveryDate = addDays(orderDate, leadTime);
            node.textContent = buildMessage(
                formatDate(orderDate, locale),
                formatDate(deliveryDate, locale),
                locale,
            );
            node.hidden = false;
        }
    }

    function init() {
        const roots = document.querySelectorAll(ATTR_ROOT);
        for (const root of roots) {
            hydrateContainer(root).catch(() => {
                // Keep storefront stable if proxy call fails.
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
