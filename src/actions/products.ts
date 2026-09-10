"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { deleteProductImages, verifyUploadToken, type UploadedImage } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { validateProductForm } from "@/lib/product-validation";
import type { ProductFormState } from "@/types/product";

const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET,
);

const genericFailure: ProductFormState = {
  success: false,
  message: "Impossible d’enregistrer le produit. Réessayez.",
  errors: {},
};

function resolveTokens(images: Array<{ id?: string; token?: string }>) {
  const resolved = new Map<string, UploadedImage>();
  for (const image of images) {
    if (!image.token) continue;
    const uploaded = verifyUploadToken(image.token);
    if (!uploaded) return null;
    resolved.set(image.token, uploaded);
  }
  return resolved;
}

function imageError(): ProductFormState {
  return { success: false, message: "Une image n’est plus valide.", errors: { images: "Retirez l’image invalide et téléversez-la à nouveau." } };
}

async function validateRelations(categoryId: string, brandId: string | null) {
  const [category, brand] = await Promise.all([
    prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }),
    brandId ? prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } }) : null,
  ]);
  const errors: Record<string, string> = {};
  if (!category) errors.categoryId = "La catégorie sélectionnée n’existe pas.";
  if (brandId && !brand) errors.brandId = "La marque sélectionnée n’existe pas.";
  return errors;
}

function uniqueError(error: unknown): ProductFormState | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const target = Array.isArray(error.meta?.target) ? error.meta.target.join(" ") : String(error.meta?.target ?? "");
  const field = target.includes("reference") ? "reference" : "slug";
  return { success: false, message: "Ce produit existe déjà.", errors: { [field]: field === "reference" ? "Cette référence est déjà utilisée." : "Ce slug est déjà utilisé." } };
}

function transactionError(error: unknown): ProductFormState {
  const unique = uniqueError(error);
  if (unique) return unique;
  if (error instanceof Error && error.message === "VARIANT_HAS_HISTORY") {
    return { success: false, message: "Une variante ne peut pas être supprimée.", errors: { variants: "Une variante avec un historique de stock doit être conservée. Mettez son stock à zéro si elle n’est plus disponible." } };
  }
  return genericFailure;
}

export async function createProductAction(
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const session = await requireAdmin();
  const result = validateProductForm(formData, cloudinaryConfigured);
  if (result.state) return result.state;
  const data = result.data;
  const uploads = resolveTokens(data.images);
  if (!uploads || data.images.some((image) => image.id)) {
    const validUploads = data.images.flatMap((image) => { const uploaded = image.token ? verifyUploadToken(image.token) : null; return uploaded ? [uploaded.publicId] : []; });
    await deleteProductImages(validUploads);
    return imageError();
  }
  const relationErrors = await validateRelations(data.categoryId, data.brandId);
  if (Object.keys(relationErrors).length) {
    await deleteProductImages([...uploads.values()].map((image) => image.publicId));
    return { success: false, message: "Vérifiez les champs indiqués.", errors: relationErrors };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const reusedImage = await tx.productImage.findFirst({ where: { publicId: { in: [...uploads.values()].map((image) => image.publicId) } }, select: { id: true } });
      if (reusedImage) throw new Error("IMAGE_ALREADY_USED");
      await tx.product.create({
        data: {
          name: data.name, slug: data.slug, reference: data.reference, description: data.description,
          categoryId: data.categoryId, brandId: data.brandId, color: data.color,
          price: new Prisma.Decimal(data.price), oldPrice: data.oldPrice === null ? null : new Prisma.Decimal(data.oldPrice),
          status: data.status, isNew: data.isNew, isFeatured: data.isFeatured,
          isBestSeller: data.isBestSeller, isOnSale: data.isOnSale,
          variants: {
            create: data.variants.map((variant) => ({
              size: variant.size, color: variant.color || null, stock: variant.stock,
              stockMovements: variant.stock > 0 ? { create: { type: "IN", quantity: variant.stock, reason: "Stock initial", createdById: session.user.id } } : undefined,
            })),
          },
          images: {
            create: data.images.map((item, order) => {
              const image = uploads.get(item.token ?? "");
              if (!image) throw new Error("INVALID_IMAGE");
              return { url: image.url, publicId: image.publicId, alt: data.name, order };
            }),
          },
        },
      });
    });
  } catch (error) {
    await deleteProductImages([...uploads.values()].map((image) => image.publicId));
    return transactionError(error);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/products");
  redirect("/admin/products?created=1");
}

export async function updateProductAction(
  productId: string,
  _previousState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const session = await requireAdmin();
  if (!productId) return genericFailure;
  const result = validateProductForm(formData, cloudinaryConfigured);
  if (result.state) return result.state;
  const data = result.data;
  const uploads = resolveTokens(data.images);
  if (!uploads) {
    const validUploads = data.images.flatMap((image) => { const uploaded = image.token ? verifyUploadToken(image.token) : null; return uploaded ? [uploaded.publicId] : []; });
    await deleteProductImages(validUploads);
    return imageError();
  }
  const relationErrors = await validateRelations(data.categoryId, data.brandId);
  if (Object.keys(relationErrors).length) {
    await deleteProductImages([...uploads.values()].map((image) => image.publicId));
    return { success: false, message: "Vérifiez les champs indiqués.", errors: relationErrors };
  }

  let removedPublicIds: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, variants: { select: { id: true, stock: true, _count: { select: { stockMovements: true } } } }, images: { select: { id: true, publicId: true } } },
      });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      const reusedImage = await tx.productImage.findFirst({ where: { productId: { not: productId }, publicId: { in: [...uploads.values()].map((image) => image.publicId) } }, select: { id: true } });
      if (reusedImage) throw new Error("IMAGE_ALREADY_USED");
      const existingVariants = new Map(product.variants.map((variant) => [variant.id, variant]));
      if (data.variants.some((variant) => variant.id && !existingVariants.has(variant.id))) throw new Error("INVALID_VARIANT");
      const existingImages = new Map(product.images.map((image) => [image.id, image]));
      if (data.images.some((image) => image.id && !existingImages.has(image.id))) throw new Error("INVALID_IMAGE");

      await tx.product.update({
        where: { id: productId },
        data: { name: data.name, slug: data.slug, reference: data.reference, description: data.description, categoryId: data.categoryId, brandId: data.brandId, color: data.color, price: new Prisma.Decimal(data.price), oldPrice: data.oldPrice === null ? null : new Prisma.Decimal(data.oldPrice), status: data.status, isNew: data.isNew, isFeatured: data.isFeatured, isBestSeller: data.isBestSeller, isOnSale: data.isOnSale },
      });

      const submittedExistingIds = data.variants.flatMap((variant) => variant.id ? [variant.id] : []);
      if (product.variants.some((variant) => !submittedExistingIds.includes(variant.id) && variant._count.stockMovements > 0)) throw new Error("VARIANT_HAS_HISTORY");
      await tx.productVariant.deleteMany({ where: { productId, id: { notIn: submittedExistingIds } } });
      // Move retained rows out of the final uniqueness space first so valid size/color
      // swaps cannot fail depending on update order.
      for (const variantId of submittedExistingIds) {
        await tx.productVariant.update({ where: { id: variantId }, data: { size: `__editing_${variantId}`, color: null } });
      }
      for (const variant of data.variants) {
        if (variant.id) {
          const previous = existingVariants.get(variant.id);
          if (!previous) throw new Error("INVALID_VARIANT");
          const delta = variant.stock - previous.stock;
          await tx.productVariant.update({ where: { id: variant.id }, data: { size: variant.size, color: variant.color || null, stock: variant.stock } });
          if (delta !== 0) await tx.stockMovement.create({ data: { productVariantId: variant.id, type: "ADJUSTMENT", quantity: delta, reason: "Ajustement depuis la fiche produit", createdById: session.user.id } });
        } else {
          const created = await tx.productVariant.create({ data: { productId, size: variant.size, color: variant.color || null, stock: variant.stock } });
          if (variant.stock > 0) await tx.stockMovement.create({ data: { productVariantId: created.id, type: "IN", quantity: variant.stock, reason: "Stock initial", createdById: session.user.id } });
        }
      }

      const retainedIds = data.images.flatMap((image) => image.id ? [image.id] : []);
      removedPublicIds = product.images.filter((image) => !retainedIds.includes(image.id) && image.publicId).map((image) => image.publicId!);
      await tx.productImage.deleteMany({ where: { productId, id: { notIn: retainedIds } } });
      for (const [order, item] of data.images.entries()) {
        if (item.id) await tx.productImage.update({ where: { id: item.id }, data: { order, alt: data.name } });
        else {
          const image = uploads.get(item.token ?? "");
          if (!image) throw new Error("INVALID_IMAGE");
          await tx.productImage.create({ data: { productId, url: image.url, publicId: image.publicId, alt: data.name, order } });
        }
      }
    });
  } catch (error) {
    await deleteProductImages([...uploads.values()].map((image) => image.publicId));
    return transactionError(error);
  }

  await deleteProductImages(removedPublicIds);

  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}/edit`);
  redirect("/admin/products?updated=1");
}

export async function archiveProductAction(productId: string) {
  await requireAdmin();
  if (!productId) return;
  await prisma.product.updateMany({ where: { id: productId }, data: { status: "ARCHIVED" } });
  revalidatePath("/admin");
  revalidatePath("/admin/products");
}
