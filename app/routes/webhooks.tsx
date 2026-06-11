import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        await db.$transaction([
          db.productSliderSetting.deleteMany({ where: { shop } }),
          db.session.deleteMany({ where: { shop } }),
        ]);
      }
      break;
    case "SHOP_REDACT":
      await db.$transaction([
        db.productSliderSetting.deleteMany({ where: { shop } }),
        db.session.deleteMany({ where: { shop } }),
      ]);
      break;
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      break;
    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response();
};
