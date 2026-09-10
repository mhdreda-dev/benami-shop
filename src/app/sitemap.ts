import type { MetadataRoute } from "next";
import { getStoreSettings } from "@/lib/storefront";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getStoreSettings();
  if (!settings.siteUrl) return [];
  const [products, categories] = await Promise.all([
    prisma.product.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    prisma.category.findMany({ where: { isActive: true, products: { some: { status: "PUBLISHED" } } }, select: { slug: true, updatedAt: true } }),
  ]);
  const staticRoutes = ["", "/shop", "/nouveautes", "/promotions"].map((route) => ({ url: `${settings.siteUrl}${route}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: route === "" ? 1 : 0.8 }));
  return [...staticRoutes, ...categories.map((category) => ({ url: `${settings.siteUrl}/categories/${category.slug}`, lastModified: category.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })), ...products.map((product) => ({ url: `${settings.siteUrl}/produits/${product.slug}`, lastModified: product.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 }))];
}
