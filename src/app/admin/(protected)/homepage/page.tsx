import { updateHomepageAction } from "@/actions/homepage";
import { getHomepageSections, homepageSectionKeys } from "@/lib/homepage";

export const dynamic = "force-dynamic";

const labels = { hero: "Hero", new: "Nouveautés", featured: "Produits en vedette", best_sellers: "Best sellers", promotions: "Promotions" } as const;

export default async function HomepageAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, sections] = await Promise.all([searchParams, getHomepageSections()]);
  return <div className="dashboard homepage-admin"><header className="dashboard-heading"><div><p className="eyebrow">Contenu</p><h1>Page d’accueil</h1></div><p>Configurez le hero et l’ordre des collections alimentées par les produits.</p></header>
    {params.saved === "1" ? <div className="form-banner" role="status">Page d’accueil mise à jour.</div> : null}{params.invalid === "1" ? <div className="form-banner" data-error role="alert">Vérifiez les textes, liens et ordres.</div> : null}{params.failed === "1" ? <div className="form-banner" data-error role="alert">L’enregistrement a échoué. Réessayez.</div> : null}
    <div className="homepage-note"><strong>Collections automatiques</strong><p>Les produits affichés restent pilotés par les badges Nouveauté, Mis en avant, Best-seller et Promotion.</p></div>
    <form action={updateHomepageAction} className="homepage-form">{homepageSectionKeys.map((key) => { const section = sections[key]; return <section className="homepage-section-editor" key={key}><header><div><p className="eyebrow">Section</p><h2>{labels[key]}</h2></div><label className="management-check"><input type="checkbox" name={`${key}_active`} defaultChecked={section.isActive} /> Visible</label></header><div className="form-grid"><label className="wide"><span>Titre *</span><input name={`${key}_title`} required minLength={2} maxLength={180} defaultValue={section.title} /></label><label className="wide"><span>Sous-titre</span><textarea name={`${key}_subtitle`} rows={2} maxLength={500} defaultValue={section.subtitle} /></label><label><span>Libellé du bouton</span><input name={`${key}_cta_label`} maxLength={80} defaultValue={section.ctaLabel} /></label><label><span>Lien du bouton</span><input name={`${key}_cta_link`} defaultValue={section.ctaLink} placeholder="/shop" /></label><label><span>Ordre</span><input name={`${key}_order`} type="number" min="0" max="1000" step="1" defaultValue={section.order} /></label></div></section>; })}<div className="form-actions"><button className="primary-action" type="submit">Enregistrer la page d’accueil</button></div></form>
  </div>;
}
