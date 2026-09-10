import Link from "next/link";
import { ProductCard } from "@/components/storefront/product-card";
import type { ProductCardData } from "@/lib/storefront";

export function ProductGrid({ products, currency, emptyTitle = "Aucun produit", emptyText = "Revenez bientôt pour découvrir notre sélection." }: { products: ProductCardData[]; currency: string; emptyTitle?: string; emptyText?: string }) {
  if (!products.length) return <div className="sf-empty"><span>BA</span><h2>{emptyTitle}</h2><p>{emptyText}</p><Link href="/shop">Voir toute la boutique</Link></div>;
  return <div className="sf-product-grid">{products.map((product) => <ProductCard key={product.id} product={product} currency={currency} />)}</div>;
}
