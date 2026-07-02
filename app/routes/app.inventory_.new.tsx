import { useEffect, useRef, useState } from "react";
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
import { ProductPicker, type SelectedProduct } from "../components/ProductPicker";

const METAOBJECT_TYPE = "$app:external_inventory";

interface Option {
    id: string;
    label: string;
}

interface OptionsResponse {
    data?: {
        companies?: {
            edges: Array<{ node: { id: string; name: string } }>;
        };
    };
}

interface MetaobjectMutationResponse {
    data?: {
        result?: {
            metaobject?: { id: string } | null;
            userErrors: Array<{ field: string[] | null; message: string }>;
        } | null;
    };
}

type FieldMap = Record<string, string>;

const FIELD_KEYS = ["supplier", "product", "availability", "expected_date"] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { admin } = await authenticate.admin(request);

    const response = await admin.graphql(
        `#graphql
    query ExternalInventoryOptions {
      companies(first: 100) {
        edges { node { id name } }
      }
    }`,
    );

    const json = (await response.json()) as OptionsResponse;

    const suppliers: Option[] =
        json.data?.companies?.edges.map(({ node }) => ({
            id: node.id,
            label: node.name,
        })) ?? [];

    return { suppliers };
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();

    const fields = FIELD_KEYS.map((key) => {
        const value = String(formData.get(key) ?? "").trim();
        return value ? { key, value } : null;
    }).filter((field) => field !== null) as Array<{ key: string; value: string }>;

    const response = await admin.graphql(
        `#graphql
    mutation CreateExternalInventory($metaobject: MetaobjectCreateInput!) {
      result: metaobjectCreate(metaobject: $metaobject) {
        metaobject { id }
        userErrors { field message }
      }
    }`,
        { variables: { metaobject: { type: METAOBJECT_TYPE, fields } } },
    );

    const json = (await response.json()) as MetaobjectMutationResponse;
    const errors = json.data?.result?.userErrors ?? [];
    return { ok: errors.length === 0, errors };
};

const EMPTY_FORM: FieldMap = {
    supplier: "",
    product: "",
    availability: "",
    expected_date: "",
};

export default function NewInventoryRecord() {
    const { suppliers } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();
    const shopify = useAppBridge();
    const navigate = useNavigate();
    const t = useTranslation();

    const [form, setForm] = useState<FieldMap>(EMPTY_FORM);
    const [product, setProduct] = useState<SelectedProduct | null>(null);
    const hasNavigated = useRef(false);
    const isSubmitting = ["loading", "submitting"].includes(fetcher.state);

    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data && !hasNavigated.current) {
            if (fetcher.data.ok) {
                hasNavigated.current = true;
                shopify.toast.show(t("inventory.toastCreated"));
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
        const payload: Record<string, string> = {};
        for (const key of Object.keys(form)) {
            if (form[key] !== "") payload[key] = form[key];
        }
        if (product) payload.product = product.id;
        fetcher.submit(payload, { method: "POST" });
    };

    const cancel = () => navigate("/app");

    return (
        <s-page heading={t("inventory.formNew")}>
            <s-button slot="primary-action" variant="primary" onClick={cancel}>
                {t("action.cancel")}
            </s-button>

            <s-section heading={t("inventory.formNew")}>
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

                    <div>
                        <label
                            htmlFor="expected_date"
                            style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}
                        >
                            {t("field.expectedDate")}
                        </label>
                        <input
                            id="expected_date"
                            type="date"
                            name="expected_date"
                            value={form.expected_date}
                            onChange={(e) => setField("expected_date", e.target.value)}
                            style={{
                                padding: "8px",
                                borderRadius: "4px",
                                border: "1px solid #ccc",
                                width: "100%",
                            }}
                        />
                    </div>

                    <s-stack direction="inline" gap="base">
                        <s-button
                            variant="primary"
                            onClick={save}
                            {...(isSubmitting ? { loading: true } : {})}
                        >
                            {t("action.create")}
                        </s-button>
                        <s-button variant="tertiary" onClick={cancel}>
                            {t("action.cancel")}
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
