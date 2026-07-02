import { useEffect, useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  useRouteError,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useTranslation } from "../i18n/context";

const METAOBJECT_TYPE = "$app:external_inventory";

interface FieldNode {
  key: string;
  value: string | null;
  reference: {
    __typename?: string;
    id?: string;
    title?: string;
    name?: string;
    featuredImage?: { url: string } | null;
  } | null;
}

interface InventoryResponse {
  data?: {
    records?: {
      edges: Array<{
        node: {
          id: string;
          fields: FieldNode[];
        };
      }>;
    };
  };
}

interface DeleteResponse {
  data?: {
    result?: {
      deletedId?: string | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    } | null;
  };
}

interface InventoryRow {
  id: string;
  supplier: string;
  product: string;
  productId: string;
  productImage: string;
  availability: string;
  expectedDate: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query ExternalInventory($type: String!) {
      records: metaobjects(type: $type, first: 100) {
        edges {
          node {
            id
            fields {
              key
              value
              reference {
                __typename
                ... on Product { id title featuredImage { url } }
                ... on Company { id name }
              }
            }
          }
        }
      }
    }`,
    { variables: { type: METAOBJECT_TYPE } },
  );

  const json = (await response.json()) as InventoryResponse;
  const edges = json.data?.records?.edges ?? [];

  const records: InventoryRow[] = edges.map(({ node }) => {
    const byKey = new Map(node.fields.map((field) => [field.key, field]));
    const supplierField = byKey.get("supplier");
    const productField = byKey.get("product");

    return {
      id: node.id,
      supplier: supplierField?.reference?.name ?? "",
      product: productField?.reference?.title ?? "",
      productId: productField?.reference?.id ?? "",
      productImage: productField?.reference?.featuredImage?.url ?? "",
      availability: byKey.get("availability")?.value ?? "",
      expectedDate: byKey.get("expected_date")?.value ?? "",
    };
  });

  return { records };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const id = String(formData.get("id") ?? "");

  const response = await admin.graphql(
    `#graphql
    mutation DeleteExternalInventory($id: ID!) {
      result: metaobjectDelete(id: $id) {
        deletedId
        userErrors { field message }
      }
    }`,
    { variables: { id } },
  );

  const json = (await response.json()) as DeleteResponse;
  const errors = json.data?.result?.userErrors ?? [];
  return { ok: errors.length === 0, errors };
};

export default function Index() {
  const { records } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const t = useTranslation();

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) {
        shopify.toast.show(t("inventory.toastDeleted"));
      } else if (fetcher.data.errors?.length) {
        shopify.toast.show(fetcher.data.errors[0].message, { isError: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const handleNew = () => navigate("/app/inventory/new");

  const handleEdit = (row: InventoryRow) => {
    const recordId = row.id.split("/").pop();
    navigate(`/app/inventory/${recordId}`);
  };

  const handleDelete = (row: InventoryRow) => {
    fetcher.submit({ id: row.id }, { method: "POST" });
  };

  const [supplierFilter, setSupplierFilter] = useState("all");
  const [productQuery, setProductQuery] = useState("");

  const supplierOptions = useMemo(
    () =>
      Array.from(
        new Set(records.map((row) => row.supplier).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [records],
  );

  const filteredRecords = useMemo(
    () =>
      records.filter((row) => {
        const matchesSupplier =
          supplierFilter === "all" || row.supplier === supplierFilter;
        const matchesProduct =
          !productQuery ||
          row.product.toLowerCase().includes(productQuery.toLowerCase());
        return matchesSupplier && matchesProduct;
      }),
    [records, supplierFilter, productQuery],
  );

  const hasActiveFilters = supplierFilter !== "all" || productQuery !== "";

  const clearFilters = () => {
    setSupplierFilter("all");
    setProductQuery("");
  };

  return (
    <s-page heading={t("inventory.title")}>
      <s-button slot="primary-action" variant="primary" onClick={handleNew}>
        {t("action.new")}
      </s-button>

      <s-section heading={t("inventory.listTitle")}>
        <s-paragraph>{t("inventory.intro")}</s-paragraph>
        {records.length === 0 ? (
          <s-paragraph>{t("inventory.empty")}</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base" alignItems="end">
              <s-select
                label={t("field.supplier")}
                value={supplierFilter}
                onChange={(e) =>
                  setSupplierFilter((e.target as HTMLSelectElement).value)
                }
              >
                <s-option value="all">{t("filter.allSuppliers")}</s-option>
                {supplierOptions.map((supplier) => (
                  <s-option key={supplier} value={supplier}>
                    {supplier}
                  </s-option>
                ))}
              </s-select>
              <s-search-field
                label={t("field.product")}
                placeholder={t("filter.productSearch")}
                value={productQuery}
                onInput={(e) =>
                  setProductQuery((e.target as HTMLInputElement).value)
                }
              />
              {hasActiveFilters ? (
                <s-button variant="tertiary" onClick={clearFilters}>
                  {t("filter.clear")}
                </s-button>
              ) : null}
            </s-stack>

            {filteredRecords.length === 0 ? (
              <s-paragraph>{t("inventory.noMatches")}</s-paragraph>
            ) : (
              <s-table>
                <s-table-header-row>
                  <s-table-header>{t("field.supplier")}</s-table-header>
                  <s-table-header>{t("field.product")}</s-table-header>
                  <s-table-header>{t("field.availability")}</s-table-header>
                  <s-table-header>{t("field.expectedDate")}</s-table-header>
                  <s-table-header>{t("field.actions")}</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {filteredRecords.map((row) => (
                    <s-table-row key={row.id}>
                      <s-table-cell>{row.supplier}</s-table-cell>
                      <s-table-cell>
                        <s-stack
                          direction="inline"
                          gap="base"
                          alignItems="center"
                        >
                          {row.productImage ? (
                            <s-thumbnail
                              size="small"
                              src={row.productImage}
                              alt={row.product}
                            />
                          ) : null}
                          {row.productId ? (
                            <s-link
                              href={`shopify://admin/products/${row.productId
                                .split("/")
                                .pop()}`}
                              target="_top"
                            >
                              {row.product}
                            </s-link>
                          ) : (
                            <s-text>{row.product}</s-text>
                          )}
                        </s-stack>
                      </s-table-cell>
                      <s-table-cell>{row.availability}</s-table-cell>
                      <s-table-cell>{row.expectedDate}</s-table-cell>
                      <s-table-cell>
                        <s-stack direction="inline" gap="small-300">
                          <s-button
                            variant="tertiary"
                            icon="edit"
                            accessibilityLabel={t("action.edit")}
                            onClick={() => handleEdit(row)}
                          />
                          <s-button
                            variant="tertiary"
                            tone="critical"
                            icon="delete"
                            accessibilityLabel={t("action.delete")}
                            onClick={() => handleDelete(row)}
                          />
                        </s-stack>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            )}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
