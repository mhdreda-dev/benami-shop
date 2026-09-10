import Link from "next/link";
import { notFound } from "next/navigation";
import { updateProductAction } from "@/actions/products";
import { ProductForm } from "@/components/admin/product-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, categories, brands] = await Promise.all([prisma.product.findUnique({ where: { id }, include: { variants: { orderBy: [{ size: "asc" }, { color: "asc" }] }, images: { orderBy: { order: "asc" } } } }), prisma.category.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } }), prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  if (!product) notFound();
  const action = updateProductAction.bind(null, product.id);
  const cloudinaryConfigured = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
  return <div className="dashboard product-edit-page"><header className="editor-heading"><div><Link href="/admin/products">← Retour aux produits</Link><p className="eyebrow">Catalogue</p><h1>Modifier le produit</h1></div><p>Les changements de stock sont enregistrés dans l’historique.</p></header><ProductForm action={action} categories={categories} brands={brands} cloudinaryConfigured={cloudinaryConfigured} submitLabel="Enregistrer les modifications" initialValues={{ name: product.name, slug: product.slug, reference: product.reference, description: product.description, categoryId: product.categoryId, brandId: product.brandId ?? "", color: product.color ?? "", price: product.price.toString(), oldPrice: product.oldPrice?.toString() ?? "", status: product.status, isNew: product.isNew, isFeatured: product.isFeatured, isBestSeller: product.isBestSeller, isOnSale: product.isOnSale, variants: product.variants.map((variant) => ({ id: variant.id, size: variant.size, color: variant.color ?? "", stock: variant.stock })), images: product.images.map((image) => ({ id: image.id, url: image.url, publicId: image.publicId, alt: image.alt })) }} /></div>;
}
