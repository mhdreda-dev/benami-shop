"use client";

import type { Brand, Category } from "@prisma/client";
import { useActionState, useState } from "react";

import { ProductImageUploader } from "@/components/admin/product-image-uploader";
import type { ProductFormState, ProductFormValues, VariantInput } from "@/types/product";

type ProductAction = (state: ProductFormState, formData: FormData) => Promise<ProductFormState>;

const initialState: ProductFormState = { success: false, message: null, errors: {} };

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function FieldError({ error }: { error?: string }) {
  return error ? <p className="field-error">{error}</p> : null;
}

function VariantEditor({ initialVariants, error }: { initialVariants: VariantInput[]; error?: string }) {
  const [variants, setVariants] = useState<VariantInput[]>(initialVariants);
  const update = (index: number, key: "size" | "color" | "stock", value: string) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: key === "stock" ? Number(value) : value } : item));
  return (
    <div className="variant-editor">
      <input type="hidden" name="variants" value={JSON.stringify(variants)} />
      {variants.length ? <div className="variant-list">{variants.map((variant, index) => (
        <div className="variant-row" key={variant.id ?? `new-${index}`}>
          <label><span>Taille</span><input value={variant.size} maxLength={40} required onChange={(event) => update(index, "size", event.target.value)} /></label>
          <label><span>Couleur</span><input value={variant.color} maxLength={80} placeholder="Optionnelle" onChange={(event) => update(index, "color", event.target.value)} /></label>
          <label><span>Stock</span><input value={variant.stock} type="number" min="0" step="1" required onChange={(event) => update(index, "stock", event.target.value)} /></label>
          <button type="button" className="remove-variant" onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Supprimer la variante ${index + 1}`}>Retirer</button>
        </div>
      ))}</div> : <p className="inline-empty">Aucune variante. Un brouillon peut être enregistré sans variante.</p>}
      <button className="add-variant" type="button" onClick={() => setVariants((current) => [...current, { size: "", color: "", stock: 0 }])}>＋ Ajouter une variante</button>
      <FieldError error={error} />
    </div>
  );
}

export function ProductForm({ action, categories, brands, initialValues, cloudinaryConfigured, submitLabel }: { action: ProductAction; categories: Pick<Category, "id" | "name">[]; brands: Pick<Brand, "id" | "name">[]; initialValues: ProductFormValues; cloudinaryConfigured: boolean; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [name, setName] = useState(initialValues.name);
  const [slug, setSlug] = useState(initialValues.slug);
  const [slugEdited, setSlugEdited] = useState(Boolean(initialValues.slug));

  return (
    <form action={formAction} className="product-form">
      {state.message ? <div className="form-banner" data-error={!state.success || undefined} role="alert">{state.message}</div> : null}
      <section className="form-section">
        <header><p className="eyebrow">Informations</p><h2>Informations principales</h2><p>Les informations visibles dans le catalogue.</p></header>
        <div className="form-grid">
          <label className="wide"><span>Nom du produit *</span><input name="name" value={name} required maxLength={160} onChange={(event) => { const value = event.target.value; setName(value); if (!slugEdited) setSlug(slugify(value)); }} /><FieldError error={state.errors.name} /></label>
          <label><span>Slug *</span><input name="slug" value={slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={180} onChange={(event) => { setSlug(event.target.value); setSlugEdited(true); }} /><FieldError error={state.errors.slug} /></label>
          <label><span>Référence *</span><input name="reference" defaultValue={initialValues.reference} required maxLength={80} autoCapitalize="characters" /><FieldError error={state.errors.reference} /></label>
          <label className="wide"><span>Description *</span><textarea name="description" defaultValue={initialValues.description} required rows={6} maxLength={10000} /><FieldError error={state.errors.description} /></label>
          <label><span>Catégorie *</span><select name="categoryId" defaultValue={initialValues.categoryId} required><option value="">Sélectionner</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><FieldError error={state.errors.categoryId} /></label>
          <label><span>Marque</span><select name="brandId" defaultValue={initialValues.brandId}><option value="">Sans marque</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><FieldError error={state.errors.brandId} /></label>
          <label><span>Couleur générale</span><input name="color" defaultValue={initialValues.color} maxLength={80} /></label>
          <label><span>Statut *</span><select name="status" defaultValue={initialValues.status}><option value="DRAFT">Brouillon</option><option value="PUBLISHED">Publié</option><option value="ARCHIVED">Archivé</option></select><FieldError error={state.errors.status} /></label>
        </div>
      </section>

      <section className="form-section">
        <header><p className="eyebrow">Tarification</p><h2>Prix et mise en avant</h2><p>Les montants sont exprimés en dirhams marocains.</p></header>
        <div className="form-grid">
          <label><span>Prix (MAD) *</span><input name="price" type="number" min="0" step="0.01" defaultValue={initialValues.price} required /><FieldError error={state.errors.price} /></label>
          <label><span>Ancien prix (MAD)</span><input name="oldPrice" type="number" min="0" step="0.01" defaultValue={initialValues.oldPrice} /><FieldError error={state.errors.oldPrice} /></label>
        </div>
        <fieldset className="flag-grid"><legend>Badges produit</legend>{[{ name: "isNew", label: "Nouveauté", checked: initialValues.isNew }, { name: "isFeatured", label: "Mis en avant", checked: initialValues.isFeatured }, { name: "isBestSeller", label: "Meilleure vente", checked: initialValues.isBestSeller }, { name: "isOnSale", label: "En promotion", checked: initialValues.isOnSale }].map((flag) => <label key={flag.name}><input type="checkbox" name={flag.name} defaultChecked={flag.checked} /><span>{flag.label}</span></label>)}</fieldset>
      </section>

      <section className="form-section"><header><p className="eyebrow">Inventaire</p><h2>Tailles et stock</h2><p>Chaque combinaison taille/couleur doit être unique.</p></header><VariantEditor initialVariants={initialValues.variants} error={state.errors.variants} /></section>
      <section className="form-section"><header><p className="eyebrow">Médias</p><h2>Images du produit</h2><p>La première image est utilisée comme image principale.</p></header><ProductImageUploader initialImages={initialValues.images} configured={cloudinaryConfigured} /><FieldError error={state.errors.images} /></section>

      <div className="form-actions"><button type="submit" className="primary-action" disabled={pending}>{pending ? <span className="spinner" aria-hidden="true" /> : null}{pending ? "Enregistrement…" : submitLabel}</button></div>
    </form>
  );
}
