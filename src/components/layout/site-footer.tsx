import Image from "next/image";
import Link from "next/link";
import type { AwaitedStoreSettings } from "@/types/storefront";

export function SiteFooter({ settings }: { settings: AwaitedStoreSettings }) {
  const whatsappHref = settings.whatsapp ? `https://wa.me/${settings.whatsapp.replace(/\D/g, "")}` : null;
  const hasContact = Boolean(settings.instagram || whatsappHref || settings.phone);
  return <footer className="sf-footer"><div className="sf-footer-grid"><div className="sf-footer-intro"><Link className="sf-footer-logo" href="/" aria-label={`Accueil ${settings.storeName}`}><Image src="/brand/ben-ami-logo.png" alt="BEN AMI" width={96} height={96} sizes="96px" /></Link><p>Mode, chaussures et essentiels choisis avec soin pour un vestiaire actuel.</p>{settings.address ? <address>{settings.address}</address> : null}</div><nav aria-label="Boutique"><strong>Boutique</strong><Link href="/shop">Tous les produits</Link><Link href="/nouveautes">Nouveautés</Link><Link href="/promotions">Promotions</Link><Link href="/#categories">Catégories</Link></nav>{hasContact ? <nav aria-label="Contact"><strong>Nous retrouver</strong>{settings.instagram ? <a href={settings.instagram} target="_blank" rel="noreferrer">Instagram ↗</a> : null}{whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer">WhatsApp ↗</a> : null}{settings.phone ? <a href={`tel:${settings.phone}`}>{settings.phone}</a> : null}</nav> : null}</div><div className="sf-footer-bottom"><span>© {new Date().getFullYear()} {settings.storeName}</span><span>Style actuel · Sélection exigeante</span></div></footer>;
}
