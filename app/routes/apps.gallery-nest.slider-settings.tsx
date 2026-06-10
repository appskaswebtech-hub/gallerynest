import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const parseJsonArray = (value: string | null | undefined): string[] => {
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
  const productIds = parseJsonArray(setting?.productIds);

  return Response.json(
    {
      enabled: Boolean(productId && productIds.includes(productId)),
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
