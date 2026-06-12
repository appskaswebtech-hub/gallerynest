import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  canUseProductCount,
  getCachedBillingPlan,
  limitProductsForPlan,
  planProductLimit,
  syncBillingPlan,
} from "../billing.server";
import prisma from "../db.server";

type SliderProduct = {
  id: string;
  title: string;
  handle?: string;
  image?: string | null;
  images?: SliderImage[];
  variants?: SliderVariant[];
  variantImageMap?: Record<string, string[]>;
};

type SliderImage = {
  id: string;
  url: string;
  alt?: string | null;
};

type SliderVariant = {
  id: string;
  title: string;
  sku?: string | null;
  image?: string | null;
  imageId?: string | null;
};

const THUMBNAIL_POSITIONS = new Set(["left", "right", "top", "bottom"]);
const ZOOM_ICON_POSITIONS = new Set([
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);
const THUMBNAIL_SIZES = new Set(["56", "68", "76", "88", "100", "112"]);

const parseJsonArray = <T,>(value: string | null | undefined): T[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeShopifyId = (id: string | number | null | undefined) => {
  if (id === null || id === undefined) return "";
  return String(id).split("/").pop() ?? String(id);
};

const normalizeProducts = (products: SliderProduct[]) =>
  products
    .filter((product) => product.id && product.title)
    .map((product) => {
      const images = Array.isArray(product.images)
        ? product.images
            .filter((image) => image.id && image.url)
            .map((image) => ({
              id: normalizeShopifyId(image.id),
              url: image.url,
              alt: image.alt ?? null,
            }))
        : [];
      const imageIds = new Set(images.map((image) => image.id));
      const variants = Array.isArray(product.variants)
        ? product.variants
            .filter((variant) => variant.id && variant.title)
            .map((variant) => {
              const id = normalizeShopifyId(variant.id);

              return {
                id,
                title: variant.title,
                sku: variant.sku ?? null,
                image: variant.image ?? null,
                imageId: variant.imageId ? normalizeShopifyId(variant.imageId) : null,
              };
            })
        : [];
      const existingMap =
        product.variantImageMap && typeof product.variantImageMap === "object"
          ? product.variantImageMap
          : {};
      const variantImageMap = variants.reduce<Record<string, string[]>>(
        (map, variant) => {
          const savedMapEntry =
            existingMap[variant.id] ??
            Object.entries(existingMap).find(
              ([variantId]) => normalizeShopifyId(variantId) === variant.id,
            )?.[1];
          const savedImageIds = Array.isArray(savedMapEntry)
            ? savedMapEntry
                .map(normalizeShopifyId)
                .filter((imageId) => imageIds.has(imageId))
            : [];
          const fallbackImageIds =
            variant.imageId && imageIds.has(variant.imageId) ? [variant.imageId] : [];

          map[variant.id] = savedImageIds.length ? savedImageIds : fallbackImageIds;
          return map;
        },
        {},
      );

      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        image: product.image ?? null,
        images,
        variants,
        variantImageMap,
      };
    });

const hydrateProductsWithVariants = async (
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  products: SliderProduct[],
) => {
  if (products.length === 0) return [];

  const response = await admin.graphql(
    `#graphql
      query SelectedProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            featuredImage {
              id
              url
            }
            images(first: 100) {
              nodes {
                id
                url
                altText
              }
            }
            variants(first: 100) {
              nodes {
                id
                title
                sku
                image {
                  id
                  url
                }
              }
            }
          }
        }
      }
    `,
    { variables: { ids: products.map((product) => product.id) } },
  );
  const data = await response.json();
  const productsById = new Map<string, SliderProduct>(
    (data.data?.nodes ?? [])
      .filter(Boolean)
      .map((product: any) => [
        product.id,
        {
          id: product.id,
          title: product.title,
          handle: product.handle,
          image: product.featuredImage?.url ?? null,
          images: (product.images?.nodes ?? []).map((image: any) => ({
            id: image.id,
            url: image.url,
            alt: image.altText ?? null,
          })),
          variants: (product.variants?.nodes ?? []).map((variant: any) => ({
            id: variant.id,
            title: variant.title,
            sku: variant.sku ?? null,
            image: variant.image?.url ?? null,
            imageId: variant.image?.id ?? null,
          })),
        },
      ]),
  );

  return normalizeProducts(
    products.map((savedProduct) => {
      const hydratedProduct = productsById.get(savedProduct.id);
      if (!hydratedProduct) return savedProduct;

      return {
        ...hydratedProduct,
        variantImageMap: savedProduct.variantImageMap,
      };
    }),
  );
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const { plan } = await syncBillingPlan({ billing, shop: session.shop });
  const setting = await prisma.productSliderSetting.findUnique({
    where: { shop: session.shop },
  });
  const products = await hydrateProductsWithVariants(
    admin,
    limitProductsForPlan(parseJsonArray<SliderProduct>(setting?.products), plan),
  );

  return {
    plan,
    productLimit: planProductLimit(plan),
    products,
    thumbnailPosition: setting?.thumbnailPosition ?? "left",
    thumbnailSize: setting?.thumbnailSize ?? 76,
    syncVariantImages: setting?.syncVariantImages ?? true,
    hideThumbnails: setting?.hideThumbnails ?? false,
    hideZoomIcon: setting?.hideZoomIcon ?? false,
    zoomIconPosition: setting?.zoomIconPosition ?? "top-right",
    previousArrowSvg: setting?.previousArrowSvg ?? "",
    nextArrowSvg: setting?.nextArrowSvg ?? "",
    zoomIconSvg: setting?.zoomIconSvg ?? "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "clear") {
    await prisma.productSliderSetting.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, productIds: "[]", products: "[]" },
      update: { productIds: "[]", products: "[]" },
    });

    return { ok: true, message: "Products removed" };
  }

  const rawProducts = formData.get("products")?.toString() ?? "[]";
  const plan = await getCachedBillingPlan(session.shop);
  const requestedProducts = normalizeProducts(parseJsonArray<SliderProduct>(rawProducts));
  if (!canUseProductCount(plan, requestedProducts.length)) {
    return {
      ok: false,
      message: `Your ${plan} plan allows up to ${planProductLimit(plan)} products.`,
    };
  }
  const products = requestedProducts;
  const thumbnailPosition = formData.get("thumbnailPosition")?.toString() ?? "left";
  const safeThumbnailPosition = THUMBNAIL_POSITIONS.has(thumbnailPosition)
    ? thumbnailPosition
    : "left";
  const thumbnailSize = formData.get("thumbnailSize")?.toString() ?? "76";
  const safeThumbnailSize = Number(
    THUMBNAIL_SIZES.has(thumbnailSize) ? thumbnailSize : "76",
  );
  const syncVariantImages = formData.get("syncVariantImages") === "on";
  const zoomIconPosition = formData.get("zoomIconPosition")?.toString() ?? "top-right";
  const safeZoomIconPosition = ZOOM_ICON_POSITIONS.has(zoomIconPosition)
    ? zoomIconPosition
    : "top-right";
  const hideThumbnails = formData.get("hideThumbnails") === "on";
  const hideZoomIcon = formData.get("hideZoomIcon") === "on";
  const previousArrowSvg = formData.get("previousArrowSvg")?.toString() ?? "";
  const nextArrowSvg = formData.get("nextArrowSvg")?.toString() ?? "";
  const zoomIconSvg = formData.get("zoomIconSvg")?.toString() ?? "";

  await prisma.productSliderSetting.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      productIds: JSON.stringify(products.map((product) => product.id)),
      products: JSON.stringify(products),
      thumbnailPosition: safeThumbnailPosition,
      thumbnailSize: safeThumbnailSize,
      syncVariantImages,
      hideThumbnails,
      hideZoomIcon,
      zoomIconPosition: safeZoomIconPosition,
      previousArrowSvg,
      nextArrowSvg,
      zoomIconSvg,
    },
    update: {
      productIds: JSON.stringify(products.map((product) => product.id)),
      products: JSON.stringify(products),
      thumbnailPosition: safeThumbnailPosition,
      thumbnailSize: safeThumbnailSize,
      syncVariantImages,
      hideThumbnails,
      hideZoomIcon,
      zoomIconPosition: safeZoomIconPosition,
      previousArrowSvg,
      nextArrowSvg,
      zoomIconSvg,
    },
  });

  return { ok: true, message: "Slider settings saved" };
};

export default function Index() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const [products, setProducts] = useState<SliderProduct[]>(loaderData.products);
  const [thumbnailPosition, setThumbnailPosition] = useState(
    loaderData.thumbnailPosition,
  );
  const [thumbnailSize, setThumbnailSize] = useState(String(loaderData.thumbnailSize));
  const [syncVariantImages, setSyncVariantImages] = useState(
    loaderData.syncVariantImages,
  );
  const [hideThumbnails, setHideThumbnails] = useState(loaderData.hideThumbnails);
  const [hideZoomIcon, setHideZoomIcon] = useState(loaderData.hideZoomIcon);
  const [zoomIconPosition, setZoomIconPosition] = useState(
    loaderData.zoomIconPosition,
  );
  const [previousArrowSvg, setPreviousArrowSvg] = useState(
    loaderData.previousArrowSvg,
  );
  const [nextArrowSvg, setNextArrowSvg] = useState(loaderData.nextArrowSvg);
  const [zoomIconSvg, setZoomIconSvg] = useState(loaderData.zoomIconSvg);
  const productLimitLabel =
    loaderData.productLimit === null ? "Unlimited" : String(loaderData.productLimit);

  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    setProducts(loaderData.products);
    setThumbnailPosition(loaderData.thumbnailPosition);
    setThumbnailSize(String(loaderData.thumbnailSize));
    setSyncVariantImages(loaderData.syncVariantImages);
    setHideThumbnails(loaderData.hideThumbnails);
    setHideZoomIcon(loaderData.hideZoomIcon);
    setZoomIconPosition(loaderData.zoomIconPosition);
    setPreviousArrowSvg(loaderData.previousArrowSvg);
    setNextArrowSvg(loaderData.nextArrowSvg);
    setZoomIconSvg(loaderData.zoomIconSvg);
  }, [
    loaderData.products,
    loaderData.thumbnailPosition,
    loaderData.thumbnailSize,
    loaderData.syncVariantImages,
    loaderData.hideThumbnails,
    loaderData.hideZoomIcon,
    loaderData.zoomIconPosition,
    loaderData.previousArrowSvg,
    loaderData.nextArrowSvg,
    loaderData.zoomIconSvg,
  ]);

  useEffect(() => {
    if (actionData?.message) {
      shopify.toast.show(actionData.message, { isError: actionData.ok === false });
    }
  }, [actionData, shopify]);

  const chooseProducts = async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: true,
      selectionIds: products.map((product) => ({ id: product.id })),
      filter: { hidden: false, variants: true },
    });

    if (!selection?.selection) return;

    const selectedProducts = normalizeProducts(
      selection.selection.map((product) => {
        const images =
          product.images
            ?.map((image: any) => ({
              id: String(image.id ?? image.originalSrc ?? image.url ?? ""),
              url: image.originalSrc ?? image.url ?? "",
              alt: image.altText ?? null,
            }))
            .filter((image: SliderImage) => image.id && image.url) ?? [];
        const variants =
          product.variants?.map((variant: any) => ({
            id: variant.id,
            title: variant.title,
            sku: variant.sku ?? null,
            image:
              variant.image?.originalSrc ??
              variant.image?.url ??
              product.images?.[0]?.originalSrc ??
              null,
            imageId: variant.image?.id ? String(variant.image.id) : null,
          })) ?? [];

        return {
          id: product.id,
          title: product.title,
          handle: product.handle,
          image: product.images?.[0]?.originalSrc ?? null,
          images,
          variants,
        };
      }),
    );

    if (
      loaderData.productLimit !== null &&
      selectedProducts.length > loaderData.productLimit
    ) {
      shopify.toast.show(
        `${loaderData.plan} plan allows up to ${loaderData.productLimit} products.`,
        { isError: true },
      );
      return;
    }

    setProducts(selectedProducts);
  };

  const removeProduct = (id: string) => {
    setProducts((currentProducts) =>
      currentProducts.filter((product) => product.id !== id),
    );
  };

  return (
    <s-page heading="Product image slider">
      <s-button slot="primary-action" onClick={chooseProducts}>
        Select products
      </s-button>

      <s-section heading="Dashboard">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text tone="neutral">Selected products</s-text>
              <s-heading>
                {products.length} / {productLimitLabel}
              </s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text tone="neutral">Current plan</s-text>
              <s-heading>{loaderData.plan}</s-heading>
              <s-link href="/app/billing">Manage billing</s-link>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text tone="neutral">Mapped variants</s-text>
              <s-heading>
                {products.reduce(
                  (total, product) =>
                    total +
                    (product.variants?.filter(
                      (variant) =>
                        (product.variantImageMap?.[variant.id] ?? []).length > 0,
                    ).length ?? 0),
                  0,
                )}
              </s-heading>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text tone="neutral">Zoom gallery</s-text>
              <s-heading>{hideZoomIcon ? "Hidden" : "Enabled"}</s-heading>
            </s-stack>
          </s-box>
        </div>
      </s-section>

      <s-section heading="Slider settings">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Choose the products where the storefront image slider should appear.
            Products not selected here will keep the normal theme gallery.
          </s-paragraph>

          <s-select
            label="Thumbnail position"
            name="thumbnailPosition"
            value={thumbnailPosition}
            onChange={(event) =>
              setThumbnailPosition(event.currentTarget.value || "left")
            }
          >
            <s-option value="left">Left</s-option>
            <s-option value="right">Right</s-option>
            <s-option value="top">Top</s-option>
            <s-option value="bottom">Bottom</s-option>
          </s-select>

          <s-select
            label="Thumbnail size"
            name="thumbnailSize"
            value={thumbnailSize}
            disabled={hideThumbnails}
            onChange={(event) =>
              setThumbnailSize(event.currentTarget.value || "76")
            }
          >
            <s-option value="56">Small</s-option>
            <s-option value="68">Medium</s-option>
            <s-option value="76">Default</s-option>
            <s-option value="88">Large</s-option>
            <s-option value="100">Extra large</s-option>
            <s-option value="112">Maximum</s-option>
          </s-select>

          <s-checkbox
            label="Change image when variant changes"
            checked={syncVariantImages}
            onChange={(event) =>
              setSyncVariantImages(event.currentTarget.checked)
            }
          />

          <s-checkbox
            label="Hide thumbnails"
            checked={hideThumbnails}
            onChange={(event) => setHideThumbnails(event.currentTarget.checked)}
          />

          <s-checkbox
            label="Hide zoom icon"
            checked={hideZoomIcon}
            onChange={(event) => setHideZoomIcon(event.currentTarget.checked)}
          />

          <s-select
            label="Zoom icon position"
            name="zoomIconPosition"
            value={zoomIconPosition}
            disabled={hideZoomIcon}
            onChange={(event) =>
              setZoomIconPosition(event.currentTarget.value || "top-right")
            }
          >
            <s-option value="top-left">Top left</s-option>
            <s-option value="top-right">Top right</s-option>
            <s-option value="bottom-left">Bottom left</s-option>
            <s-option value="bottom-right">Bottom right</s-option>
          </s-select>

          <s-text-area
            label="Previous arrow SVG"
            rows={4}
            value={previousArrowSvg}
            onInput={(event) => setPreviousArrowSvg(event.currentTarget.value)}
          />

          <s-text-area
            label="Next arrow SVG"
            rows={4}
            value={nextArrowSvg}
            onInput={(event) => setNextArrowSvg(event.currentTarget.value)}
          />

          <s-text-area
            label="Zoom icon SVG"
            rows={4}
            value={zoomIconSvg}
            disabled={hideZoomIcon}
            onInput={(event) => setZoomIconSvg(event.currentTarget.value)}
          />

          <s-stack direction="inline" gap="base">
            <s-button onClick={chooseProducts}>Add products</s-button>
            <Form method="post">
              <input type="hidden" name="intent" value="clear" />
              <s-button
                type="submit"
                tone="critical"
                variant="secondary"
                disabled={products.length === 0}
              >
                Remove all
              </s-button>
            </Form>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading={`Selected products (${products.length})`}>
        {products.length === 0 ? (
          <s-paragraph>No products selected yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {products.map((product) => (
              <s-box
                key={product.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="inline" gap="base" alignItems="center">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt=""
                      width="56"
                      height="56"
                      style={{ objectFit: "cover", borderRadius: 6 }}
                    />
                  ) : null}
                  <s-stack direction="block" gap="small">
                    <s-text>{product.title}</s-text>
                    <s-text tone="neutral">{product.handle ?? product.id}</s-text>
                    {product.variants?.length ? (
                      <s-text tone="neutral">
                        Mapped variants:{" "}
                        {
                          product.variants.filter(
                            (variant) =>
                              (product.variantImageMap?.[variant.id] ?? []).length > 0,
                          ).length
                        }{" "}
                        / {product.variants.length}
                      </s-text>
                    ) : null}
                  </s-stack>
                  <s-link href={`/app/products/${normalizeShopifyId(product.id)}`}>
                    Open
                  </s-link>
                  <s-button
                    variant="tertiary"
                    onClick={() => removeProduct(product.id)}
                  >
                    Remove
                  </s-button>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section>
        <Form method="post">
          <input type="hidden" name="products" value={JSON.stringify(products)} />
          <input
            type="hidden"
            name="thumbnailPosition"
            value={thumbnailPosition}
          />
          <input type="hidden" name="thumbnailSize" value={thumbnailSize} />
          {syncVariantImages ? (
            <input type="hidden" name="syncVariantImages" value="on" />
          ) : null}
          <input
            type="hidden"
            name="zoomIconPosition"
            value={zoomIconPosition}
          />
          <input
            type="hidden"
            name="previousArrowSvg"
            value={previousArrowSvg}
          />
          <input type="hidden" name="nextArrowSvg" value={nextArrowSvg} />
          <input type="hidden" name="zoomIconSvg" value={zoomIconSvg} />
          {hideThumbnails ? (
            <input type="hidden" name="hideThumbnails" value="on" />
          ) : null}
          {hideZoomIcon ? (
            <input type="hidden" name="hideZoomIcon" value="on" />
          ) : null}
          <s-button type="submit" variant="primary" loading={isSaving || undefined}>
            Save settings
          </s-button>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Theme setup">
        <s-paragraph>
          Add the GalleryNest product slider app block to the product template in
          the theme editor. The block checks these settings and only renders on
          selected products.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
