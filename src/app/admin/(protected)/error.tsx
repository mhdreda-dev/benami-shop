"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="admin-error" role="alert"><p className="eyebrow">Erreur</p><h1>Impossible de charger cette section.</h1><p>Réessayez. Si le problème persiste, revenez au tableau de bord.</p><button type="button" onClick={reset}>Réessayer</button></section>;
}
