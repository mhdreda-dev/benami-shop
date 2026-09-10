import type { ProductStatus } from "@prisma/client";

import type { ProductFormState, VariantInput } from "@/types/product";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const statuses = new Set<ProductStatus>(["DRAFT", "PUBLISHED", "ARCHIVED"]);
const maxDatabasePrice = 9_999_999_999.99;

export type ValidProductInput = {
  name: string;
  slug: string;
  reference: string;
  description: string;
  categoryId: string;
  brandId: string | null;
  color: string | null;
  price: number;
  oldPrice: number | null;
  status: ProductStatus;
  isNew: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  isOnSale: boolean;
  variants: VariantInput[];
  images: Array<{ id?: string; token?: string }>;
};

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parsePrice(value: string) {
  if (!value) return null;
  const normalized = value.replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function validateProductForm(formData: FormData, cloudinaryConfigured: boolean):
  | { data: ValidProductInput; state?: never }
  | { data?: never; state: ProductFormState } {
  const name = textValue(formData, "name");
  const slug = textValue(formData, "slug").toLowerCase();
  const reference = textValue(formData, "reference").toUpperCase();
  const description = textValue(formData, "description");
  const categoryId = textValue(formData, "categoryId");
  const brandId = textValue(formData, "brandId") || null;
  const color = textValue(formData, "color") || null;
  const price = parsePrice(textValue(formData, "price"));
  const oldPriceText = textValue(formData, "oldPrice");
  const oldPrice = oldPriceText ? parsePrice(oldPriceText) : null;
  const rawStatus = textValue(formData, "status") as ProductStatus;
  const isOnSale = formData.get("isOnSale") === "on";
  const errors: Record<string, string> = {};

  if (name.length < 2 || name.length > 160) errors.name = "Le nom doit contenir entre 2 et 160 caractères.";
  if (!slugPattern.test(slug) || slug.length > 180) errors.slug = "Utilisez uniquement des lettres minuscules, chiffres et tirets.";
  if (!reference || reference.length > 80) errors.reference = "La référence est obligatoire (80 caractères maximum).";
  if (!description || description.length > 10_000) errors.description = "La description est obligatoire.";
  if (!categoryId) errors.categoryId = "Sélectionnez une catégorie.";
  if (color && color.length > 80) errors.color = "La couleur ne peut pas dépasser 80 caractères.";
  if (price === null || price < 0 || price > maxDatabasePrice) errors.price = "Le prix doit être compris entre 0 et 9 999 999 999,99.";
  if (oldPriceText && (oldPrice === null || oldPrice < 0 || oldPrice > maxDatabasePrice)) errors.oldPrice = "L’ancien prix doit être compris entre 0 et 9 999 999 999,99.";
  if (isOnSale && price !== null && oldPrice !== null && oldPrice <= price) errors.oldPrice = "L’ancien prix doit être supérieur au prix promotionnel.";
  if (isOnSale && oldPrice === null) errors.oldPrice = "Renseignez un ancien prix pour une promotion.";
  if (!statuses.has(rawStatus)) errors.status = "Statut invalide.";

  let variants: VariantInput[] = [];
  try {
    const raw = JSON.parse(textValue(formData, "variants")) as unknown;
    if (!Array.isArray(raw)) throw new Error();
    variants = raw.map((item) => {
      if (!item || typeof item !== "object") throw new Error();
      const input = item as Record<string, unknown>;
      return {
        id: typeof input.id === "string" && input.id ? input.id : undefined,
        size: typeof input.size === "string" ? input.size.trim() : "",
        color: typeof input.color === "string" ? input.color.trim() : "",
        stock: typeof input.stock === "number" ? input.stock : typeof input.stock === "string" && input.stock.trim() ? Number(input.stock) : Number.NaN,
      };
    });
  } catch {
    errors.variants = "Les variantes sont invalides.";
  }

  const combinations = new Set<string>();
  for (const variant of variants) {
    if (!variant.size || variant.size.length > 40) errors.variants = "Chaque variante doit avoir une taille valide.";
    if (variant.color.length > 80) errors.variants = "La couleur d’une variante ne peut pas dépasser 80 caractères.";
    if (!Number.isInteger(variant.stock) || variant.stock < 0) errors.variants = "Le stock doit être un nombre entier positif ou nul.";
    const key = `${variant.size.toLocaleLowerCase()}::${variant.color.toLocaleLowerCase()}`;
    if (combinations.has(key)) errors.variants = "Une combinaison taille/couleur ne peut apparaître qu’une fois.";
    combinations.add(key);
  }

  const images: Array<{ id?: string; token?: string }> = [];
  try {
    const raw = JSON.parse(textValue(formData, "images")) as unknown;
    if (!Array.isArray(raw)) throw new Error();
    for (const item of raw) {
      if (!item || typeof item !== "object") throw new Error();
      const image = item as Record<string, unknown>;
      if (typeof image.id === "string" && !image.id.startsWith("pending-")) images.push({ id: image.id });
      else if (typeof image.token === "string") images.push({ token: image.token });
      else throw new Error();
    }
    const keys = images.map((image) => image.id ?? image.token ?? "");
    if (new Set(keys).size !== raw.length) throw new Error();
  } catch {
    errors.images = "L’ordre des images est invalide.";
  }

  if (rawStatus === "PUBLISHED" && variants.length === 0) errors.variants = "Ajoutez au moins une variante avant publication.";
  if (rawStatus === "PUBLISHED" && cloudinaryConfigured && images.length === 0) errors.images = "Ajoutez au moins une image avant publication.";

  if (Object.keys(errors).length > 0 || price === null) {
    return { state: { success: false, message: "Vérifiez les champs indiqués.", errors } };
  }

  return { data: { name, slug, reference, description, categoryId, brandId, color, price, oldPrice, status: rawStatus, isNew: formData.get("isNew") === "on", isFeatured: formData.get("isFeatured") === "on", isBestSeller: formData.get("isBestSeller") === "on", isOnSale, variants, images } };
}
