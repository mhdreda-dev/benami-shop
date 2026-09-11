import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HomeReveal } from "@/components/storefront/home-reveal";
import { ProductCard } from "@/components/storefront/product-card";
import { getHomepageSections, type HomepageSectionKey } from "@/lib/homepage";
import { getStoreSettings, productCardSelect, type ProductCardData } from "@/lib/storefront";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getStoreSettings();
  const description = "Découvrez la sélection Ben Ami Shop : vêtements, chaussures, nouveautés et promotions.";
  const brandImageUrl = `${settings.siteUrl || "https://benamishop.vercel.app"}/brand/ben-ami-logo.png`;
  return { title: "Ben Ami Shop — Mode et chaussures", description, alternates: settings.siteUrl ? { canonical: settings.siteUrl } : undefined, openGraph: { title: "Ben Ami Shop — Mode et chaussures", description, url: settings.siteUrl || undefined, images: [{ url: brandImageUrl, width: 800, height: 800, alt: "BEN AMI" }] } };
}

function ProductSection({ title, eyebrow, products, currency, href, ctaLabel, sectionKey }: { title: string; eyebrow: string; products: ProductCardData[]; currency: string; href: string; ctaLabel: string; sectionKey: Exclude<HomepageSectionKey, "hero"> }) {
  if (!products.length) return null;
  return <section className="sf-section sf-home-products" data-section={sectionKey} data-home-reveal><div className="sf-section-heading"><div><p>{eyebrow}</p><h2>{title}</h2></div>{href && ctaLabel ? <Link href={href}>{ctaLabel} <span aria-hidden="true">→</span></Link> : null}</div><div className="sf-product-row">{products.map((product) => <ProductCard key={product.id} product={product} currency={currency} />)}</div></section>;
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
  const whatsappHref = settings.whatsapp ? `https://wa.me/${settings.whatsapp}` : null;
  return <main id="main-content" className="storefront sf-home"><HomeReveal />
    {sections.hero.isActive ? <section className="sf-hero"><div className="sf-hero-copy"><Image className="sf-hero-brand" src="/brand/ben-ami-logo.png" alt="" width={72} height={72} sizes="72px" /><p className="sf-overline">Collection Ben Ami <span>Mode · Sneakers · Sélection</span></p><h1>{sections.hero.title}</h1><p>{sections.hero.subtitle}</p><div>{sections.hero.ctaLabel && sections.hero.ctaLink ? <Link className="sf-button dark" href={sections.hero.ctaLink}>{sections.hero.ctaLabel} <span aria-hidden="true">↗</span></Link> : null}<Link className="sf-text-link" href="/#categories">Explorer les catégories <span aria-hidden="true">↓</span></Link></div><small>Des pièces actuelles, choisies avec exigence</small></div><div className="sf-hero-visual">{heroProduct?.images[0] ? <Link href={`/produits/${heroProduct.slug}`} aria-label={`Découvrir ${heroProduct.name}`}><Image src={heroProduct.images[0].url} alt={heroProduct.images[0].alt || heroProduct.name} fill priority sizes="(max-width: 699px) 100vw, 55vw" /><span><small>Pièce en vedette</small>{heroProduct.name} <b aria-hidden="true">Découvrir →</b></span></Link> : <div className="sf-hero-placeholder"><span>BEN AMI</span><p>Mode · Chaussures · Accessoires</p></div>}</div></section> : null}
    {categories.length ? <section className="sf-section sf-home-categories" id="categories" data-home-reveal><div className="sf-section-heading"><div><p>Le vestiaire Ben Ami</p><h2>Explorez par univers</h2></div><Link href="/shop">Toute la boutique <span aria-hidden="true">→</span></Link></div><div className="sf-category-grid">{categories.map((category, index) => <Link href={`/categories/${category.slug}`} key={category.id} className="sf-category-card" aria-label={`Explorer la catégorie ${category.name}`}>{category.image ? <Image src={category.image} alt="" fill sizes="(max-width: 699px) 50vw, 25vw" /> : null}<span>{String(index + 1).padStart(2, "0")}</span><div><h3>{category.name}</h3><b>Découvrir <i aria-hidden="true">↗</i></b></div></Link>)}</div></section> : null}
    {collectionSections.map((section) => <ProductSection key={section.key} sectionKey={section.key} eyebrow={section.subtitle} title={section.title} products={collectionProducts[section.key]} currency={settings.currency} href={section.ctaLink} ctaLabel={section.ctaLabel} />)}
    <section className="sf-trust" data-home-reveal aria-labelledby="trust-title"><header><p>L’expérience Ben Ami</p><h2 id="trust-title">Simple, directe, réelle.</h2></header>{settings.address ? <article><span>01</span><h3>En boutique</h3><p>Retrouvez-nous au {settings.address} et découvrez les articles en personne.</p></article> : null}<article><span>02</span><h3>Commande WhatsApp</h3><p>Choisissez votre variante et contactez directement notre équipe depuis la fiche produit.</p></article><article><span>03</span><h3>Stock réel</h3><p>Les tailles et disponibilités affichées viennent directement de notre catalogue.</p></article></section>
    {settings.instagram ? <section className="sf-instagram" data-home-reveal><p>La sélection au quotidien</p><h2>Suivez BEN AMI<br />sur Instagram</h2><a href={settings.instagram} target="_blank" rel="noreferrer" aria-label="Suivre Ben Ami Shop sur Instagram, nouvel onglet">Voir notre Instagram <span aria-hidden="true">↗</span></a></section> : null}
    <section className="sf-home-closing" data-home-reveal><p>Votre prochaine pièce est ici</p><h2>Découvrez les dernières<br />nouveautés BEN AMI.</h2><div><Link className="sf-button light" href="/nouveautes">Voir les nouveautés</Link>{whatsappHref ? <a className="sf-text-link" href={whatsappHref} target="_blank" rel="noreferrer">Nous contacter sur WhatsApp <span aria-hidden="true">↗</span></a> : null}</div></section>
  </main>;
}
