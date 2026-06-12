export const STARTER_PLAN = "Starter";
export const BASIC_PLAN = "Basic";
export const ENTERPRISE_PLAN = "Enterprise";
export const BILLING_PLANS = [BASIC_PLAN, ENTERPRISE_PLAN] as const;

export type GalleryNestPlan =
  | typeof STARTER_PLAN
  | typeof BASIC_PLAN
  | typeof ENTERPRISE_PLAN;

export const PLAN_LIMITS: Record<GalleryNestPlan, number | null> = {
  [STARTER_PLAN]: 5,
  [BASIC_PLAN]: 100,
  [ENTERPRISE_PLAN]: null,
};

export const PLAN_PRICES: Record<GalleryNestPlan, string> = {
  [STARTER_PLAN]: "Free",
  [BASIC_PLAN]: "$9.99",
  [ENTERPRISE_PLAN]: "$17.99",
};
