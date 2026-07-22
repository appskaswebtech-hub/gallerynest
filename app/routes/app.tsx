import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { detectLocaleFromRequest } from "../i18n/detectLocale.server";
import { LanguageProvider, useLanguage } from "../i18n/LanguageContext";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    detectedLocale: detectLocaleFromRequest(request),
  };
};

function AppNav() {
  const { t } = useLanguage();

  return (
    <s-app-nav>
      <s-link href="/app">{t("nav.dashboard")}</s-link>
      <s-link href="/app/billing">{t("nav.billing")}</s-link>
    </s-app-nav>
  );
}

export default function App() {
  const { apiKey, detectedLocale } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <LanguageProvider detectedLocale={detectedLocale}>
        <AppNav />
        <Outlet />
      </LanguageProvider>
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
