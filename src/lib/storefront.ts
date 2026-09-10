import "server-only";

import type { Prisma } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const productCardSelect = {
  id: true, name: true, slug: true, price: true, oldPrice: true, isNew: true, isOnSale: true, isBestSeller: true,
  category: { select: { name: true } }, brand: { select: { name: true } },
  images: { orderBy: { order: "asc" }, take: 1, select: { url: true, alt: true } },
} satisfies Prisma.ProductSelect;

export type ProductCardData = Prisma.ProductGetPayload<{ select: typeof productCardSelect }>;

function safeHttpUrl(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
}

export const getStoreSettings = cache(async () => {
  const rows = await prisma.setting.findMany({ where: { key: { in: ["store_name", "whatsapp_number", "instagram_url", "store_address", "phone", "currency", "site_url"] } }, select: { key: true, value: true } });
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    storeName: values.store_name || "Ben Ami Shop",
    whatsapp: values.whatsapp_number?.replace(/\D/g, "") || "",
    instagram: safeHttpUrl(values.instagram_url),
    address: values.store_address || "",
    phone: values.phone || "",
    currency: values.currency || "MAD",
    siteUrl: safeHttpUrl(values.site_url),
  };
});

export const getPublishedProduct = cache(async (slug: string) => prisma.product.findFirst({
  where: { slug, status: "PUBLISHED" },
  include: { category: { select: { name: true, slug: true } }, brand: { select: { name: true } }, images: { orderBy: { order: "asc" } }, variants: { orderBy: [{ size: "asc" }, { color: "asc" }] } },
}));

export function discountPercent(price: number, oldPrice: number | null) {
  return oldPrice && oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : null;
}
