import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useParams,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
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

const normalizeProduct = (product: SliderProduct) => {
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
  const variantImageMap = variants.reduce<Record<string, string[]>>((map, variant) => {
    const savedMapEntry =
      existingMap[variant.id] ??
      Object.entries(existingMap).find(
        ([variantId]) => normalizeShopifyId(variantId) === variant.id,
      )?.[1];
    const savedImageIds = Array.isArray(savedMapEntry)
      ? savedMapEntry.map(normalizeShopifyId).filter((imageId) => imageIds.has(imageId))
      : [];
    const fallbackImageIds =
      variant.imageId && imageIds.has(variant.imageId) ? [variant.imageId] : [];

    map[variant.id] = savedImageIds.length ? savedImageIds : fallbackImageIds;
    return map;
  }, {});

  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    image: product.image ?? null,
    images,
    variants,
    variantImageMap,
  };
};

const hydrateProduct = async (
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  product: SliderProduct,
) => {
  const response = await admin.graphql(
    `#graphql
      query SelectedProduct($id: ID!) {
        node(id: $id) {
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
    { variables: { id: product.id } },
  );
  const data = await response.json();
  const hydratedProduct = data.data?.node;

  if (!hydratedProduct) return normalizeProduct(product);

  return normalizeProduct({
    id: hydratedProduct.id,
    title: hydratedProduct.title,
    handle: hydratedProduct.handle,
    image: hydratedProduct.featuredImage?.url ?? null,
    images: (hydratedProduct.images?.nodes ?? []).map((image: any) => ({
      id: image.id,
      url: image.url,
      alt: image.altText ?? null,
    })),
    variants: (hydratedProduct.variants?.nodes ?? []).map((variant: any) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku ?? null,
      image: variant.image?.url ?? null,
      imageId: variant.image?.id ?? null,
    })),
    variantImageMap: product.variantImageMap,
  });
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const productId = normalizeShopifyId(params.productId);
  const setting = await prisma.productSliderSetting.findUnique({
    where: { shop: session.shop },
  });
  const savedProduct = parseJsonArray<SliderProduct>(setting?.products).find(
    (product) => normalizeShopifyId(product.id) === productId,
  );

  if (!savedProduct) {
    throw new Response("Product not found", { status: 404 });
  }

  return {
    product: await hydrateProduct(admin, savedProduct),
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const productId = normalizeShopifyId(params.productId);
  const formData = await request.formData();
  const nextMapRaw = formData.get("variantImageMap")?.toString() ?? "{}";
  let nextMap: Record<string, string[]> = {};

  try {
    const parsed = JSON.parse(nextMapRaw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      nextMap = Object.fromEntries(
        Object.entries(parsed).map(([variantId, imageIds]) => [
          normalizeShopifyId(variantId),
          Array.isArray(imageIds) ? imageIds.map(normalizeShopifyId) : [],
        ]),
      );
    }
  } catch {
    nextMap = {};
  }

  const setting = await prisma.productSliderSetting.findUnique({
    where: { shop: session.shop },
  });
  const products = parseJsonArray<SliderProduct>(setting?.products);
  const updatedProducts = products.map((product) =>
    normalizeShopifyId(product.id) === productId
      ? { ...product, variantImageMap: nextMap }
      : product,
  );

  await prisma.productSliderSetting.update({
    where: { shop: session.shop },
    data: { products: JSON.stringify(updatedProducts) },
  });

  return { ok: true, message: "Image mapping saved" };
};

export default function ProductMapping() {
  const { product } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const params = useParams();
  const shopify = useAppBridge();
  const [activeVariantId, setActiveVariantId] = useState(
    product.variants?.[0]?.id ?? "",
  );
  const [variantImageMap, setVariantImageMap] = useState(product.variantImageMap ?? {});
  const activeVariant =
    product.variants?.find((variant) => variant.id === activeVariantId) ??
    product.variants?.[0] ??
    null;
  const activeMappedImageIds = new Set(
    activeVariant ? variantImageMap[activeVariant.id] ?? [] : [],
  );
  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    setActiveVariantId(product.variants?.[0]?.id ?? "");
    setVariantImageMap(product.variantImageMap ?? {});
  }, [product]);

  useEffect(() => {
    if (actionData?.message) {
      shopify.toast.show(actionData.message);
    }
  }, [actionData, shopify]);

  const toggleMappedImage = (variantId: string, imageId: string, checked: boolean) => {
    setVariantImageMap((currentMap) => {
      const imageIds = new Set(currentMap[variantId] ?? []);
      if (checked) {
        imageIds.add(imageId);
      } else {
        imageIds.delete(imageId);
      }

      return {
        ...currentMap,
        [variantId]: Array.from(imageIds),
      };
    });
  };

  return (
    <s-page heading={product.title}>
      <s-link slot="breadcrumb-actions" href="/app">
        Product image slider
      </s-link>
      <s-link slot="primary-action" href="/app">
        Back
      </s-link>

      <s-section heading="Variant image mapping">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Pick a variant, then choose which product images should appear inside
            the zoom gallery for that variant.
          </s-paragraph>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
              alignItems: "start",
            }}
          >
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text>
                  Images for{" "}
                  {activeVariant
                    ? `${activeVariant.sku || activeVariant.title} - ${activeVariant.title}`
                    : "selected variant"}
                </s-text>
                {product.images?.length ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {product.images.map((image) => (
                      <label
                        key={image.id}
                        style={{
                          border: activeMappedImageIds.has(image.id)
                            ? "2px solid #202223"
                            : "1px solid #d1d5db",
                          borderRadius: 8,
                          padding: 8,
                          cursor: activeVariant ? "pointer" : "default",
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <img
                          src={image.url}
                          alt={image.alt ?? ""}
                          width="120"
                          height="120"
                          style={{
                            width: "100%",
                            height: 120,
                            objectFit: "cover",
                            borderRadius: 6,
                            background: "#f6f6f7",
                          }}
                        />
                        <s-checkbox
                          label="Show"
                          checked={activeMappedImageIds.has(image.id)}
                          disabled={!activeVariant}
                          onChange={(event) => {
                            if (!activeVariant) return;
                            toggleMappedImage(
                              activeVariant.id,
                              image.id,
                              event.currentTarget.checked,
                            );
                          }}
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <s-paragraph>No product images found.</s-paragraph>
                )}
              </s-stack>
            </s-box>

            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="small">
                <s-text>Variants</s-text>
                {product.variants?.length ? (
                  product.variants.map((variant) => (
                    <s-button
                      key={variant.id}
                      variant={variant.id === activeVariant?.id ? "primary" : "secondary"}
                      onClick={() => setActiveVariantId(variant.id)}
                    >
                      {variant.sku || variant.title} - {variant.title}
                    </s-button>
                  ))
                ) : (
                  <s-paragraph>No variants found for this product.</s-paragraph>
                )}
              </s-stack>
            </s-box>
          </div>
        </s-stack>
      </s-section>

      <s-section>
        <Form method="post" action={`/app/products/${params.productId}`}>
          <input
            type="hidden"
            name="variantImageMap"
            value={JSON.stringify(variantImageMap)}
          />
          <s-button type="submit" variant="primary" loading={isSaving || undefined}>
            Save mapping
          </s-button>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
