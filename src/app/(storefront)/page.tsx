import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/storefront/product-card";
import { getHomepageSections, type HomepageSectionKey } from "@/lib/homepage";
import { getStoreSettings, productCardSelect, type ProductCardData } from "@/lib/storefront";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings();
  const description = "Découvrez la sélection Ben Ami Shop : vêtements, chaussures, nouveautés et promotions.";
  return { title: "Ben Ami Shop — Mode et chaussures", description, alternates: settings.siteUrl ? { canonical: settings.siteUrl } : undefined, openGraph: { title: "Ben Ami Shop — Mode et chaussures", description, url: settings.siteUrl || undefined } };
}

function ProductSection({ title, eyebrow, products, currency, href, ctaLabel }: { title: string; eyebrow: string; products: ProductCardData[]; currency: string; href: string; ctaLabel: string }) {
  if (!products.length) return null;
  return <section className="sf-section"><div className="sf-section-heading"><div><p>{eyebrow}</p><h2>{title}</h2></div>{href && ctaLabel ? <Link href={href}>{ctaLabel} <span>→</span></Link> : null}</div><div className="sf-product-row">{products.map((product) => <ProductCard key={product.id} product={product} currency={currency} />)}</div></section>;
}

export default async function HomePage() {
  const [settings, sections, [categories, curatedProducts]] = await Promise.all([getStoreSettings(), getHomepageSections(), prisma.$transaction([
    prisma.category.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { name: "asc" }], take: 8, select: { id: true, name: true, slug: true, image: true } }),
    prisma.product.findMany({ where: { status: "PUBLISHED", OR: [{ isNew: true }, { isFeatured: true }, { isBestSeller: true }, { isOnSale: true }] }, orderBy: { createdAt: "desc" }, take: 20, select: { ...productCardSelect, isFeatured: true } }),
  ])]);
  const newProducts = curatedProducts.filter((product) => product.isNew).slice(0, 4);
  const featured = curatedProducts.filter((product) => product.isFeatured).slice(0, 4);
  const bestSellers = curatedProducts.filter((product) => product.isBestSeller).slice(0, 4);
  const sales = curatedProducts.filter((product) => product.isOnSale).slice(0, 4);
  const heroProduct = featured.find((product) => product.images.length > 0);
  const collectionProducts: Record<Exclude<HomepageSectionKey, "hero">, ProductCardData[]> = { new: newProducts, featured, best_sellers: bestSellers, promotions: sales };
  const collectionSections = (["new", "featured", "best_sellers", "promotions"] as const).map((key) => ({ key, ...sections[key] })).filter((section) => section.isActive).sort((a, b) => a.order - b.order);
  return <main id="main-content" className="storefront">
    {sections.hero.isActive ? <section className="sf-hero"><div className="sf-hero-copy"><p className="sf-overline">Collection Ben Ami</p><h1>{sections.hero.title}</h1><p>{sections.hero.subtitle}</p><div>{sections.hero.ctaLabel && sections.hero.ctaLink ? <Link className="sf-button dark" href={sections.hero.ctaLink}>{sections.hero.ctaLabel}</Link> : null}</div></div><div className="sf-hero-visual">{heroProduct?.images[0] ? <Link href={`/produits/${heroProduct.slug}`}><Image src={heroProduct.images[0].url} alt={heroProduct.images[0].alt || heroProduct.name} fill priority sizes="(max-width: 768px) 100vw, 50vw" /><span>{heroProduct.name} <b>Découvrir →</b></span></Link> : <div className="sf-hero-placeholder"><span>BEN AMI</span><p>Mode · Chaussures · Accessoires</p></div>}</div></section> : null}
    {categories.length ? <section className="sf-section" id="categories"><div className="sf-section-heading"><div><p>Explorer</p><h2>Nos catégories</h2></div><Link href="/shop">Toute la boutique →</Link></div><div className="sf-category-grid">{categories.map((category, index) => <Link href={`/categories/${category.slug}`} key={category.id} className="sf-category-card">{category.image ? <Image src={category.image} alt="" fill sizes="(max-width: 640px) 50vw, 25vw" /> : null}<span>{String(index + 1).padStart(2, "0")}</span><h3>{category.name}</h3><b>Explorer →</b></Link>)}</div></section> : null}
    {collectionSections.map((section) => <ProductSection key={section.key} eyebrow={section.subtitle} title={section.title} products={collectionProducts[section.key]} currency={settings.currency} href={section.ctaLink} ctaLabel={section.ctaLabel} />)}
    <section className="sf-trust"><article><span>01</span><h3>En boutique</h3><p>Découvrez les articles et essayez-les directement en magasin.</p></article><article><span>02</span><h3>Commande WhatsApp</h3><p>Choisissez votre variante et contactez-nous simplement depuis la fiche produit.</p></article><article><span>03</span><h3>Disponibilité claire</h3><p>Les tailles et stocks affichés proviennent directement de notre catalogue.</p></article></section>
    {settings.instagram ? <section className="sf-instagram"><p>Suivez la sélection</p><h2>Instagram</h2><a href={settings.instagram} target="_blank" rel="noreferrer">Nous retrouver sur Instagram →</a></section> : null}
  </main>;
}
