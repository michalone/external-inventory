import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { resolveLocale } from "../i18n";
import { I18nProvider, useTranslation } from "../i18n/context";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // Shopify passes the merchant locale via the `locale` query param to
  // embedded apps (e.g. ?locale=cs-CZ). Default language is English.
  const url = new URL(request.url);
  const locale = resolveLocale(url.searchParams.get("locale"));

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", locale };
};

function Nav() {
  const t = useTranslation();
  return (
    <s-app-nav>
      <s-link href="/app">{t("nav.home")}</s-link>
    </s-app-nav>
  );
}

export default function App() {
  const { apiKey, locale } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <I18nProvider locale={locale}>
        <Nav />
        <Outlet />
      </I18nProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
