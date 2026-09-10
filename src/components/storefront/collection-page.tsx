import type { Prisma } from "@prisma/client";
import { ProductGrid } from "@/components/storefront/product-grid";
import { prisma } from "@/lib/prisma";
import { getStoreSettings, productCardSelect } from "@/lib/storefront";

export async function CollectionPage({ eyebrow, title, description, where, empty }: { eyebrow: string; title: string; description: string; where: Prisma.ProductWhereInput; empty: string }) {
  const [products, settings] = await Promise.all([prisma.product.findMany({ where: { ...where, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, select: productCardSelect }), getStoreSettings()]);
  return <main id="main-content" className="storefront sf-collection"><header className="sf-page-hero"><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></header><section className="sf-section"><ProductGrid products={products} currency={settings.currency} emptyTitle={empty} /></section></main>;
}
