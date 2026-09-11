"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type GalleryImage = { id: string; url: string; alt: string | null };
type Variant = { id: string; size: string; color: string | null; stock: number };

export function ProductExperience({ images, variants, product, whatsapp, currency, configuredUrl, lowStockThreshold }: { images: GalleryImage[]; variants: Variant[]; product: { name: string; reference: string; price: string; color: string | null }; whatsapp: string; currency: string; configuredUrl: string; lowStockThreshold: number }) {
  const available = variants.filter((variant) => variant.stock > 0);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState(available.length === 1 ? available[0].id : "");
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const selected = variants.find((variant) => variant.id === selectedVariantId);
  const stockMessage = selected ? selected.stock <= lowStockThreshold ? `Plus que ${selected.stock} en stock` : "En stock" : available.length === 0 ? "Rupture de stock" : "Sélectionnez une taille";
  useEffect(() => {
    if (!lightboxOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setLightboxOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen]);
  const order = () => {
    if (variants.length && !selected) { setError("Sélectionnez une taille disponible avant de continuer."); return; }
    if (!whatsapp) return;
    setError(null);
    const link = configuredUrl || window.location.href;
    const lines = ["Bonjour Ben Ami Shop,", "", "Je souhaite commander ce produit :", "", `Produit: ${product.name}`, `Référence: ${product.reference}`, selected ? `Taille: ${selected.size}` : null, `Couleur: ${selected?.color || product.color || "Non précisée"}`, `Prix: ${product.price} ${currency}`, "", `Lien: ${link}`, "", "Merci."];
    window.open(`https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(lines.filter((line) => line !== null).join("\n"))}`, "_blank", "noopener,noreferrer");
  };
  return <><div className="sf-gallery"><button className="sf-main-image" type="button" onClick={() => images[selectedImage] && setLightboxOpen(true)} disabled={!images[selectedImage]} aria-label={images[selectedImage] ? "Agrandir l’image du produit" : "Image du produit indisponible"}>{images[selectedImage] ? <Image key={images[selectedImage].id} src={images[selectedImage].url} alt={images[selectedImage].alt || product.name} fill priority sizes="(max-width: 699px) calc(100vw - 2rem), (max-width: 1099px) 60vw, 56rem" /> : <div className="sf-image-placeholder"><span>BEN AMI</span><p>Image à venir</p></div>}<span className="sf-zoom-hint" aria-hidden="true">Agrandir ↗</span></button>{images.length > 1 ? <div className="sf-thumbnails" aria-label="Choisir une image">{images.map((image, index) => <button type="button" data-active={index === selectedImage || undefined} onClick={() => setSelectedImage(index)} key={image.id} aria-label={`Afficher l’image ${index + 1} sur ${images.length}`} aria-pressed={index === selectedImage}><Image src={image.url} alt="" fill sizes="64px" /></button>)}</div> : null}</div>
    <div className="sf-purchase"><div className="sf-variants"><div><strong>Choisir une taille</strong><span data-stock={selected?.stock === 0 || available.length === 0 ? "out" : selected && selected.stock <= lowStockThreshold ? "low" : "available"} aria-live="polite">{stockMessage}</span></div>{variants.length ? <div className="sf-size-grid">{variants.map((variant) => <button type="button" key={variant.id} disabled={variant.stock <= 0} data-active={variant.id === selectedVariantId || undefined} onClick={() => { setSelectedVariantId(variant.id); setError(null); }} aria-pressed={variant.id === selectedVariantId} aria-label={`${variant.size}${variant.color ? `, ${variant.color}` : ""}${variant.stock <= 0 ? ", rupture de stock" : ", disponible"}`}><span>{variant.size}</span>{variant.color ? <small>{variant.color}</small> : null}<em>{variant.stock <= 0 ? "Rupture" : variant.id === selectedVariantId ? "Sélectionnée" : "Disponible"}</em></button>)}</div> : <p className="sf-no-stock">Aucune variante disponible actuellement.</p>}</div>{error ? <p className="sf-order-error" role="alert">{error}</p> : null}<div className="sf-cta-area"><button className="sf-whatsapp" type="button" onClick={order} disabled={!whatsapp || available.length === 0}>{!whatsapp ? "Commande WhatsApp indisponible" : available.length === 0 ? "Produit indisponible" : "Commander sur WhatsApp"}</button>{!whatsapp ? <p className="sf-order-help">Le numéro WhatsApp de la boutique n’est pas encore configuré.</p> : <p className="sf-order-help">Votre sélection sera ajoutée au message WhatsApp.</p>}</div><div className="sf-product-assurances" aria-label="Nos engagements"><span><b aria-hidden="true">✓</b> Stock réel</span><span><b aria-hidden="true">✓</b> Contact direct avec la boutique</span></div></div>
    {lightboxOpen && images[selectedImage] ? <div className="sf-lightbox" role="dialog" aria-modal="true" aria-label={`Vue agrandie de ${product.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setLightboxOpen(false); }}><button ref={closeButtonRef} type="button" onClick={() => setLightboxOpen(false)} aria-label="Fermer l’image agrandie">Fermer ×</button><div><Image src={images[selectedImage].url} alt={images[selectedImage].alt || product.name} fill sizes="95vw" /></div></div> : null}
  </>;
}
