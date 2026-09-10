import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/storefront/product-card";
import { ProductExperience } from "@/components/storefront/product-experience";
import { getPublishedProduct, getStoreSettings, productCardSelect } from "@/lib/storefront";
import { prisma } from "@/lib/prisma";

export async function generateMetadata({ params }: PageProps<"/produits/[slug]">): Promise<Metadata> {
  const { slug } = await params; const [product, settings] = await Promise.all([getPublishedProduct(slug), getStoreSettings()]); if (!product) return {};
  const description = product.description.slice(0, 155); const canonical = settings.siteUrl ? `${settings.siteUrl}/produits/${product.slug}` : undefined;
  return { title: product.name, description, alternates: canonical ? { canonical } : undefined, openGraph: { title: product.name, description, type: "website", url: canonical, images: product.images[0] ? [{ url: product.images[0].url, alt: product.images[0].alt || product.name }] : undefined } };
}

export default async function ProductPage({ params }: PageProps<"/produits/[slug]">) {
  const { slug } = await params; const [product, settings] = await Promise.all([getPublishedProduct(slug), getStoreSettings()]); if (!product) notFound();
  const related = await prisma.product.findMany({ where: { status: "PUBLISHED", id: { not: product.id }, OR: [{ categoryId: product.categoryId }, ...(product.brandId ? [{ brandId: product.brandId }] : [])] }, orderBy: { createdAt: "desc" }, take: 4, select: productCardSelect });
  const price = product.price.toString(), oldPrice = product.oldPrice?.toString(); const inStock = product.variants.some((variant) => variant.stock > 0); const canonical = settings.siteUrl ? `${settings.siteUrl}/produits/${product.slug}` : "";
  const jsonLd = { "@context": "https://schema.org", "@type": "Product", name: product.name, image: product.images.map((image) => image.url), description: product.description, sku: product.reference, ...(product.brand ? { brand: { "@type": "Brand", name: product.brand.name } } : {}), offers: { "@type": "Offer", price, priceCurrency: settings.currency, availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", ...(canonical ? { url: canonical } : {}) } };
  return <main id="main-content" className="storefront sf-product-page"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /><nav className="sf-breadcrumb" aria-label="Fil d’Ariane"><Link href="/">Accueil</Link><span>/</span><Link href="/shop">Boutique</Link><span>/</span><Link href={`/categories/${product.category.slug}`}>{product.category.name}</Link></nav><section className="sf-product-detail"><ProductExperience images={product.images.map(({ id, url, alt }) => ({ id, url, alt }))} variants={product.variants.map(({ id, size, color, stock }) => ({ id, size, color, stock }))} product={{ name: product.name, reference: product.reference, price, color: product.color }} whatsapp={settings.whatsapp} currency={settings.currency} configuredUrl={canonical} /><div className="sf-product-copy"><p>{product.brand?.name || product.category.name}</p><h1>{product.name}</h1><span className="sf-reference">Réf. {product.reference}</span><div className="sf-detail-price"><strong>{Number(price).toFixed(2)} {settings.currency}</strong>{oldPrice && Number(oldPrice) > Number(price) ? <del>{Number(oldPrice).toFixed(2)} {settings.currency}</del> : null}</div><div className="sf-description">{product.description}</div>{product.color ? <p className="sf-color"><strong>Couleur</strong> {product.color}</p> : null}</div></section>{related.length ? <section className="sf-section sf-related"><div className="sf-section-heading"><div><p>À découvrir aussi</p><h2>Produits similaires</h2></div></div><div className="sf-product-row">{related.map((item) => <ProductCard key={item.id} product={item} currency={settings.currency} />)}</div></section> : null}</main>;
}
