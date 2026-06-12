import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getCachedBillingPlan, limitProductsForPlan } from "../billing.server";
import prisma from "../db.server";

type SliderProduct = {
  id: string;
  variantImageMap?: Record<string, string[]>;
};

const parseJsonArray = (value: string | null | undefined): string[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseProducts = (value: string | null | undefined): SliderProduct[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toGraphqlProductId = (productId: string | null) => {
  if (!productId) return null;
  if (productId.startsWith("gid://shopify/Product/")) return productId;
  if (/^\d+$/.test(productId)) return `gid://shopify/Product/${productId}`;
  return null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json({ enabled: false }, { status: 401 });
  }

  const url = new URL(request.url);
  const productId = toGraphqlProductId(url.searchParams.get("product_id"));
  const setting = await prisma.productSliderSetting.findUnique({
    where: { shop: session.shop },
  });
  const plan = await getCachedBillingPlan(session.shop);
  const products = limitProductsForPlan(parseProducts(setting?.products), plan);
  const productIds = products.map((product) => product.id);
  const selectedProduct = products.find(
    (product) => product.id === productId,
  );

  return Response.json(
    {
      enabled: Boolean(productId && productIds.includes(productId)),
      variantImageMap: selectedProduct?.variantImageMap,
      thumbnailPosition: setting?.thumbnailPosition ?? "left",
      thumbnailSize: setting?.thumbnailSize ?? 76,
      syncVariantImages: setting?.syncVariantImages ?? true,
      hideThumbnails: setting?.hideThumbnails ?? false,
      hideZoomIcon: setting?.hideZoomIcon ?? false,
      zoomIconPosition: setting?.zoomIconPosition ?? "top-right",
      previousArrowSvg: setting?.previousArrowSvg ?? "",
      nextArrowSvg: setting?.nextArrowSvg ?? "",
      zoomIconSvg: setting?.zoomIconSvg ?? "",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
};
