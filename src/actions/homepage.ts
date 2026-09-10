"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { safeInternalOrHttpUrl, textField } from "@/lib/admin-input";
import { requireAdmin } from "@/lib/auth";
import { homepageSectionKeys } from "@/lib/homepage";
import { prisma } from "@/lib/prisma";

export async function updateHomepageAction(formData: FormData) {
  await requireAdmin();
  const sections = homepageSectionKeys.map((key) => {
    const title = textField(formData, `${key}_title`);
    const subtitle = textField(formData, `${key}_subtitle`);
    const ctaLabel = textField(formData, `${key}_cta_label`);
    const ctaLink = safeInternalOrHttpUrl(textField(formData, `${key}_cta_link`));
    const order = Number(textField(formData, `${key}_order`));
    return { key, title, subtitle, ctaLabel, ctaLink, order, isActive: formData.get(`${key}_active`) === "on" };
  });
  if (sections.some((section) => section.title.length < 2 || section.title.length > 180 || section.subtitle.length > 500 || section.ctaLabel.length > 80 || section.ctaLink === null || !Number.isInteger(section.order) || section.order < 0 || section.order > 1_000)) redirect("/admin/homepage?invalid=1");
  try {
    await prisma.$transaction(sections.map((section) => prisma.homepageSection.upsert({ where: { key: section.key }, update: { title: section.title, subtitle: section.subtitle || null, ctaLabel: section.ctaLabel || null, ctaLink: section.ctaLink || null, isActive: section.isActive, order: section.order }, create: { key: section.key, title: section.title, subtitle: section.subtitle || null, ctaLabel: section.ctaLabel || null, ctaLink: section.ctaLink || null, isActive: section.isActive, order: section.order } })));
  } catch {
    redirect("/admin/homepage?failed=1");
  }
  revalidatePath("/");
  revalidatePath("/admin/homepage");
  redirect("/admin/homepage?saved=1");
}
