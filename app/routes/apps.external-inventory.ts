import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const METAOBJECT_TYPE = "$app:external_inventory";

interface LeadTimeResponse {
    errors?: Array<{ message?: string }>;
    data?: {
        records?: {
            pageInfo?: {
                hasNextPage: boolean;
                endCursor: string | null;
            };
            edges: Array<{
                node: {
                    fields: Array<{
                        key: string;
                        value: string | null;
                    }>;
                };
            }>;
        };
    };
}

function parseProductIds(raw: string | null): number[] {
    if (!raw) return [];

    const values = raw
        .split(",")
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0);

    return Array.from(new Set(values));
}

function parseLeadTime(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseProductIdFromField(value: string | null): number | null {
    if (!value) return null;

    const gidMatch = value.match(/\/Product\/(\d+)$/);
    if (gidMatch) {
        const parsed = Number.parseInt(gidMatch[1], 10);
        return Number.isFinite(parsed) ? parsed : null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function escapeSearchValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function extractLeadTimesFromEdges(
    edges: Array<{
        node: {
            fields: Array<{
                key: string;
                value: string | null;
            }>;
        };
    }>,
    requestedSet: Set<number>,
    leadTimes: Record<string, number>,
) {
    for (const { node } of edges) {
        const byKey = new Map(node.fields.map((field) => [field.key, field.value]));
        const productId = parseProductIdFromField(byKey.get("product") ?? null);
        const leadTime = parseLeadTime(byKey.get("lead_time") ?? null);

        if (productId === null || leadTime === null) continue;
        if (!requestedSet.has(productId)) continue;

        const productKey = String(productId);
        if (!(productKey in leadTimes)) {
            leadTimes[productKey] = leadTime;
        }
    }
}

function hasAllRequestedLeadTimes(
    requestedProductIds: number[],
    leadTimes: Record<string, number>,
): boolean {
    return requestedProductIds.every((id) => String(id) in leadTimes);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin } = await authenticate.public.appProxy(request);

    if (!admin) {
        return Response.json({ leadTimes: {} });
    }

    const url = new URL(request.url);
    const requestedProductIds = parseProductIds(url.searchParams.get("product_ids"));
    if (requestedProductIds.length === 0) {
        return Response.json({ leadTimes: {} });
    }

    const requestedSet = new Set(requestedProductIds);

    const leadTimes: Record<string, number> = {};

    const productFilters = requestedProductIds.map((id) => {
        const gid = `gid://shopify/Product/${id}`;
        return `fields.product:\"${escapeSearchValue(gid)}\"`;
    });
    const queryFilter = productFilters.join(" OR ");

    const filteredResponse = await admin.graphql(
        `#graphql
        query ExternalInventoryLeadTimesFiltered($type: String!, $query: String!) {
            records: metaobjects(type: $type, first: 100, query: $query) {
                edges {
                    node {
                        fields {
                            key
                            value
                        }
                    }
                }
            }
        }`,
        { variables: { type: METAOBJECT_TYPE, query: queryFilter } },
    );

    const filteredJson = (await filteredResponse.json()) as LeadTimeResponse;
    const filteredEdges = filteredJson.data?.records?.edges ?? [];
    extractLeadTimesFromEdges(filteredEdges, requestedSet, leadTimes);

    if (!hasAllRequestedLeadTimes(requestedProductIds, leadTimes)) {
        let cursor: string | null = null;
        let hasNextPage = true;

        while (hasNextPage && !hasAllRequestedLeadTimes(requestedProductIds, leadTimes)) {
            const pagedResponse = await admin.graphql(
                `#graphql
                query ExternalInventoryLeadTimesPaged($type: String!, $cursor: String) {
                    records: metaobjects(type: $type, first: 250, after: $cursor) {
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                        edges {
                            node {
                                fields {
                                    key
                                    value
                                }
                            }
                        }
                    }
                }`,
                { variables: { type: METAOBJECT_TYPE, cursor } },
            );

            const pagedJson = (await pagedResponse.json()) as LeadTimeResponse;
            const pageInfo = pagedJson.data?.records?.pageInfo;
            const edges = pagedJson.data?.records?.edges ?? [];
            extractLeadTimesFromEdges(edges, requestedSet, leadTimes);

            hasNextPage = Boolean(pageInfo?.hasNextPage);
            cursor = pageInfo?.endCursor ?? null;
        }
    }

    return Response.json(
        { leadTimes },
        {
            headers: {
                "Cache-Control": "public, max-age=60",
            },
        },
    );
};
