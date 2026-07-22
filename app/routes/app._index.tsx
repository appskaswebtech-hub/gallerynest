import { useEffect, useState, type CSSProperties } from "react";
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
import { useLanguage } from "../i18n/LanguageContext";
import {
  LANGUAGE_LABELS,
  SUPPORTED_LOCALES,
  normalizeLocale,
} from "../i18n/languages";
import { translate } from "../i18n/translations";
import { detectLocaleFromRequest } from "../i18n/detectLocale.server";

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
  const locale = detectLocaleFromRequest(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "clear") {
    await prisma.productSliderSetting.upsert({
      where: { shop: session.shop },
      create: { shop: session.shop, productIds: "[]", products: "[]" },
      update: { productIds: "[]", products: "[]" },
    });

    return { ok: true, message: translate(locale, "dashboard.toastProductsRemoved") };
  }

  const rawProducts = formData.get("products")?.toString() ?? "[]";
  const plan = await getCachedBillingPlan(session.shop);
  const requestedProducts = normalizeProducts(parseJsonArray<SliderProduct>(rawProducts));
  if (!canUseProductCount(plan, requestedProducts.length)) {
    return {
      ok: false,
      message: translate(locale, "dashboard.toastPlanLimit", {
        plan,
        limit: planProductLimit(plan) ?? "",
      }),
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

  return { ok: true, message: translate(locale, "dashboard.toastSettingsSaved") };
};

export default function Index() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const { t, locale, setLocale } = useLanguage();
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
    loaderData.productLimit === null
      ? t("dashboard.unlimited")
      : String(loaderData.productLimit);

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
        t("dashboard.toastPlanLimit", {
          plan: loaderData.plan,
          limit: loaderData.productLimit,
        }),
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

  const usageRatio =
    loaderData.productLimit === null
      ? 0
      : Math.min(1, products.length / Math.max(1, loaderData.productLimit));

  const dashboardCardStyle = (accent: string): CSSProperties => ({
    borderTop: `3px solid ${accent}`,
    borderRadius: 10,
    background: "#ffffff",
    boxShadow: "0 2px 10px rgba(60, 30, 110, 0.06)",
    padding: 14,
  });

  const settingsGroupLabelStyle: CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "#8a7bb5",
  };

  return (
    <s-page heading={t("dashboard.pageTitle")}>
      <s-button slot="primary-action" variant="primary" icon="product-add" onClick={chooseProducts}>
        {t("dashboard.selectProducts")}
      </s-button>

      <s-section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            borderRadius: 14,
            padding: "24px 28px",
            background: "linear-gradient(135deg, #1c1730 0%, #3a2d63 55%, #6c4fc7 100%)",
            boxShadow: "0 8px 24px rgba(45, 24, 90, 0.25)",
            color: "#f6f3ff",
          }}
        >
          <s-stack direction="block" gap="small">
            <span
              style={{
                color: "#ffffff",
                letterSpacing: "0.04em",
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {t("dashboard.heroTitle")}
            </span>
            <span style={{ fontSize: 16, fontWeight: 500, color: "#ffffff" }}>
              {t("dashboard.heroHeadline")}
            </span>
            <span style={{ color: "#d8c9ff", fontSize: 13 }}>
              {t("dashboard.heroTagline")}
            </span>
          </s-stack>

          <div style={{ minWidth: 160 }}>
            <s-select
              label={t("common.language")}
              value={locale}
              onChange={(event) =>
                setLocale(normalizeLocale(event.currentTarget.value))
              }
            >
              {SUPPORTED_LOCALES.map((code) => (
                <s-option key={code} value={code}>
                  {LANGUAGE_LABELS[code]}
                </s-option>
              ))}
            </s-select>
          </div>
        </div>
      </s-section>

      <s-section heading={t("dashboard.dashboardSection")}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <div style={dashboardCardStyle("#6c4fc7")}>
            <s-stack direction="block" gap="small">
              <s-text tone="neutral">{t("dashboard.selectedProducts")}</s-text>
              <s-heading>
                {products.length} / {productLimitLabel}
              </s-heading>
              {loaderData.productLimit !== null ? (
                <div
                  style={{
                    height: 6,
                    borderRadius: 999,
                    background: "#eee8ff",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${usageRatio * 100}%`,
                      borderRadius: 999,
                      background: "linear-gradient(90deg, #6c4fc7, #a084e8)",
                      transition: "width 200ms ease",
                    }}
                  />
                </div>
              ) : null}
            </s-stack>
          </div>
          <div style={dashboardCardStyle("#3f8ae0")}>
            <s-stack direction="block" gap="small">
              <s-text tone="neutral">{t("dashboard.currentPlan")}</s-text>
              <s-heading>{loaderData.plan}</s-heading>
              <s-link href="/app/billing">{t("dashboard.manageBilling")}</s-link>
            </s-stack>
          </div>
          <div style={dashboardCardStyle("#2fae87")}>
            <s-stack direction="block" gap="small">
              <s-text tone="neutral">{t("dashboard.mappedVariants")}</s-text>
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
          </div>
          <div style={dashboardCardStyle("#d68f2f")}>
            <s-stack direction="block" gap="small">
              <s-text tone="neutral">{t("dashboard.zoomGallery")}</s-text>
              <s-heading>
                {hideZoomIcon ? t("dashboard.hidden") : t("dashboard.enabled")}
              </s-heading>
            </s-stack>
          </div>
        </div>
      </s-section>

      <s-section heading={t("dashboard.sliderSettings")}>
        <s-stack direction="block" gap="base">
          <s-paragraph>{t("dashboard.sliderSettingsIntro")}</s-paragraph>

          <div style={dashboardCardStyle("#6c4fc7")}>
            <s-stack direction="block" gap="base">
              <span style={settingsGroupLabelStyle}>{t("dashboard.layoutGroup")}</span>

              <s-select
                key={`thumbnailPosition-${locale}`}
                label={t("dashboard.thumbnailPosition")}
                name="thumbnailPosition"
                value={thumbnailPosition}
                onChange={(event) =>
                  setThumbnailPosition(event.currentTarget.value || "left")
                }
              >
                <s-option value="left">{t("dashboard.left")}</s-option>
                <s-option value="right">{t("dashboard.right")}</s-option>
                <s-option value="top">{t("dashboard.top")}</s-option>
                <s-option value="bottom">{t("dashboard.bottom")}</s-option>
              </s-select>

              <s-select
                key={`thumbnailSize-${locale}`}
                label={t("dashboard.thumbnailSize")}
                name="thumbnailSize"
                value={thumbnailSize}
                disabled={hideThumbnails}
                onChange={(event) =>
                  setThumbnailSize(event.currentTarget.value || "76")
                }
              >
                <s-option value="56">{t("dashboard.small")}</s-option>
                <s-option value="68">{t("dashboard.medium")}</s-option>
                <s-option value="76">{t("dashboard.default")}</s-option>
                <s-option value="88">{t("dashboard.large")}</s-option>
                <s-option value="100">{t("dashboard.extraLarge")}</s-option>
                <s-option value="112">{t("dashboard.maximum")}</s-option>
              </s-select>

              <s-checkbox
                label={t("dashboard.syncVariantImages")}
                checked={syncVariantImages}
                onChange={(event) =>
                  setSyncVariantImages(event.currentTarget.checked)
                }
              />

              <s-checkbox
                label={t("dashboard.hideThumbnails")}
                checked={hideThumbnails}
                onChange={(event) =>
                  setHideThumbnails(event.currentTarget.checked)
                }
              />
            </s-stack>
          </div>

          <div style={dashboardCardStyle("#d68f2f")}>
            <s-stack direction="block" gap="base">
              <span style={settingsGroupLabelStyle}>{t("dashboard.zoomGallery")}</span>

              <s-checkbox
                label={t("dashboard.hideZoomIcon")}
                checked={hideZoomIcon}
                onChange={(event) => setHideZoomIcon(event.currentTarget.checked)}
              />

              <s-select
                key={`zoomIconPosition-${locale}`}
                label={t("dashboard.zoomIconPosition")}
                name="zoomIconPosition"
                value={zoomIconPosition}
                disabled={hideZoomIcon}
                onChange={(event) =>
                  setZoomIconPosition(event.currentTarget.value || "top-right")
                }
              >
                <s-option value="top-left">{t("dashboard.topLeft")}</s-option>
                <s-option value="top-right">{t("dashboard.topRight")}</s-option>
                <s-option value="bottom-left">{t("dashboard.bottomLeft")}</s-option>
                <s-option value="bottom-right">{t("dashboard.bottomRight")}</s-option>
              </s-select>
            </s-stack>
          </div>

          <div style={dashboardCardStyle("#3f8ae0")}>
            <s-stack direction="block" gap="base">
              <span style={settingsGroupLabelStyle}>{t("dashboard.svgGroup")}</span>

              <s-text-area
                label={t("dashboard.previousArrowSvg")}
                rows={4}
                value={previousArrowSvg}
                onInput={(event) => setPreviousArrowSvg(event.currentTarget.value)}
              />

              <s-text-area
                label={t("dashboard.nextArrowSvg")}
                rows={4}
                value={nextArrowSvg}
                onInput={(event) => setNextArrowSvg(event.currentTarget.value)}
              />

              <s-text-area
                label={t("dashboard.zoomIconSvg")}
                rows={4}
                value={zoomIconSvg}
                disabled={hideZoomIcon}
                onInput={(event) => setZoomIconSvg(event.currentTarget.value)}
              />
            </s-stack>
          </div>

          <s-stack direction="inline" gap="base">
            <s-button icon="plus" onClick={chooseProducts}>
              {t("dashboard.addProducts")}
            </s-button>
            <Form method="post">
              <input type="hidden" name="intent" value="clear" />
              <s-button
                type="submit"
                tone="critical"
                variant="secondary"
                icon="delete"
                disabled={products.length === 0}
              >
                {t("dashboard.removeAll")}
              </s-button>
            </Form>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section
        heading={t("dashboard.selectedProductsHeading", { count: products.length })}
      >
        {products.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              padding: "32px 16px",
              borderRadius: 12,
              background: "#faf8ff",
              border: "1px dashed #c9b8f5",
              textAlign: "center",
            }}
          >
            <s-text tone="neutral">{t("dashboard.emptyStateText")}</s-text>
            <s-button variant="primary" icon="product-add" onClick={chooseProducts}>
              {t("dashboard.selectProducts")}
            </s-button>
          </div>
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
                        {t("dashboard.mappedVariantsLine", {
                          mapped: product.variants.filter(
                            (variant) =>
                              (product.variantImageMap?.[variant.id] ?? []).length > 0,
                          ).length,
                          total: product.variants.length,
                        })}
                      </s-text>
                    ) : null}
                  </s-stack>
                  <s-link href={`/app/products/${normalizeShopifyId(product.id)}`}>
                    {t("dashboard.open")}
                  </s-link>
                  <s-button
                    variant="tertiary"
                    onClick={() => removeProduct(product.id)}
                  >
                    {t("dashboard.remove")}
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
          <s-button
            type="submit"
            variant="primary"
            icon="save"
            loading={isSaving || undefined}
          >
            {t("dashboard.saveSettings")}
          </s-button>
        </Form>
      </s-section>

      <s-section slot="aside" heading={t("dashboard.livePreview")}>
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection:
              thumbnailPosition === "top" || thumbnailPosition === "bottom"
                ? "column"
                : "row",
            ...(thumbnailPosition === "right" ? { flexDirection: "row-reverse" } : {}),
            ...(thumbnailPosition === "bottom"
              ? { flexDirection: "column-reverse" }
              : {}),
            gap: 8,
            padding: 14,
            borderRadius: 12,
            background: "linear-gradient(160deg, #f7f4ff 0%, #efe9ff 100%)",
            border: "1px solid #e2d8fb",
          }}
        >
          <div
            style={{
              position: "relative",
              flex: 1,
              aspectRatio: "1 / 1",
              borderRadius: 10,
              background: "linear-gradient(135deg, #d9cffb, #b9a4ee)",
            }}
          >
            {!hideZoomIcon ? (
              <div
                style={{
                  position: "absolute",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#ffffff",
                  boxShadow: "0 2px 6px rgba(60, 30, 110, 0.25)",
                  ...(zoomIconPosition.includes("top")
                    ? { top: 8 }
                    : { bottom: 8 }),
                  ...(zoomIconPosition.includes("left")
                    ? { left: 8 }
                    : { right: 8 }),
                }}
              />
            ) : null}
          </div>
          {!hideThumbnails ? (
            <div
              style={{
                display: "flex",
                flexDirection:
                  thumbnailPosition === "top" || thumbnailPosition === "bottom"
                    ? "row"
                    : "column",
                gap: 6,
              }}
            >
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  style={{
                    width: Math.max(28, Number(thumbnailSize) / 3),
                    height: Math.max(28, Number(thumbnailSize) / 3),
                    borderRadius: 6,
                    background: index === 0 ? "#8d6fe0" : "#cabdf2",
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
        <s-paragraph tone="neutral">{t("dashboard.livePreviewCaption")}</s-paragraph>
      </s-section>

      <s-section slot="aside" heading={t("dashboard.themeSetup")}>
        <div
          style={{
            borderRadius: 12,
            padding: 14,
            background: "linear-gradient(160deg, #f7f4ff 0%, #efe9ff 100%)",
            border: "1px solid #e2d8fb",
          }}
        >
          <s-paragraph>{t("dashboard.themeSetupText")}</s-paragraph>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
