"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { slugify, textField, validSlug } from "@/lib/admin-input";
import { prisma } from "@/lib/prisma";

type TaxonomyKind = "categories" | "brands";

function destination(kind: TaxonomyKind, state: "created" | "updated" | "deleted" | "invalid" | "duplicate" | "referenced" | "failed") {
  return `/admin/${kind}?${state}=1`;
}

function categoryInput(formData: FormData) {
  const name = textField(formData, "name");
  const slug = textField(formData, "slug").toLowerCase() || slugify(name);
  const description = textField(formData, "description");
  const orderText = textField(formData, "order");
  const order = orderText ? Number(orderText) : 0;
  if (name.length < 2 || name.length > 120 || !validSlug(slug) || slug.length > 160 || description.length > 2_000 || !Number.isInteger(order) || order < 0 || order > 10_000) return null;
  return { name, slug, description: description || null, order, isActive: formData.get("isActive") === "on" };
}

function brandInput(formData: FormData) {
  const name = textField(formData, "name");
  const slug = textField(formData, "slug").toLowerCase() || slugify(name);
  if (name.length < 2 || name.length > 120 || !validSlug(slug) || slug.length > 160) return null;
  return { name, slug, isActive: formData.get("isActive") === "on" };
}

function isUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createCategoryAction(formData: FormData) {
  await requireAdmin();
  const input = categoryInput(formData);
  if (!input) redirect(destination("categories", "invalid"));
  try {
    await prisma.category.create({ data: input });
  } catch (error) {
    redirect(destination("categories", isUniqueError(error) ? "duplicate" : "failed"));
  }
  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/admin/categories");
  redirect(destination("categories", "created"));
}

export async function updateCategoryAction(categoryId: string, formData: FormData) {
  await requireAdmin();
  if (!categoryId) redirect(destination("categories", "invalid"));
  const input = categoryInput(formData);
  if (!input) redirect(destination("categories", "invalid"));
  try {
    const result = await prisma.category.updateMany({ where: { id: categoryId }, data: input });
    if (!result.count) throw new Error("NOT_FOUND");
  } catch (error) {
    redirect(destination("categories", isUniqueError(error) ? "duplicate" : "failed"));
  }
  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/admin/categories");
  redirect(destination("categories", "updated"));
}

export async function deleteCategoryAction(categoryId: string) {
  await requireAdmin();
  if (!categoryId) redirect(destination("categories", "invalid"));
  try {
    await prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({ where: { id: categoryId }, select: { _count: { select: { products: true } } } });
      if (!category) throw new Error("NOT_FOUND");
      if (category._count.products > 0) throw new Error("REFERENCED");
      await tx.category.delete({ where: { id: categoryId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const state = error instanceof Error && error.message === "REFERENCED" ? "referenced" : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003" ? "referenced" : "failed";
    redirect(destination("categories", state));
  }
  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/admin/categories");
  redirect(destination("categories", "deleted"));
}

export async function createBrandAction(formData: FormData) {
  await requireAdmin();
  const input = brandInput(formData);
  if (!input) redirect(destination("brands", "invalid"));
  try {
    await prisma.$transaction(async (tx) => {
      const duplicateName = await tx.brand.findFirst({ where: { name: { equals: input.name, mode: "insensitive" } }, select: { id: true } });
      if (duplicateName) throw new Error("DUPLICATE");
      await tx.brand.create({ data: input });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const state = isUniqueError(error) || error instanceof Error && error.message === "DUPLICATE" ? "duplicate" : "failed";
    redirect(destination("brands", state));
  }
  revalidatePath("/shop");
  revalidatePath("/admin/brands");
  redirect(destination("brands", "created"));
}

export async function updateBrandAction(brandId: string, formData: FormData) {
  await requireAdmin();
  if (!brandId) redirect(destination("brands", "invalid"));
  const input = brandInput(formData);
  if (!input) redirect(destination("brands", "invalid"));
  try {
    await prisma.$transaction(async (tx) => {
      const duplicateName = await tx.brand.findFirst({ where: { id: { not: brandId }, name: { equals: input.name, mode: "insensitive" } }, select: { id: true } });
      if (duplicateName) throw new Error("DUPLICATE");
      await tx.brand.update({ where: { id: brandId }, data: input });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const state = isUniqueError(error) || error instanceof Error && error.message === "DUPLICATE" ? "duplicate" : "failed";
    redirect(destination("brands", state));
  }
  revalidatePath("/shop");
  revalidatePath("/admin/brands");
  redirect(destination("brands", "updated"));
}

export async function deleteBrandAction(brandId: string) {
  await requireAdmin();
  if (!brandId) redirect(destination("brands", "invalid"));
  try {
    await prisma.$transaction(async (tx) => {
      const brand = await tx.brand.findUnique({ where: { id: brandId }, select: { _count: { select: { products: true } } } });
      if (!brand) throw new Error("NOT_FOUND");
      if (brand._count.products > 0) throw new Error("REFERENCED");
      await tx.brand.delete({ where: { id: brandId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    redirect(destination("brands", error instanceof Error && error.message === "REFERENCED" ? "referenced" : "failed"));
  }
  revalidatePath("/shop");
  revalidatePath("/admin/brands");
  redirect(destination("brands", "deleted"));
}
