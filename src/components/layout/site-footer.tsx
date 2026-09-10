import Link from "next/link";
import type { AwaitedStoreSettings } from "@/types/storefront";

export function SiteFooter({ settings }: { settings: AwaitedStoreSettings }) {
  const whatsappHref = settings.whatsapp ? `https://wa.me/${settings.whatsapp.replace(/\D/g, "")}` : null;
  const hasContact = Boolean(settings.instagram || whatsappHref || settings.phone);
  return <footer className="sf-footer"><div className="sf-footer-grid"><div><Link className="sf-footer-logo" href="/">{settings.storeName}</Link><p>Mode, chaussures et essentiels choisis avec soin.</p>{settings.address ? <address>{settings.address}</address> : null}</div><nav aria-label="Boutique"><strong>Boutique</strong><Link href="/shop">Tous les produits</Link><Link href="/nouveautes">Nouveautés</Link><Link href="/promotions">Promotions</Link></nav>{hasContact ? <nav aria-label="Contact"><strong>Contact</strong>{settings.instagram ? <a href={settings.instagram} target="_blank" rel="noreferrer">Instagram</a> : null}{whatsappHref ? <a href={whatsappHref} target="_blank" rel="noreferrer">WhatsApp</a> : null}{settings.phone ? <a href={`tel:${settings.phone}`}>{settings.phone}</a> : null}</nav> : null}</div><div className="sf-footer-bottom"><span>© {new Date().getFullYear()} {settings.storeName}</span>{settings.address ? <span>{settings.address}</span> : null}</div></footer>;
}
