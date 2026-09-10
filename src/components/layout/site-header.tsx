import Link from "next/link";

const navigation = [{ href: "/", label: "Accueil" }, { href: "/shop", label: "Boutique" }, { href: "/nouveautes", label: "Nouveautés" }, { href: "/promotions", label: "Promotions" }] as const;

export function SiteHeader({ storeName }: { storeName: string }) {
  return <header className="sf-header"><div className="sf-header-inner">
    <details className="sf-mobile-menu"><summary aria-label="Ouvrir le menu"><span /><span /><span /></summary><nav aria-label="Navigation mobile">{navigation.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}<Link href="/#categories">Catégories</Link></nav></details>
    <Link className="sf-logo" href="/">{storeName}</Link>
    <nav className="sf-desktop-nav" aria-label="Navigation principale">{navigation.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}<Link href="/#categories">Catégories</Link></nav>
    <form className="sf-search" action="/shop" role="search"><label className="sr-only" htmlFor="header-search">Rechercher</label><input id="header-search" name="q" type="search" placeholder="Rechercher" /><button aria-label="Lancer la recherche" type="submit">⌕</button></form>
  </div></header>;
}
