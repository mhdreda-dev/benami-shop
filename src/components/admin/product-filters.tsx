import type { Brand, Category, ProductStatus } from "@prisma/client";

export function ProductFilters({ categories, brands, values }: { categories: Pick<Category, "id" | "name">[]; brands: Pick<Brand, "id" | "name">[]; values: { query: string; category: string; brand: string; status: string } }) {
  return (
    <form className="product-filters" role="search">
      <label className="filter-search"><span className="sr-only">Rechercher</span><input name="q" defaultValue={values.query} placeholder="Rechercher par nom ou référence…" /></label>
      <label><span className="sr-only">Catégorie</span><select name="category" defaultValue={values.category}><option value="">Toutes les catégories</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label><span className="sr-only">Marque</span><select name="brand" defaultValue={values.brand}><option value="">Toutes les marques</option>{brands.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label><span className="sr-only">Statut</span><select name="status" defaultValue={values.status}><option value="">Tous les statuts</option>{(["DRAFT", "PUBLISHED", "ARCHIVED"] satisfies ProductStatus[]).map((status) => <option value={status} key={status}>{status === "DRAFT" ? "Brouillon" : status === "PUBLISHED" ? "Publié" : "Archivé"}</option>)}</select></label>
      <button type="submit">Filtrer</button>
    </form>
  );
}
