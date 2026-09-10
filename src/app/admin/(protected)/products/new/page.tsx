import Link from "next/link";
import { createProductAction } from "@/actions/products";
import { ProductForm } from "@/components/admin/product-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [categories, brands] = await Promise.all([prisma.category.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } }), prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  const cloudinaryConfigured = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
  return <div className="dashboard product-edit-page"><header className="editor-heading"><div><Link href="/admin/products">← Retour aux produits</Link><p className="eyebrow">Catalogue</p><h1>Nouveau produit</h1></div><p>Créez d’abord un brouillon, puis publiez-le lorsqu’il est prêt.</p></header><ProductForm action={createProductAction} categories={categories} brands={brands} cloudinaryConfigured={cloudinaryConfigured} submitLabel="Créer le produit" initialValues={{ name: "", slug: "", reference: "", description: "", categoryId: "", brandId: "", color: "", price: "", oldPrice: "", status: "DRAFT", isNew: false, isFeatured: false, isBestSeller: false, isOnSale: false, variants: [], images: [] }} /></div>;
}
