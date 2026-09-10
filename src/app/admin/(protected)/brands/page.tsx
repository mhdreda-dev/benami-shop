import { createBrandAction, deleteBrandAction, updateBrandAction } from "@/actions/catalog";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const messages: Record<string, { text: string; error?: boolean }> = {
  created: { text: "Marque créée." }, updated: { text: "Marque mise à jour." }, deleted: { text: "Marque supprimée." },
  invalid: { text: "Vérifiez le nom et le slug.", error: true }, duplicate: { text: "Une marque utilise déjà ce nom ou ce slug.", error: true },
  referenced: { text: "Suppression impossible : des produits utilisent cette marque.", error: true }, failed: { text: "L’opération a échoué. Réessayez.", error: true },
};

export default async function BrandsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const noticeKey = Object.keys(messages).find((key) => params[key] === "1");
  const notice = noticeKey ? messages[noticeKey] : null;
  const brands = await prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, isActive: true, _count: { select: { products: true } } } });
  return <div className="dashboard management-page"><header className="dashboard-heading"><div><p className="eyebrow">Catalogue</p><h1>Marques</h1></div><p>Gérez les marques proposées dans la boutique.</p></header>
    {notice ? <div className="form-banner" data-error={notice.error || undefined} role={notice.error ? "alert" : "status"}>{notice.text}</div> : null}
    <section className="management-create"><div><h2>Nouvelle marque</h2><p>Le slug est généré automatiquement s’il est laissé vide.</p></div><form action={createBrandAction} className="management-form"><label>Nom *<input name="name" required maxLength={120} /></label><label>Slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={160} placeholder="généré automatiquement" /></label><label className="management-check"><input name="isActive" type="checkbox" defaultChecked /> Active</label><button className="primary-action" type="submit">Créer</button></form></section>
    <section className="management-list" aria-label="Marques existantes">{brands.length ? brands.map((brand) => <details className="management-item" key={brand.id}><summary><span><strong>{brand.name}</strong><small>/{brand.slug} · {brand._count.products} produit{brand._count.products === 1 ? "" : "s"}</small></span><span className="status-badge" data-status={brand.isActive ? "published" : "archived"}>{brand.isActive ? "Active" : "Inactive"}</span></summary><form action={updateBrandAction.bind(null, brand.id)} className="management-form management-edit"><label>Nom *<input name="name" required maxLength={120} defaultValue={brand.name} /></label><label>Slug *<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={160} defaultValue={brand.slug} /></label><label className="management-check"><input name="isActive" type="checkbox" defaultChecked={brand.isActive} /> Active</label><div className="management-actions"><button className="primary-action" type="submit">Enregistrer</button></div></form><form action={deleteBrandAction.bind(null, brand.id)} className="management-delete"><ConfirmSubmitButton className="table-action danger" message={`Supprimer définitivement la marque « ${brand.name} » ?`}>Supprimer</ConfirmSubmitButton><span>{brand._count.products ? "Suppression verrouillée tant que des produits la référencent." : "Cette marque n’est utilisée par aucun produit."}</span></form></details>) : <div className="dashboard-panel empty-panel"><h2>Aucune marque</h2><p>Créez la première marque du catalogue.</p></div>}</section>
  </div>;
}
