import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from "@/actions/catalog";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const messages: Record<string, { text: string; error?: boolean }> = {
  created: { text: "Catégorie créée." }, updated: { text: "Catégorie mise à jour." }, deleted: { text: "Catégorie supprimée." },
  invalid: { text: "Vérifiez le nom, le slug et l’ordre.", error: true }, duplicate: { text: "Ce slug est déjà utilisé.", error: true },
  referenced: { text: "Suppression impossible : des produits utilisent cette catégorie.", error: true }, failed: { text: "L’opération a échoué. Réessayez.", error: true },
};

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const noticeKey = Object.keys(messages).find((key) => params[key] === "1");
  const notice = noticeKey ? messages[noticeKey] : null;
  const categories = await prisma.category.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true, slug: true, description: true, order: true, isActive: true, _count: { select: { products: true } } } });
  return <div className="dashboard management-page"><header className="dashboard-heading"><div><p className="eyebrow">Catalogue</p><h1>Catégories</h1></div><p>Organisez les collections visibles dans la boutique.</p></header>
    {notice ? <div className="form-banner" data-error={notice.error || undefined} role={notice.error ? "alert" : "status"}>{notice.text}</div> : null}
    <section className="management-create"><div><h2>Nouvelle catégorie</h2><p>Le slug est généré automatiquement s’il est laissé vide.</p></div><form action={createCategoryAction} className="management-form"><label>Nom *<input name="name" required maxLength={120} /></label><label>Slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={160} placeholder="généré automatiquement" /></label><label>Ordre<input name="order" type="number" min="0" max="10000" step="1" defaultValue="0" /></label><label className="management-wide">Description<textarea name="description" rows={3} maxLength={2000} /></label><label className="management-check"><input name="isActive" type="checkbox" defaultChecked /> Active</label><button className="primary-action" type="submit">Créer</button></form></section>
    <section className="management-list" aria-label="Catégories existantes">{categories.length ? categories.map((category) => <details className="management-item" key={category.id}><summary><span><strong>{category.name}</strong><small>/{category.slug} · {category._count.products} produit{category._count.products === 1 ? "" : "s"}</small></span><span className="status-badge" data-status={category.isActive ? "published" : "archived"}>{category.isActive ? "Active" : "Inactive"}</span></summary><form action={updateCategoryAction.bind(null, category.id)} className="management-form management-edit"><label>Nom *<input name="name" required maxLength={120} defaultValue={category.name} /></label><label>Slug *<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={160} defaultValue={category.slug} /></label><label>Ordre<input name="order" type="number" min="0" max="10000" step="1" defaultValue={category.order} /></label><label className="management-wide">Description<textarea name="description" rows={3} maxLength={2000} defaultValue={category.description ?? ""} /></label><label className="management-check"><input name="isActive" type="checkbox" defaultChecked={category.isActive} /> Active</label><div className="management-actions"><button className="primary-action" type="submit">Enregistrer</button></div></form><form action={deleteCategoryAction.bind(null, category.id)} className="management-delete"><ConfirmSubmitButton className="table-action danger" message={`Supprimer définitivement la catégorie « ${category.name} » ?`}>Supprimer</ConfirmSubmitButton><span>{category._count.products ? "Suppression verrouillée tant que des produits la référencent." : "Cette catégorie n’est utilisée par aucun produit."}</span></form></details>) : <div className="dashboard-panel empty-panel"><h2>Aucune catégorie</h2><p>Créez la première catégorie du catalogue.</p></div>}</section>
  </div>;
}
