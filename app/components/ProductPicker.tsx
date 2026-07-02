import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "../i18n/context";

export interface SelectedProduct {
    id: string;
    title: string;
    image?: string;
}

/**
 * Product selector that opens the standard Shopify resource picker dialog
 * (with search) instead of a long dropdown. Suitable for stores with many
 * products.
 */
export function ProductPicker({
    value,
    onChange,
}: {
    value: SelectedProduct | null;
    onChange: (product: SelectedProduct | null) => void;
}) {
    const shopify = useAppBridge();
    const t = useTranslation();

    const openPicker = async () => {
        const selection = await shopify.resourcePicker({
            type: "product",
            action: "select",
            multiple: false,
            selectionIds: value ? [{ id: value.id }] : [],
        });

        if (selection && selection.length > 0) {
            const product = selection[0];
            onChange({
                id: product.id,
                title: product.title,
                image: product.images?.[0]?.originalSrc,
            });
        }
    };

    return (
        <s-stack direction="block" gap="small-300">
            <s-text type="strong">{t("field.product")}</s-text>
            {value ? (
                <s-stack direction="inline" gap="base" alignItems="center">
                    {value.image ? (
                        <s-thumbnail size="small" src={value.image} alt={value.title} />
                    ) : null}
                    <s-text>{value.title}</s-text>
                    <s-button variant="tertiary" onClick={openPicker}>
                        {t("action.changeProduct")}
                    </s-button>
                    <s-button
                        variant="tertiary"
                        tone="critical"
                        onClick={() => onChange(null)}
                    >
                        {t("action.removeProduct")}
                    </s-button>
                </s-stack>
            ) : (
                <s-button onClick={openPicker}>{t("action.selectProduct")}</s-button>
            )}
        </s-stack>
    );
}
