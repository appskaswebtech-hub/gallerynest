import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  BASIC_PLAN,
  ENTERPRISE_PLAN,
  PLAN_PRICES,
  STARTER_PLAN,
  type GalleryNestPlan,
} from "../billing-plans";
import {
  BILLING_TEST,
  authenticate,
} from "../shopify.server";
import { syncBillingPlan } from "../billing.server";
import prisma from "../db.server";

const PLAN_FEATURES: Record<GalleryNestPlan, string[]> = {
  [STARTER_PLAN]: [
    "Use on up to 5 products",
    "Product image slider",
    "Zoom gallery",
    "Variant image mapping",
  ],
  [BASIC_PLAN]: [
    "Use on up to 100 products",
    "Product image slider",
    "Zoom gallery",
    "Variant image mapping",
    "Custom arrows and zoom icon",
  ],
  [ENTERPRISE_PLAN]: [
    "Use on unlimited products",
    "Everything in Basic",
    "Unlimited variant image mapping",
    "Priority support",
  ],
};
const PLAN_ORDER: GalleryNestPlan[] = [STARTER_PLAN, BASIC_PLAN, ENTERPRISE_PLAN];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const billingPlan = await syncBillingPlan({ billing, shop: session.shop });

  return {
    currentPlan: billingPlan.plan,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan")?.toString();

  if (plan === STARTER_PLAN) {
    await prisma.shopBilling.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, plan: STARTER_PLAN },
      update: { plan: STARTER_PLAN, subscriptionId: null },
    });

    return { ok: true, message: "Starter plan selected" };
  }

  if (plan !== BASIC_PLAN && plan !== ENTERPRISE_PLAN) {
    return { ok: false, message: "Select a valid plan" };
  }

  const url = new URL(request.url);
  await billing.request({
    plan,
    isTest: BILLING_TEST,
    returnUrl: `${url.origin}/app/billing`,
  });
};

export default function Billing() {
  const { currentPlan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.message) {
      shopify.toast.show(actionData.message, { isError: actionData.ok === false });
    }
  }, [actionData, shopify]);

  return (
    <s-page heading="Billing">
      <s-link slot="breadcrumb-actions" href="/app">
        Product image slider
      </s-link>
      <s-link slot="primary-action" href="/app">
        Back
      </s-link>

      <s-section heading="Choose a plan">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {PLAN_ORDER.map((plan) => {
            const isCurrent = currentPlan === plan;
            const isPaid = plan !== STARTER_PLAN;

            return (
              <s-box
                key={plan}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background={isCurrent ? "subdued" : undefined}
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="small" alignItems="center">
                    <s-heading>{plan}</s-heading>
                    {isCurrent ? <s-badge tone="success">Current plan</s-badge> : null}
                  </s-stack>
                  <s-heading>
                    {PLAN_PRICES[plan]}
                    {isPaid ? " / month" : ""}
                  </s-heading>
                  <s-stack direction="block" gap="small">
                    {PLAN_FEATURES[plan].map((feature) => (
                      <s-text key={feature}>✓ {feature}</s-text>
                    ))}
                  </s-stack>
                  <Form method="post">
                    <input type="hidden" name="plan" value={plan} />
                    <s-button
                      type="submit"
                      variant={isCurrent ? "secondary" : "primary"}
                      disabled={isCurrent}
                      loading={isSubmitting || undefined}
                    >
                      {isCurrent
                        ? "Current plan"
                        : plan === STARTER_PLAN
                          ? "Choose Starter"
                          : `Choose ${plan}`}
                    </s-button>
                  </Form>
                </s-stack>
              </s-box>
            );
          })}
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
