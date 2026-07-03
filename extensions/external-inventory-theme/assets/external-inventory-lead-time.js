(() => {
    const ATTR_ROOT = "[data-external-inventory-lead-time]";
    const ATTR_MSG = "[data-external-inventory-message]";
    const ROOT_SELECTOR = `${ATTR_ROOT}:not([data-external-inventory-bound])`;

    const cache = new Map();
    let mutationObserver = null;
    let refreshQueued = false;

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

        if (locale && locale.toLowerCase().startsWith("sk")) {
            return `Objednajte si ešte dnes ${orderDate} a tovar vám doručíme dňa ${deliveryDate}.`;
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

            // Reset stale state when cart markup is re-used by theme scripts.
            node.hidden = true;
            node.textContent = "";

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

    function bindAndHydrateRoots() {
        const roots = document.querySelectorAll(ROOT_SELECTOR);
        for (const root of roots) {
            root.setAttribute("data-external-inventory-bound", "true");
            hydrateContainer(root).catch(() => {
                // Keep storefront stable if proxy call fails.
            });
        }
    }

    function refreshAllRoots() {
        const roots = document.querySelectorAll(ATTR_ROOT);
        for (const root of roots) {
            hydrateContainer(root).catch(() => {
                // Keep storefront stable if proxy call fails.
            });
        }
    }

    function queueRefresh() {
        if (refreshQueued) return;
        refreshQueued = true;

        requestAnimationFrame(() => {
            refreshQueued = false;
            bindAndHydrateRoots();
            refreshAllRoots();
        });
    }

    function observeDynamicCartUpdates() {
        if (mutationObserver || !document.body) return;

        mutationObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type !== "childList") continue;
                if (mutation.addedNodes.length === 0 && mutation.removedNodes.length === 0) continue;
                queueRefresh();
                return;
            }
        });

        mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        bindAndHydrateRoots();
        observeDynamicCartUpdates();
    }

    window.ExternalInventoryLeadTime = {
        refresh: queueRefresh,
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
