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
import prisma from "../db.server";

type SliderProduct = {
  id: string;
  title: string;
  handle?: string;
  image?: string | null;
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

const normalizeProducts = (products: SliderProduct[]) =>
  products
    .filter((product) => product.id && product.title)
    .map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      image: product.image ?? null,
    }));

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const setting = await prisma.productSliderSetting.findUnique({
    where: { shop: session.shop },
  });

  return {
    products: parseJsonArray<SliderProduct>(setting?.products),
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
  const products = normalizeProducts(parseJsonArray<SliderProduct>(rawProducts));
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
      shopify.toast.show(actionData.message);
    }
  }, [actionData, shopify]);

  const chooseProducts = async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: true,
      selectionIds: products.map((product) => ({ id: product.id })),
      filter: { hidden: false, variants: false },
    });

    if (!selection?.selection) return;

    setProducts(
      selection.selection.map((product) => ({
        id: product.id,
        title: product.title,
        handle: product.handle,
        image: product.images?.[0]?.originalSrc ?? null,
      })),
    );
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
                  </s-stack>
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
