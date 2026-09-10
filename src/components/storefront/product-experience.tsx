"use client";

import Image from "next/image";
import { useState } from "react";

type GalleryImage = { id: string; url: string; alt: string | null };
type Variant = { id: string; size: string; color: string | null; stock: number };

export function ProductExperience({ images, variants, product, whatsapp, currency, configuredUrl }: { images: GalleryImage[]; variants: Variant[]; product: { name: string; reference: string; price: string; color: string | null }; whatsapp: string; currency: string; configuredUrl: string }) {
  const available = variants.filter((variant) => variant.stock > 0);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState(available.length === 1 ? available[0].id : "");
  const [error, setError] = useState<string | null>(null);
  const selected = variants.find((variant) => variant.id === selectedVariantId);
  const order = () => {
    if (variants.length && !selected) { setError("Sélectionnez une taille disponible avant de continuer."); return; }
    if (!whatsapp) return;
    setError(null);
    const link = configuredUrl || window.location.href;
    const lines = ["Bonjour Ben Ami Shop,", "", "Je souhaite commander ce produit :", "", `Produit: ${product.name}`, `Référence: ${product.reference}`, selected ? `Taille: ${selected.size}` : null, `Couleur: ${selected?.color || product.color || "Non précisée"}`, `Prix: ${product.price} ${currency}`, "", `Lien: ${link}`, "", "Merci."];
    window.open(`https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(lines.filter((line) => line !== null).join("\n"))}`, "_blank", "noopener,noreferrer");
  };
  return <><div className="sf-gallery"><div className="sf-main-image">{images[selectedImage] ? <Image src={images[selectedImage].url} alt={images[selectedImage].alt || product.name} fill priority sizes="(max-width: 900px) 100vw, 55vw" /> : <div className="sf-image-placeholder"><span>BEN AMI</span><p>Image à venir</p></div>}</div>{images.length > 1 ? <div className="sf-thumbnails">{images.map((image, index) => <button type="button" data-active={index === selectedImage || undefined} onClick={() => setSelectedImage(index)} key={image.id} aria-label={`Afficher l’image ${index + 1}`}><Image src={image.url} alt="" fill sizes="80px" /></button>)}</div> : null}</div>
    <div className="sf-purchase"><div className="sf-variants"><div><strong>Choisir une taille</strong>{selected ? <span>{selected.stock} en stock</span> : null}</div>{variants.length ? <div className="sf-size-grid">{variants.map((variant) => <button type="button" key={variant.id} disabled={variant.stock <= 0} data-active={variant.id === selectedVariantId || undefined} onClick={() => { setSelectedVariantId(variant.id); setError(null); }}><span>{variant.size}</span>{variant.color ? <small>{variant.color}</small> : null}{variant.stock <= 0 ? <em>Épuisé</em> : null}</button>)}</div> : <p className="sf-no-stock">Aucune variante disponible actuellement.</p>}</div>{error ? <p className="sf-order-error" role="alert">{error}</p> : null}<button className="sf-whatsapp" type="button" onClick={order} disabled={!whatsapp || available.length === 0}>{!whatsapp ? "Commande WhatsApp indisponible" : available.length === 0 ? "Produit indisponible" : "Commander sur WhatsApp"}</button>{!whatsapp ? <p className="sf-order-help">Le numéro WhatsApp de la boutique n’est pas encore configuré.</p> : <p className="sf-order-help">Vous serez redirigé vers WhatsApp avec votre sélection.</p>}</div>
  </>;
}
