ALTER TABLE "ProductSliderSetting" ADD COLUMN "hideThumbnails" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductSliderSetting" ADD COLUMN "hideZoomIcon" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductSliderSetting" ADD COLUMN "zoomIconPosition" TEXT NOT NULL DEFAULT 'top-right';
ALTER TABLE "ProductSliderSetting" ADD COLUMN "previousArrowSvg" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProductSliderSetting" ADD COLUMN "nextArrowSvg" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProductSliderSetting" ADD COLUMN "zoomIconSvg" TEXT NOT NULL DEFAULT '';
