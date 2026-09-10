import Image from "next/image";
import Link from "next/link";
import { discountPercent, type ProductCardData } from "@/lib/storefront";

export function ProductCard({ product, currency = "MAD" }: { product: ProductCardData; currency?: string }) {
  const price = Number(product.price); const oldPrice = product.oldPrice ? Number(product.oldPrice) : null;
  const discount = product.isOnSale ? discountPercent(price, oldPrice) : null;
  return <article className="sf-product-card"><Link href={`/produits/${product.slug}`} aria-label={`Voir ${product.name}`}>
    <div className="sf-product-media">{product.images[0] ? <Image src={product.images[0].url} alt={product.images[0].alt || product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" /> : <div className="sf-image-fallback"><span>BA</span><small>Image à venir</small></div>}
      <div className="sf-badges">{product.isNew ? <span>Nouveau</span> : null}{discount ? <span className="sale">−{discount}%</span> : product.isOnSale ? <span className="sale">Promo</span> : null}{product.isBestSeller ? <span>Best-seller</span> : null}</div>
    </div><div className="sf-product-info"><p>{product.brand?.name || product.category.name}</p><h3>{product.name}</h3><div className="sf-price"><strong>{price.toFixed(2)} {currency}</strong>{oldPrice && oldPrice > price ? <del>{oldPrice.toFixed(2)} {currency}</del> : null}</div></div>
  </Link></article>;
}
