import type { Prisma, ProductStatus } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";

import { ArchiveProductButton } from "@/components/admin/archive-product-button";
import { ProductFilters } from "@/components/admin/product-filters";
import { StatusBadge } from "@/components/admin/status-badge";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const pageSize = 20;
const validStatuses = new Set<ProductStatus>(["DRAFT", "PUBLISHED", "ARCHIVED"]);

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const category = typeof params.category === "string" ? params.category : "";
  const brand = typeof params.brand === "string" ? params.brand : "";
  const statusInput = typeof params.status === "string" ? params.status : "";
  const status = validStatuses.has(statusInput as ProductStatus) ? statusInput as ProductStatus : undefined;
  const requestedPage = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const where: Prisma.ProductWhereInput = { ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { reference: { contains: query, mode: "insensitive" } }] } : {}), ...(category ? { categoryId: category } : {}), ...(brand ? { brandId: brand } : {}), ...(status ? { status } : {}) };
  const [products, total, categories, brands] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, name: true, reference: true, price: true, status: true, isNew: true, isFeatured: true, isBestSeller: true, isOnSale: true, category: { select: { name: true } }, brand: { select: { name: true } }, images: { orderBy: { order: "asc" }, take: 1, select: { url: true, alt: true } }, variants: { select: { stock: true } } } }),
    prisma.product.count({ where }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const notice = params.created === "1" ? "Produit créé avec succès." : params.updated === "1" ? "Produit mis à jour avec succès." : null;
  const filtered = Boolean(query || category || brand || status);

  return <div className="dashboard product-page">
    <header className="dashboard-heading"><div><p className="eyebrow">Catalogue</p><h1>Produits</h1></div><Link className="primary-action" href="/admin/products/new">＋ Nouveau produit</Link></header>
    {notice ? <div className="success-notice" role="status">{notice}</div> : null}
    <ProductFilters categories={categories} brands={brands} values={{ query, category, brand, status: status ?? "" }} />
    {products.length ? <section className="product-table-wrap" aria-label="Liste des produits"><table className="product-table"><thead><tr><th>Produit</th><th>Catégorie</th><th>Prix</th><th>Statut</th><th>Stock</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
      {products.map((product) => { const stock = product.variants.reduce((sum, variant) => sum + variant.stock, 0); const flags = [product.isNew && "New", product.isOnSale && "Sale", product.isFeatured && "Featured", product.isBestSeller && "Best-seller"].filter(Boolean); return <tr key={product.id}>
        <td><div className="product-identity"><div className="product-thumb">{product.images[0] ? <Image src={product.images[0].url} alt={product.images[0].alt || product.name} fill sizes="56px" /> : <span aria-hidden="true">BA</span>}</div><div><strong>{product.name}</strong><span>{product.reference}</span>{flags.length ? <small>{flags.join(" · ")}</small> : null}</div></div></td>
        <td><strong className="mobile-cell-label">Catégorie</strong>{product.category.name}<small>{product.brand?.name ?? "Sans marque"}</small></td><td><strong className="mobile-cell-label">Prix</strong>{product.price.toFixed(2)} MAD</td><td><strong className="mobile-cell-label">Statut</strong><StatusBadge status={product.status} /></td><td><strong className="mobile-cell-label">Stock</strong>{stock}</td><td><div className="table-actions"><Link className="table-action" href={`/admin/products/${product.id}/edit`}>Modifier</Link>{product.status !== "ARCHIVED" ? <ArchiveProductButton productId={product.id} productName={product.name} /> : null}</div></td>
      </tr>; })}
    </tbody></table>{totalPages > 1 ? <nav className="pagination" aria-label="Pagination"><span>Page {page} sur {totalPages}</span><div>{page > 1 ? <Link href={{ query: { q: query || undefined, category: category || undefined, brand: brand || undefined, status, page: page - 1 } }}>Précédent</Link> : null}{page < totalPages ? <Link href={{ query: { q: query || undefined, category: category || undefined, brand: brand || undefined, status, page: page + 1 } }}>Suivant</Link> : null}</div></nav> : null}</section>
    : <section className="dashboard-panel empty-panel"><span aria-hidden="true">＋</span><h2>{filtered ? "Aucun résultat" : "Votre catalogue est vide"}</h2><p>{filtered ? "Modifiez les filtres pour élargir votre recherche." : "Créez votre premier produit pour commencer à construire votre catalogue."}</p><Link className="primary-action" href="/admin/products/new">Créer un produit</Link></section>}
  </div>;
}
