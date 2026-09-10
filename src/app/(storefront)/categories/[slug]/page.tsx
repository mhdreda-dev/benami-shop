import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/storefront/product-grid";
import { getStoreSettings, productCardSelect } from "@/lib/storefront";
import { prisma } from "@/lib/prisma";

export async function generateMetadata({ params }: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params; const [category, settings] = await Promise.all([prisma.category.findFirst({ where: { slug, isActive: true }, select: { name: true } }), getStoreSettings()]);
  if (!category) return {};
  const canonical = settings.siteUrl ? `${settings.siteUrl}/categories/${slug}` : undefined;
  return { title: category.name, description: `Découvrez les produits ${category.name} disponibles chez Ben Ami Shop.`, alternates: canonical ? { canonical } : undefined, openGraph: { title: category.name, url: canonical } };
}

export default async function CategoryPage({ params }: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const [category, settings] = await Promise.all([prisma.category.findFirst({ where: { slug, isActive: true }, select: { name: true, description: true, products: { where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, select: productCardSelect } } }), getStoreSettings()]);
  if (!category) notFound();
  return <main id="main-content" className="storefront sf-collection"><header className="sf-page-hero"><p>Collection</p><h1>{category.name}</h1><span>{category.description || `Découvrez notre sélection ${category.name.toLocaleLowerCase("fr")}.`}</span></header><section className="sf-section"><ProductGrid products={category.products} currency={settings.currency} emptyTitle="Cette catégorie est encore vide" /></section></main>;
}
