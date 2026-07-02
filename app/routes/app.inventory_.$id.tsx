import { useEffect, useRef, useState } from "react";
import type {
    ActionFunctionArgs,
    HeadersFunction,
    LoaderFunctionArgs,
} from "react-router";
import {
    redirect,
    useFetcher,
    useLoaderData,
    useNavigate,
    useRouteError,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { useTranslation } from "../i18n/context";
import { ProductPicker, type SelectedProduct } from "../components/ProductPicker";

const METAOBJECT_TYPE = "$app:external_inventory";

interface Option {
    id: string;
    label: string;
}

type FieldMap = Record<string, string>;

interface RecordResponse {
    data?: {
        metaobject?: {
            id: string;
            fields: Array<{
                key: string;
                value: string | null;
                reference: {
                    __typename?: string;
                    id?: string;
                    title?: string;
                    featuredImage?: { url: string } | null;
                } | null;
            }>;
        } | null;
        companies?: {
            edges: Array<{ node: { id: string; name: string } }>;
        };
    };
}

interface MetaobjectMutationResponse {
    data?: {
        result?: {
            metaobject?: { id: string } | null;
            deletedId?: string | null;
            userErrors: Array<{ field: string[] | null; message: string }>;
        } | null;
    };
}

const FIELD_KEYS = ["supplier", "product", "availability", "lead_time"] as const;

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
    const { id } = params;

    const response = await admin.graphql(
        `#graphql
    query ExternalInventoryRecord($id: ID!) {
      metaobject(id: $id) {
        id
        fields {
          key
          value
          reference {
            __typename
            ... on Product { id title featuredImage { url } }
          }
        }
      }
      companies(first: 100) {
        edges { node { id name } }
      }
    }`,
        { variables: { id: `gid://shopify/Metaobject/${id}` } },
    );

    const json = (await response.json()) as RecordResponse;
    const node = json.data?.metaobject;

    if (!node) {
        throw new Response("Not found", { status: 404 });
    }

    const fields: FieldMap = {};
    let product: SelectedProduct | null = null;
    for (const field of node.fields) {
        fields[field.key] = field.value ?? "";
        if (field.key === "product" && field.reference?.id) {
            product = {
                id: field.reference.id,
                title: field.reference.title ?? "",
                image: field.reference.featuredImage?.url,
            };
        }
    }

    const suppliers: Option[] =
        json.data?.companies?.edges.map(({ node }) => ({
            id: node.id,
            label: node.name,
        })) ?? [];

    return { record: { id: node.id, fields }, suppliers, product };
};

export const action = async ({ params, request }: ActionFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
    const { id } = params;
    const gid = `gid://shopify/Metaobject/${id}`;
    const formData = await request.formData();
    const intent = String(formData.get("intent") ?? "save");

    if (intent === "delete") {
        const response = await admin.graphql(
            `#graphql
      mutation DeleteExternalInventory($id: ID!) {
        result: metaobjectDelete(id: $id) {
          deletedId
          userErrors { field message }
        }
      }`,
            { variables: { id: gid } },
        );
        const json = (await response.json()) as MetaobjectMutationResponse;
        const errors = json.data?.result?.userErrors ?? [];
        if (errors.length === 0) {
            return redirect("/app");
        }
        return { ok: false, errors };
    }

    const fields = FIELD_KEYS.map((key) => {
        const value = String(formData.get(key) ?? "").trim();
        return { key, value };
    });

    const response = await admin.graphql(
        `#graphql
    mutation UpdateExternalInventory($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      result: metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }`,
        { variables: { id: gid, metaobject: { fields } } },
    );

    const json = (await response.json()) as MetaobjectMutationResponse;
    const errors = json.data?.result?.userErrors ?? [];
    return { ok: errors.length === 0, errors };
};

export default function EditInventoryRecord() {
    const { record, suppliers, product: loadedProduct } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();
    const shopify = useAppBridge();
    const navigate = useNavigate();
    const t = useTranslation();
    const hasNavigated = useRef(false);

    const [form, setForm] = useState<FieldMap>({
        supplier: "",
        product: "",
        availability: "",
        lead_time: "",
    });
    const [product, setProduct] = useState<SelectedProduct | null>(null);
    const isSubmitting = ["loading", "submitting"].includes(fetcher.state);

    useEffect(() => {
        setForm({
            supplier: record.fields.supplier ?? "",
            product: record.fields.product ?? "",
            availability: record.fields.availability ?? "",
            lead_time: record.fields.lead_time ?? "",
        });
        setProduct(loadedProduct);
        hasNavigated.current = false;
    }, [record, loadedProduct]);

    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data && !hasNavigated.current) {
            hasNavigated.current = true;
            if (fetcher.data.ok) {
                shopify.toast.show(t("inventory.toastUpdated"));
                navigate("/app");
            } else if (fetcher.data.errors?.length) {
                shopify.toast.show(fetcher.data.errors[0].message, { isError: true });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetcher.state, fetcher.data]);

    const setField = (key: string, value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const save = () => {
        fetcher.submit(
            { intent: "save", ...form, product: product?.id ?? "" },
            { method: "POST" },
        );
    };

    const cancel = () => navigate("/app");

    const remove = () => {
        fetcher.submit({ intent: "delete" }, { method: "POST" });
    };

    return (
        <s-page heading={t("inventory.formEdit")}>
            <s-button slot="primary-action" variant="primary" onClick={cancel}>
                {t("action.cancel")}
            </s-button>

            <s-section heading={t("inventory.formEdit")}>
                <s-stack direction="block" gap="base">
                    <s-select
                        label={t("field.supplier")}
                        name="supplier"
                        value={form.supplier}
                        onChange={(e) =>
                            setField("supplier", (e.target as HTMLSelectElement).value)
                        }
                    >
                        <s-option value="">-- {t("action.select")} --</s-option>
                        {suppliers.map((option) => (
                            <s-option key={option.id} value={option.id}>
                                {option.label}
                            </s-option>
                        ))}
                    </s-select>

                    <ProductPicker value={product} onChange={setProduct} />

                    <s-number-field
                        label={t("field.availability")}
                        name="availability"
                        value={form.availability}
                        onChange={(e) =>
                            setField("availability", (e.target as HTMLInputElement).value)
                        }
                    />

                    <s-number-field
                        label={t("field.leadTime")}
                        name="lead_time"
                        value={form.lead_time}
                        onChange={(e) =>
                            setField("lead_time", (e.target as HTMLInputElement).value)
                        }
                    />

                    <s-stack direction="inline" gap="base">
                        <s-button
                            variant="primary"
                            onClick={save}
                            {...(isSubmitting ? { loading: true } : {})}
                        >
                            {t("action.save")}
                        </s-button>
                        <s-button variant="tertiary" onClick={cancel}>
                            {t("action.cancel")}
                        </s-button>
                        <s-button variant="tertiary" tone="critical" onClick={remove}>
                            {t("action.delete")}
                        </s-button>
                    </s-stack>
                </s-stack>
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
