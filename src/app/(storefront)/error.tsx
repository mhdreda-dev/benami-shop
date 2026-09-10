"use client";

import Link from "next/link";

export default function StorefrontError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main id="main-content" className="site-error-page"><p>Un imprévu</p><h1>La boutique n’a pas pu se charger.</h1><span>Réessayez dans quelques instants. Aucune information sensible n’a été affichée.</span><div><button type="button" onClick={reset}>Réessayer</button><Link href="/">Retour à l’accueil</Link></div></main>;
}
