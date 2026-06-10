(() => {
  const VERSION = "2026-06-10-variant-sync-v4";
  const SELECTOR = "[data-gallery-nest-slider]";
  const POSITION_CLASSES = [
    "gn-slider--left",
    "gn-slider--right",
    "gn-slider--top",
    "gn-slider--bottom",
  ];
  const NATIVE_GALLERY_SELECTORS = [
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

  const parseMedia = (root) => {
    const script = root.querySelector("[data-gallery-nest-media]");
    if (!script?.textContent) return [];

    try {
      const media = JSON.parse(script.textContent);
      return Array.isArray(media) ? media.filter((item) => item.src) : [];
    } catch {
      return [];
    }
  };

  const parseVariantMedia = (root) => {
    const script = root.querySelector("[data-gallery-nest-variants]");
    if (!script?.textContent) return [];

    try {
      const variants = JSON.parse(script.textContent);
      return Array.isArray(variants)
        ? variants.filter((variant) => variant.id && variant.mediaId)
        : [];
    } catch {
      return [];
    }
  };

  const safeSvg = (svg) => {
    const trimmedSvg = String(svg || "").trim();

    if (!trimmedSvg.toLowerCase().startsWith("<svg")) return "";
    if (/<script|on\w+=|javascript:/i.test(trimmedSvg)) return "";

    return trimmedSvg;
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

  const icon = (name, customSvg) => safeSvg(customSvg) || defaultIcon(name);

  const getHideTarget = (element) =>
    element.closest(".product__media-wrapper") ||
    element.closest(".product-gallery") ||
    element.closest(".product-single__media-group") ||
    element;

  const findNativeGalleryBySelector = (root) =>
    NATIVE_GALLERY_SELECTORS.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)),
    )
      .filter((element) => element && !element.contains(root) && element !== root)
      .map(getHideTarget)
      .find((element, index, elements) => element && elements.indexOf(element) === index);

  const normalizeImageUrl = (url) => {
    try {
      const parsedUrl = new URL(url, window.location.origin);
      return parsedUrl.pathname.replace(/_(\d+x|pico|icon|thumb|small|compact|medium|large|grande|master)(?=\.)/, "");
    } catch {
      return url;
    }
  };

  const findNativeGalleryByImages = (root, media) => {
    const mediaPaths = new Set(
      media
        .flatMap((item) => [item.thumb, item.src, item.zoom])
        .filter(Boolean)
        .map(normalizeImageUrl),
    );

    if (!mediaPaths.size) return null;

    return Array.from(document.images)
      .filter((image) => !root.contains(image))
      .filter((image) => mediaPaths.has(normalizeImageUrl(image.currentSrc || image.src)))
      .map((image) =>
        image.closest(".product__media-wrapper, product-media-gallery, media-gallery, .product-gallery, .product__photos, .product-single__media-group") ||
        image.closest(".shopify-section") ||
        image.parentElement,
      )
      .find(Boolean);
  };

  const hideNativeGallery = (root, media) => {
    const nativeGallery =
      findNativeGalleryBySelector(root) || findNativeGalleryByImages(root, media);

    if (!nativeGallery) return;

    nativeGallery.prepend(root);
    nativeGallery.classList.add("gn-slider-host");
    nativeGallery.removeAttribute("hidden");
    nativeGallery.style.removeProperty("display");
    nativeGallery.dataset.galleryNestHidden = "true";
  };

  const openLightbox = (media, initialIndex, controls) => {
    let activeIndex = initialIndex;
    const modal = document.createElement("div");
    modal.className = "gn-lightbox";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Product image gallery");
    modal.innerHTML = `
      <div class="gn-lightbox__bar">
        <span class="gn-lightbox__counter"></span>
        <button class="gn-lightbox__close" type="button" aria-label="Close gallery">${defaultIcon("close")}</button>
      </div>
      <div class="gn-lightbox__viewer">
        <button class="gn-lightbox__nav gn-lightbox__nav--prev" type="button" aria-label="Previous image">${icon("prev", controls.previousArrowSvg)}</button>
        <img class="gn-lightbox__image" alt="">
        <button class="gn-lightbox__nav gn-lightbox__nav--next" type="button" aria-label="Next image">${icon("next", controls.nextArrowSvg)}</button>
      </div>
      <div class="gn-lightbox__thumbs" role="list"></div>
    `;

    const counter = modal.querySelector(".gn-lightbox__counter");
    const image = modal.querySelector(".gn-lightbox__image");
    const closeButton = modal.querySelector(".gn-lightbox__close");
    const prevButton = modal.querySelector(".gn-lightbox__nav--prev");
    const nextButton = modal.querySelector(".gn-lightbox__nav--next");
    const thumbs = modal.querySelector(".gn-lightbox__thumbs");
    const previousOverflow = document.documentElement.style.overflow;

    const update = (index) => {
      activeIndex = (index + media.length) % media.length;
      const activeImage = media[activeIndex];
      image.src = activeImage.zoom || activeImage.src;
      image.alt = activeImage.alt || "";
      counter.textContent = `${activeIndex + 1} / ${media.length}`;
      thumbs.querySelectorAll(".gn-lightbox__thumb").forEach((button, buttonIndex) => {
        button.setAttribute("aria-current", String(buttonIndex === activeIndex));
      });
    };

    const close = () => {
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = previousOverflow;
      modal.remove();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") update(activeIndex - 1);
      if (event.key === "ArrowRight") update(activeIndex + 1);
    };

    media.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gn-lightbox__thumb";
      button.setAttribute("aria-label", `View image ${index + 1}`);
      button.innerHTML = `<img src="${item.thumb || item.src}" alt="">`;
      button.addEventListener("click", () => update(index));
      thumbs.append(button);
    });

    closeButton.addEventListener("click", close);
    prevButton.addEventListener("click", () => update(activeIndex - 1));
    nextButton.addEventListener("click", () => update(activeIndex + 1));
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
    document.addEventListener("keydown", onKeyDown);
    document.documentElement.style.overflow = "hidden";
    document.body.append(modal);
    update(activeIndex);
    closeButton.focus();
  };

  const renderSlider = (root, media, position, options) => {
    let activeIndex = 0;
    const safePosition = ["left", "right", "top", "bottom"].includes(position)
      ? position
      : "left";
    const safeZoomPosition = ["top-left", "top-right", "bottom-left", "bottom-right"].includes(
      options.zoomIconPosition,
    )
      ? options.zoomIconPosition
      : "top-right";
    const hideThumbnails = Boolean(options.hideThumbnails);
    const hideZoomIcon = Boolean(options.hideZoomIcon);
    const thumbnailSize = Number(options.thumbnailSize || 76);
    const safeThumbnailSize = Math.min(Math.max(thumbnailSize, 48), 140);

    root.classList.add("gn-slider", `gn-slider--${safePosition}`);
    root.classList.toggle("gn-slider--single", hideThumbnails);
    root.style.setProperty("--gn-thumb-size", `${safeThumbnailSize}px`);
    root.classList.remove(
      ...POSITION_CLASSES.filter((className) => className !== `gn-slider--${safePosition}`),
    );

    if (!media.length) {
      root.innerHTML = '<div class="gn-slider__empty">No product images found.</div>';
      root.hidden = false;
      return;
    }

    root.innerHTML = `
      <div class="gn-slider__thumbs" role="list"></div>
      <div class="gn-slider__stage">
        ${
          hideZoomIcon
            ? ""
            : `<button class="gn-slider__zoom-icon gn-slider__zoom-icon--${safeZoomPosition}" type="button" aria-label="Open image gallery">${icon("zoom", options.zoomIconSvg)}</button>`
        }
        <button class="gn-slider__button gn-slider__button--prev" type="button" aria-label="Previous image">${icon("prev", options.previousArrowSvg)}</button>
        <img class="gn-slider__main" alt="">
        <button class="gn-slider__button gn-slider__button--next" type="button" aria-label="Next image">${icon("next", options.nextArrowSvg)}</button>
      </div>
    `;

    const stage = root.querySelector(".gn-slider__stage");
    const mainImage = root.querySelector(".gn-slider__main");
    const thumbs = root.querySelector(".gn-slider__thumbs");
    const prevButton = root.querySelector(".gn-slider__button--prev");
    const nextButton = root.querySelector(".gn-slider__button--next");
    const zoomButton = root.querySelector(".gn-slider__zoom-icon");

    const setZoomOrigin = (event) => {
      const rect = stage.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      mainImage.style.transformOrigin = `${x}% ${y}%`;
    };

    const update = (index) => {
      activeIndex = (index + media.length) % media.length;
      const image = media[activeIndex];
      mainImage.src = image.zoom || image.src;
      mainImage.alt = image.alt || "";
      stage.classList.remove("is-zooming");
      mainImage.style.transformOrigin = "center";

      thumbs.querySelectorAll(".gn-slider__thumb").forEach((button, buttonIndex) => {
        button.setAttribute("aria-current", String(buttonIndex === activeIndex));
      });
    };

    if (!hideThumbnails) {
      media.forEach((image, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gn-slider__thumb";
        button.setAttribute("aria-label", `View image ${index + 1}`);
        button.innerHTML = `<img src="${image.thumb || image.src}" alt="">`;
        button.addEventListener("click", () => update(index));
        thumbs.append(button);
      });
    }

    prevButton.addEventListener("click", () => update(activeIndex - 1));
    nextButton.addEventListener("click", () => update(activeIndex + 1));

    if (zoomButton) {
      zoomButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openLightbox(media, activeIndex, options);
      });
    } else {
      stage.addEventListener("mousemove", setZoomOrigin);
      stage.addEventListener("mouseenter", () => stage.classList.add("is-zooming"));
      stage.addEventListener("mouseleave", () => {
        stage.classList.remove("is-zooming");
        mainImage.style.transformOrigin = "center";
      });
    }

    update(0);

    if (options.syncVariantImages) {
      bindVariantImageSync(root, media, update);
    }

    root.hidden = false;
  };

  const getCurrentVariantId = () => {
    const urlVariant = new URL(window.location.href).searchParams.get("variant");
    if (urlVariant) return urlVariant;

    const variantInput = document.querySelector(
      'form[action*="/cart/add"] [name="id"], product-form [name="id"], [name="id"]',
    );

    return variantInput?.value || variantInput?.getAttribute("value") || null;
  };

  const bindVariantImageSync = (root, media, update) => {
    const syncToVariant = (variantId) => {
      if (!variantId) return;

      const variantMediaIndex = media.findIndex((item) =>
        (item.variantIds || []).map(String).includes(String(variantId)),
      );

      if (variantMediaIndex >= 0) update(variantMediaIndex);
    };

    const scheduleSync = (variantId) => {
      window.requestAnimationFrame(() => syncToVariant(variantId || getCurrentVariantId()));
    };

    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      if (
        target.matches('form[action*="/cart/add"] select, form[action*="/cart/add"] input') ||
        target.closest("variant-selects, variant-radios, product-form")
      ) {
        scheduleSync(getCurrentVariantId());
      }
    });

    ["variant:change", "variantChange", "product:variant-change"].forEach((eventName) => {
      document.addEventListener(eventName, (event) => {
        scheduleSync(event.detail?.variant?.id || event.detail?.variantId);
      });
    });

    ["pushState", "replaceState"].forEach((methodName) => {
      const originalMethod = window.history[methodName];
      if (originalMethod?.galleryNestWrapped) return;

      window.history[methodName] = function patchedHistoryMethod(...args) {
        const result = originalMethod.apply(this, args);
        window.dispatchEvent(new Event("gallery-nest:url-change"));
        return result;
      };
      window.history[methodName].galleryNestWrapped = true;
    });

    window.addEventListener("popstate", () => scheduleSync());
    window.addEventListener("gallery-nest:url-change", () => scheduleSync());
    scheduleSync();
  };

  const init = async (root) => {
    if (root.dataset.galleryNestReady === "true") return;
    root.dataset.galleryNestReady = "true";
    root.dataset.galleryNestVersion = VERSION;

    const variantMedia = parseVariantMedia(root);
    const media = parseMedia(root).map((item) => ({
      ...item,
      variantIds: variantMedia
        .filter((variant) => String(variant.mediaId) === String(item.id))
        .map((variant) => variant.id),
    }));
    const productId = root.dataset.productId;
    const proxyPath = root.dataset.appProxyPath || "/apps/gallery-nest/slider-settings";

    if (!productId) return;

    try {
      const response = await fetch(`${proxyPath}?product_id=${encodeURIComponent(productId)}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;

      const settings = await response.json();
      if (!settings.enabled) return;

      hideNativeGallery(root, media);
      renderSlider(root, media, settings.thumbnailPosition, settings);
    } catch {
      root.dataset.galleryNestReady = "false";
    }
  };

  const initAll = () => {
    document.querySelectorAll(SELECTOR).forEach(init);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
