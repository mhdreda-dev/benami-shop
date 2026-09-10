import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { ProductGrid } from "@/components/storefront/product-grid";
import { getStoreSettings, productCardSelect } from "@/lib/storefront";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings();
  const canonical = settings.siteUrl ? `${settings.siteUrl}/shop` : undefined;
  return { title: "Boutique", description: "Parcourez les vêtements, chaussures, nouveautés et promotions disponibles chez Ben Ami Shop.", alternates: canonical ? { canonical } : undefined, openGraph: { title: "Boutique", url: canonical } };
}
const pageSize = 24;

export default async function ShopPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key].slice(0, 120) : "";
  const q = value("q").trim(), category = value("category"), brand = value("brand"), size = value("size"), sort = value("sort") || "newest";
  const sale = value("sale") === "1", isNew = value("new") === "1", featured = value("featured") === "1";
  const requestedPage = Number.parseInt(value("page") || "1", 10), page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const where: Prisma.ProductWhereInput = { status: "PUBLISHED", ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }, { brand: { name: { contains: q, mode: "insensitive" } } }, { category: { name: { contains: q, mode: "insensitive" } } }] } : {}), ...(category ? { category: { slug: category } } : {}), ...(brand ? { brand: { slug: brand } } : {}), ...(size ? { variants: { some: { size, stock: { gt: 0 } } } } : {}), ...(sale ? { isOnSale: true } : {}), ...(isNew ? { isNew: true } : {}), ...(featured ? { isFeatured: true } : {}) };
  const orderBy: Prisma.ProductOrderByWithRelationInput = sort === "price-asc" ? { price: "asc" } : sort === "price-desc" ? { price: "desc" } : sort === "name" ? { name: "asc" } : { createdAt: "desc" };
  const [products, total, categories, brands, sizes, settings] = await Promise.all([
    prisma.product.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: productCardSelect }), prisma.product.count({ where }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { name: true, slug: true } }), prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { name: true, slug: true } }),
    prisma.productVariant.findMany({ where: { stock: { gt: 0 }, product: { status: "PUBLISHED" } }, distinct: ["size"], orderBy: { size: "asc" }, select: { size: true } }), getStoreSettings(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const queryBase = { q: q || undefined, category: category || undefined, brand: brand || undefined, size: size || undefined, sale: sale ? "1" : undefined, new: isNew ? "1" : undefined, featured: featured ? "1" : undefined, sort };

  return <main id="main-content" className="storefront sf-catalog"><header className="sf-page-hero"><p>Ben Ami Shop</p><h1>La boutique</h1><span>Découvrez la sélection disponible, filtrez selon vos envies et commandez simplement via WhatsApp.</span></header>
    <section className="sf-catalog-body"><form className="sf-shop-filters"><div className="sf-filter-search"><label htmlFor="catalog-search">Rechercher</label><input id="catalog-search" type="search" name="q" defaultValue={q} placeholder="Nom, référence, marque…" /></div><label>Catégorie<select name="category" defaultValue={category}><option value="">Toutes</option>{categories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label><label>Marque<select name="brand" defaultValue={brand}><option value="">Toutes</option>{brands.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label><label>Taille<select name="size" defaultValue={size}><option value="">Toutes</option>{sizes.map((item) => <option key={item.size} value={item.size}>{item.size}</option>)}</select></label><label>Trier<select name="sort" defaultValue={sort}><option value="newest">Plus récents</option><option value="price-asc">Prix croissant</option><option value="price-desc">Prix décroissant</option><option value="name">Nom</option></select></label><div className="sf-checks"><label><input type="checkbox" name="new" value="1" defaultChecked={isNew} /> Nouveautés</label><label><input type="checkbox" name="sale" value="1" defaultChecked={sale} /> Promotions</label></div><button type="submit">Appliquer</button>{q || category || brand || size || sale || isNew || featured ? <Link href="/shop">Effacer</Link> : null}</form>
      <div className="sf-results"><div className="sf-results-head"><p><strong>{total}</strong> produit{total === 1 ? "" : "s"}</p></div><ProductGrid products={products} currency={settings.currency} emptyTitle="Aucun résultat" emptyText="Essayez de modifier vos filtres ou votre recherche." />{totalPages > 1 ? <nav className="sf-pagination" aria-label="Pagination">{page > 1 ? <Link href={{ query: { ...queryBase, page: page - 1 } }}>← Précédent</Link> : <span /> }<span>{page} / {totalPages}</span>{page < totalPages ? <Link href={{ query: { ...queryBase, page: page + 1 } }}>Suivant →</Link> : <span />}</nav> : null}</div>
    </section><span id="categories" />
  </main>;
}
