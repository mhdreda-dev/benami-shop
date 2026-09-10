import { updateSettingsAction } from "@/actions/settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const keys = ["store_name", "currency", "whatsapp_number", "instagram_url", "store_address", "phone", "low_stock_threshold", "site_url"] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const rows = await prisma.setting.findMany({ where: { key: { in: [...keys] } }, select: { key: true, value: true } });
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const missingLaunchValues = !values.site_url?.trim() || !values.whatsapp_number?.trim();
  return <div className="dashboard settings-page"><header className="dashboard-heading"><div><p className="eyebrow">Configuration</p><h1>Paramètres</h1></div><p>Informations utilisées par la vitrine, le référencement et les commandes.</p></header>
    {params.saved === "1" ? <div className="form-banner" role="status">Paramètres enregistrés.</div> : null}
    {params.invalid === "1" ? <div className="form-banner" data-error role="alert">Vérifiez les formats indiqués avant d’enregistrer.</div> : null}
    {params.failed === "1" ? <div className="form-banner" data-error role="alert">L’enregistrement a échoué. Réessayez.</div> : null}
    {missingLaunchValues ? <div className="launch-warning" role="status"><strong>Configuration requise avant lancement</strong><p>L’URL du site et le numéro WhatsApp doivent être renseignés avec les vraies valeurs de la boutique.</p></div> : null}
    <form action={updateSettingsAction} className="settings-form"><section className="form-section"><header><p className="eyebrow">Boutique</p><h2>Identité et contact</h2><p>Les champs optionnels sont masqués proprement lorsqu’ils sont vides.</p></header><div className="form-grid"><label><span>Nom de la boutique *</span><input name="store_name" required minLength={2} maxLength={120} defaultValue={values.store_name || "Ben Ami Shop"} /></label><label><span>Devise *</span><input name="currency" required pattern="[A-Za-z]{3}" maxLength={3} defaultValue={values.currency || "MAD"} /></label><label><span>WhatsApp international *</span><input name="whatsapp_number" inputMode="tel" maxLength={30} defaultValue={values.whatsapp_number || ""} placeholder="Code pays et numéro, sans espaces" aria-describedby="whatsapp-help" /><small id="whatsapp-help">8 à 15 chiffres, sans zéro initial. Obligatoire avant lancement.</small></label><label><span>Téléphone</span><input name="phone" type="tel" maxLength={50} defaultValue={values.phone || ""} /></label><label className="wide"><span>Adresse</span><textarea name="store_address" rows={3} maxLength={500} defaultValue={values.store_address || ""} /></label><label className="wide"><span>Instagram</span><input name="instagram_url" type="url" defaultValue={values.instagram_url || ""} placeholder="https://www.instagram.com/..." /></label></div></section>
      <section className="form-section"><header><p className="eyebrow">Production</p><h2>Site et inventaire</h2><p>L’URL alimente les liens canoniques, le sitemap et les liens de commande.</p></header><div className="form-grid"><label className="wide"><span>URL publique du site *</span><input name="site_url" type="url" defaultValue={values.site_url || ""} placeholder="https://www.exemple.com" aria-describedby="site-url-help" /><small id="site-url-help">Obligatoire avant lancement. Ne renseignez pas une URL locale.</small></label><label><span>Seuil de stock faible *</span><input name="low_stock_threshold" type="number" required min="0" max="1000000" step="1" defaultValue={values.low_stock_threshold || "3"} /></label></div></section>
      <div className="form-actions"><button className="primary-action" type="submit">Enregistrer les paramètres</button></div></form>
  </div>;
}
