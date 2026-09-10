import Link from "next/link";

export default function NotFound() {
  return <main id="main-content" className="site-error-page"><p>404</p><h1>Cette page reste introuvable.</h1><span>Le produit ou la page que vous cherchez n’est peut-être plus disponible.</span><div><Link href="/">Retour à l’accueil</Link><Link href="/shop">Voir la boutique</Link></div></main>;
}
