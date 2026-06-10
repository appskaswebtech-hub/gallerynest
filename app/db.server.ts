import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

const hasCurrentSchema = (client: PrismaClient | undefined) => {
  const productSliderFields = (
    client as
      | (PrismaClient & {
          _runtimeDataModel?: {
            models?: {
              ProductSliderSetting?: {
                fields?: Array<{ name: string }>;
              };
            };
          };
        })
      | undefined
  )?._runtimeDataModel?.models?.ProductSliderSetting?.fields;

  return Boolean(
    client &&
      "productSliderSetting" in client &&
      typeof client.productSliderSetting?.findUnique === "function" &&
      productSliderFields?.some((field) => field.name === "thumbnailSize"),
  );
};

if (process.env.NODE_ENV !== "production") {
  if (!hasCurrentSchema(global.prismaGlobal)) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
