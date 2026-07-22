"use strict";

(() => {
  const VERSION = "2026-06-12-tagged-variant-media-v1";
  const ROOT_SELECTOR = "[data-gallery-nest-slider]";
  const POSITION_CLASSES = [
    "gn-slider--left",
    "gn-slider--right",
    "gn-slider--top",
    "gn-slider--bottom",
  ];
  const GALLERY_SELECTORS = [
    ".product__media-wrapper",
    ".product__media-list",
    "product-media-gallery",
    "media-gallery",
    "[id^='MediaGallery-']",
    "[data-product-media-gallery]",
    ".product-media-container",
    ".product-gallery",
    ".product-gallery__media",
    ".product-single__media-group",
    ".product__photos",
    ".product__media",
  ];

  const STRINGS = {
    en: {
      galleryLabel: "Product image gallery",
      close: "Close gallery",
      prev: "Previous image",
      next: "Next image",
      viewImage: (n) => `View image ${n}`,
      openGallery: "Open image gallery",
      empty: "No product images found.",
    },
    es: {
      galleryLabel: "Galería de imágenes del producto",
      close: "Cerrar galería",
      prev: "Imagen anterior",
      next: "Imagen siguiente",
      viewImage: (n) => `Ver imagen ${n}`,
      openGallery: "Abrir galería de imágenes",
      empty: "No se encontraron imágenes del producto.",
    },
    it: {
      galleryLabel: "Galleria immagini prodotto",
      close: "Chiudi galleria",
      prev: "Immagine precedente",
      next: "Immagine successiva",
      viewImage: (n) => `Visualizza immagine ${n}`,
      openGallery: "Apri galleria immagini",
      empty: "Nessuna immagine del prodotto trovata.",
    },
    de: {
      galleryLabel: "Produktbildergalerie",
      close: "Galerie schließen",
      prev: "Vorheriges Bild",
      next: "Nächstes Bild",
      viewImage: (n) => `Bild ${n} ansehen`,
      openGallery: "Bildergalerie öffnen",
      empty: "Keine Produktbilder gefunden.",
    },
    fr: {
      galleryLabel: "Galerie d'images du produit",
      close: "Fermer la galerie",
      prev: "Image précédente",
      next: "Image suivante",
      viewImage: (n) => `Voir l'image ${n}`,
      openGallery: "Ouvrir la galerie d'images",
      empty: "Aucune image de produit trouvée.",
    },
  };

  const detectLang = () => {
    const raw = (document.documentElement.lang || "en").split("-")[0].toLowerCase();
    return STRINGS[raw] ? raw : "en";
  };

  const t = (key, ...args) => {
    const lang = detectLang();
    const value = STRINGS[lang]?.[key] ?? STRINGS.en[key];
    return typeof value === "function" ? value(...args) : value;
  };

  const parseJson = (root, selector) => {
    const node = root.querySelector(selector);
    if (!node?.textContent) return [];

    try {
      const parsed = JSON.parse(node.textContent);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const normalizeId = (id) => String(id || "").split("/").pop();

  const getMedia = (root) =>
    parseJson(root, "[data-gallery-nest-media]").filter((media) => media.src);

  const getVariants = (root) =>
    parseJson(root, "[data-gallery-nest-variants]").filter(
      (variant) => variant.id && variant.mediaId,
    );

  const sanitizeSvg = (svg) => {
    const value = String(svg || "").trim();
    if (!value.toLowerCase().startsWith("<svg")) return "";
    if (/<script|on\w+=|javascript:/i.test(value)) return "";
    return value;
  };

  const defaultIcon = (name) => {
    if (name === "prev") {
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.7 15.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4l4.6-4.6a1 1 0 1 1 1.4 1.4L8.8 10l3.9 3.9a1 1 0 0 1 0 1.4Z"/></svg>';
    }

    if (name === "next") {
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.3 4.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4l-4.6 4.6a1 1 0 1 1-1.4-1.4l3.9-3.9-3.9-3.9a1 1 0 0 1 0-1.4Z"/></svg>';
    }

    if (name === "close") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.64 4.22 12 10.59l6.36-6.37 1.42 1.42L13.41 12l6.37 6.36-1.42 1.42L12 13.41l-6.36 6.37-1.42-1.42L10.59 12 4.22 5.64l1.42-1.42Z"/></svg>';
    }

    return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 2.5a4.5 4.5 0 0 1 3.5 7.32l1.84 1.84a1 1 0 0 1-1.42 1.42L9.1 11.24A4.5 4.5 0 1 1 7 2.5Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm6.75 7.25a1 1 0 0 1 1-1H17a1 1 0 0 1 1 1V14a1 1 0 1 1-2 0v-.84l-2.54 2.55a1 1 0 0 1-1.42-1.42L14.6 11.75h-.85a1 1 0 0 1-1-1Z"/></svg>';
  };

  const icon = (name, customSvg) => sanitizeSvg(customSvg) || defaultIcon(name);

  const normalizeImageUrl = (src) => {
    try {
      return new URL(src, window.location.origin).pathname.replace(
        /_(\d+x|pico|icon|thumb|small|compact|medium|large|grande|master)(?=\.)/,
        "",
      );
    } catch {
      return src;
    }
  };

  const galleryHost = (node) =>
    node.closest(".product__media-wrapper") ||
    node.closest(".product-gallery") ||
    node.closest(".product-single__media-group") ||
    node;

  const findNativeGallery = (root, media) => {
    const nativeGallery = GALLERY_SELECTORS.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)),
    )
      .filter((node) => node && !node.contains(root) && node !== root)
      .map(galleryHost)
      .find((node, index, nodes) => node && nodes.indexOf(node) === index);

    if (nativeGallery) return nativeGallery;

    const mediaUrls = new Set(
      media.flatMap((item) => [item.thumb, item.src, item.zoom]).filter(Boolean).map(
        normalizeImageUrl,
      ),
    );

    if (!mediaUrls.size) return null;

    return Array.from(document.images)
      .filter((image) => !root.contains(image))
      .filter((image) => mediaUrls.has(normalizeImageUrl(image.currentSrc || image.src)))
      .map(
        (image) =>
          image.closest(
            ".product__media-wrapper, product-media-gallery, media-gallery, .product-gallery, .product__photos, .product-single__media-group",
          ) ||
          image.closest(".shopify-section") ||
          image.parentElement,
      )
      .find(Boolean);
  };

  const replaceNativeGallery = (root, media) => {
    const host = findNativeGallery(root, media);
    if (!host) return;

    host.prepend(root);
    host.classList.add("gn-slider-host");
    host.removeAttribute("hidden");
    host.style.removeProperty("display");
    host.dataset.galleryNestHidden = "true";
  };

  const currentVariantId = () => {
    const urlVariant = new URL(window.location.href).searchParams.get("variant");
    if (urlVariant) return urlVariant;

    const input = document.querySelector(
      'form[action*="/cart/add"] [name="id"], product-form [name="id"], [name="id"]',
    );
    return input?.value || input?.getAttribute("value") || null;
  };

  const mediaForVariant = (media, variantId, variantImageMap) => {
    if (!variantId) return media;

    const safeVariantImageMap =
      variantImageMap && typeof variantImageMap === "object" ? variantImageMap : {};
    const normalizedVariantId = normalizeId(variantId);
    const mappedIds =
      safeVariantImageMap[String(variantId)] ||
      safeVariantImageMap[normalizedVariantId] ||
      Object.entries(safeVariantImageMap).find(
        ([mapVariantId]) => normalizeId(mapVariantId) === normalizedVariantId,
      )?.[1];

    if (Array.isArray(mappedIds)) {
      const selectedIds = new Set(mappedIds.map(normalizeId));
      const mappedMedia = media.filter((item) => selectedIds.has(normalizeId(item.id)));
      if (mappedMedia.length) return mappedMedia;
    }

    const taggedMedia = media.filter((item) =>
      (item.variantIds || []).map(normalizeId).includes(normalizedVariantId),
    );

    return taggedMedia.length ? taggedMedia : media;
  };

  const openLightbox = (media, startIndex, settings) => {
    let activeIndex = startIndex;
    const lightbox = document.createElement("div");
    lightbox.className = "gn-lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", t("galleryLabel"));
    lightbox.innerHTML = `
      <div class="gn-lightbox__bar">
        <span class="gn-lightbox__counter"></span>
        <button class="gn-lightbox__close" type="button" aria-label="${t("close")}">${defaultIcon("close")}</button>
      </div>
      <div class="gn-lightbox__viewer">
        ${
          media.length > 1
            ? `<button class="gn-lightbox__nav gn-lightbox__nav--prev" type="button" aria-label="${t("prev")}">${icon("prev", settings.previousArrowSvg)}</button>`
            : ""
        }
        <img class="gn-lightbox__image" alt="">
        ${
          media.length > 1
            ? `<button class="gn-lightbox__nav gn-lightbox__nav--next" type="button" aria-label="${t("next")}">${icon("next", settings.nextArrowSvg)}</button>`
            : ""
        }
      </div>
      <div class="gn-lightbox__thumbs" role="list"></div>
    `;

    const counter = lightbox.querySelector(".gn-lightbox__counter");
    const image = lightbox.querySelector(".gn-lightbox__image");
    const close = lightbox.querySelector(".gn-lightbox__close");
    const prev = lightbox.querySelector(".gn-lightbox__nav--prev");
    const next = lightbox.querySelector(".gn-lightbox__nav--next");
    const thumbs = lightbox.querySelector(".gn-lightbox__thumbs");
    const previousOverflow = document.documentElement.style.overflow;

    const setActive = (index) => {
      activeIndex = (index + media.length) % media.length;
      const item = media[activeIndex];
      image.src = item.zoom || item.src;
      image.alt = item.alt || "";
      counter.textContent = `${activeIndex + 1} / ${media.length}`;
      thumbs.querySelectorAll(".gn-lightbox__thumb").forEach((thumb, thumbIndex) => {
        thumb.setAttribute("aria-current", String(thumbIndex === activeIndex));
      });
    };

    const closeLightbox = () => {
      document.removeEventListener("keydown", onKeydown);
      document.documentElement.style.overflow = previousOverflow;
      lightbox.remove();
    };

    const onKeydown = (event) => {
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft" && media.length > 1) setActive(activeIndex - 1);
      if (event.key === "ArrowRight" && media.length > 1) setActive(activeIndex + 1);
    };

    media.forEach((item, index) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "gn-lightbox__thumb";
      thumb.setAttribute("aria-label", t("viewImage", index + 1));
      thumb.innerHTML = `<img src="${item.thumb || item.src}" alt="">`;
      thumb.addEventListener("click", () => setActive(index));
      thumbs.append(thumb);
    });

    close.addEventListener("click", closeLightbox);
    prev?.addEventListener("click", () => setActive(activeIndex - 1));
    next?.addEventListener("click", () => setActive(activeIndex + 1));
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener("keydown", onKeydown);
    document.documentElement.style.overflow = "hidden";
    document.body.append(lightbox);
    setActive(activeIndex);
    close.focus();
  };

  const renderSlider = (root, allMedia, position, settings) => {
    let activeIndex = 0;
    let visibleMedia = allMedia;
    const safePosition = ["left", "right", "top", "bottom"].includes(position)
      ? position
      : "left";
    const zoomPosition = [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ].includes(settings.zoomIconPosition)
      ? settings.zoomIconPosition
      : "top-right";
    const hideThumbnails = !!settings.hideThumbnails;
    const hideZoomIcon = !!settings.hideZoomIcon;
    const thumbnailSize = Math.min(Math.max(Number(settings.thumbnailSize || 76), 48), 140);

    root.classList.add("gn-slider", `gn-slider--${safePosition}`);
    root.classList.toggle("gn-slider--single", hideThumbnails);
    root.style.setProperty("--gn-thumb-size", `${thumbnailSize}px`);
    root.classList.remove(
      ...POSITION_CLASSES.filter((className) => className !== `gn-slider--${safePosition}`),
    );

    if (!allMedia.length) {
      root.innerHTML = `<div class="gn-slider__empty">${t("empty")}</div>`;
      root.hidden = false;
      return;
    }

    root.innerHTML = `
      <div class="gn-slider__thumbs" role="list"></div>
      <div class="gn-slider__stage">
        ${
          hideZoomIcon
            ? ""
            : `<button class="gn-slider__zoom-icon gn-slider__zoom-icon--${zoomPosition}" type="button" aria-label="${t("openGallery")}">${icon("zoom", settings.zoomIconSvg)}</button>`
        }
        <img class="gn-slider__main" alt="">
      </div>
    `;

    const stage = root.querySelector(".gn-slider__stage");
    const main = root.querySelector(".gn-slider__main");
    const thumbs = root.querySelector(".gn-slider__thumbs");
    const zoom = root.querySelector(".gn-slider__zoom-icon");

    const rebuildNavigation = () => {
      root.querySelectorAll(".gn-slider__button").forEach((button) => button.remove());
      if (visibleMedia.length <= 1) return;

      const prev = document.createElement("button");
      prev.type = "button";
      prev.className = "gn-slider__button gn-slider__button--prev";
      prev.setAttribute("aria-label", t("prev"));
      prev.innerHTML = icon("prev", settings.previousArrowSvg);
      prev.addEventListener("click", () => setActive(activeIndex - 1));

      const next = document.createElement("button");
      next.type = "button";
      next.className = "gn-slider__button gn-slider__button--next";
      next.setAttribute("aria-label", t("next"));
      next.innerHTML = icon("next", settings.nextArrowSvg);
      next.addEventListener("click", () => setActive(activeIndex + 1));

      stage.append(prev, next);
    };

    const rebuildThumbs = () => {
      thumbs.innerHTML = "";
      if (hideThumbnails) return;

      visibleMedia.forEach((item, index) => {
        const thumb = document.createElement("button");
        thumb.type = "button";
        thumb.className = "gn-slider__thumb";
        thumb.setAttribute("aria-label", t("viewImage", index + 1));
        thumb.innerHTML = `<img src="${item.thumb || item.src}" alt="">`;
        thumb.addEventListener("click", () => setActive(index));
        thumbs.append(thumb);
      });
    };

    const setActive = (index) => {
      activeIndex = (index + visibleMedia.length) % visibleMedia.length;
      const item = visibleMedia[activeIndex];
      main.src = item.zoom || item.src;
      main.alt = item.alt || "";
      stage.classList.remove("is-zooming");
      main.style.transformOrigin = "center";
      thumbs.querySelectorAll(".gn-slider__thumb").forEach((thumb, thumbIndex) => {
        thumb.setAttribute("aria-current", String(thumbIndex === activeIndex));
      });
    };

    const renderForVariant = (variantId) => {
      const variantMedia = mediaForVariant(allMedia, variantId, settings.variantImageMap);
      const variantFirstIndex = allMedia.findIndex(
        (item) => String(item.id) === String(variantMedia[0]?.id),
      );
      if (variantFirstIndex >= 0) setActive(variantFirstIndex);
    };

    stage.addEventListener("mousemove", (event) => {
      const rect = stage.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      main.style.transformOrigin = `${x}% ${y}%`;
    });
    stage.addEventListener("mouseenter", () => stage.classList.add("is-zooming"));
    stage.addEventListener("mouseleave", () => {
      stage.classList.remove("is-zooming");
      main.style.transformOrigin = "center";
    });
    zoom?.addEventListener("click", (event) => {
      event.stopPropagation();
      const lightboxMedia = mediaForVariant(
        allMedia,
        currentVariantId(),
        settings.variantImageMap,
      );
      const lightboxStartIndex = Math.max(
        0,
        lightboxMedia.findIndex(
          (item) => String(item.id) === String(visibleMedia[activeIndex]?.id),
        ),
      );
      openLightbox(lightboxMedia, lightboxStartIndex, settings);
    });

    if (settings.syncVariantImages) {
      wireVariantChanges(renderForVariant);
    }

    rebuildThumbs();
    rebuildNavigation();
    setActive(0);
    if (settings.syncVariantImages) {
      renderForVariant(currentVariantId());
    }
    root.hidden = false;
  };

  const wireVariantChanges = (renderForVariant) => {
    const update = (variantId) => window.requestAnimationFrame(() => renderForVariant(variantId));

    document.addEventListener("change", (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.matches('form[action*="/cart/add"] select, form[action*="/cart/add"] input') ||
          target.closest("variant-selects, variant-radios, product-form"))
      ) {
        update(currentVariantId());
      }
    });

    ["variant:change", "variantChange", "product:variant-change"].forEach((eventName) => {
      document.addEventListener(eventName, (event) => {
        update(event.detail?.variant?.id || event.detail?.variantId || currentVariantId());
      });
    });

    ["pushState", "replaceState"].forEach((method) => {
      const original = window.history[method];
      if (!original || original.galleryNestWrapped) return;

      window.history[method] = function (...args) {
        const result = original.apply(this, args);
        window.dispatchEvent(new Event("gallery-nest:url-change"));
        return result;
      };
      window.history[method].galleryNestWrapped = true;
    });

    window.addEventListener("popstate", () => update(currentVariantId()));
    window.addEventListener("gallery-nest:url-change", () => update(currentVariantId()));
  };

  const init = async (root) => {
    if (root.dataset.galleryNestReady === "true") return;

    root.dataset.galleryNestReady = "true";
    root.dataset.galleryNestVersion = VERSION;

    const media = getMedia(root);
    const variants = getVariants(root);
    const mediaWithFallbackVariantIds = media.map((item) => ({
      ...item,
      variantIds:
        item.variantIds?.length > 0
          ? item.variantIds
          : variants
              .filter((variant) => String(variant.mediaId) === String(item.id))
              .map((variant) => variant.id),
    }));
    const productId = root.dataset.productId;
    const appProxyPath = root.dataset.appProxyPath || "/apps/gallery-nest/slider-settings";
    const hasOnlyDefaultVariant = root.dataset.hasOnlyDefaultVariant === "true";

    if (!productId) return;

    try {
      const response = await fetch(`${appProxyPath}?product_id=${encodeURIComponent(productId)}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;

      const settings = await response.json();
      if (!settings.enabled) return;

      const finalSettings = {
        ...settings,
        hideThumbnails: hasOnlyDefaultVariant || settings.hideThumbnails,
      };

      replaceNativeGallery(root, mediaWithFallbackVariantIds);
      renderSlider(root, mediaWithFallbackVariantIds, settings.thumbnailPosition, finalSettings);
    } catch {
      root.dataset.galleryNestReady = "false";
    }
  };

  const initAll = () => {
    document.querySelectorAll(ROOT_SELECTOR).forEach(init);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
