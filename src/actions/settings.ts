"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizedHttpUrl, textField } from "@/lib/admin-input";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function updateSettingsAction(formData: FormData) {
  await requireAdmin();
  const storeName = textField(formData, "store_name");
  const currency = textField(formData, "currency").toUpperCase();
  const rawWhatsapp = textField(formData, "whatsapp_number");
  const whatsapp = rawWhatsapp.replace(/\D/g, "").replace(/^00/, "");
  const instagram = normalizedHttpUrl(textField(formData, "instagram_url"));
  const siteUrl = normalizedHttpUrl(textField(formData, "site_url"));
  const address = textField(formData, "store_address");
  const phone = textField(formData, "phone");
  const thresholdText = textField(formData, "low_stock_threshold");
  const threshold = Number(thresholdText);

  const invalid = storeName.length < 2 || storeName.length > 120 || !/^[A-Z]{3}$/.test(currency) ||
    (Boolean(rawWhatsapp) && (!/^[1-9]\d{7,14}$/.test(whatsapp))) || instagram === null || siteUrl === null ||
    address.length > 500 || phone.length > 50 || !Number.isInteger(threshold) || threshold < 0 || threshold > 1_000_000;
  if (invalid) redirect("/admin/settings?invalid=1");

  const settings = {
    store_name: storeName, currency, whatsapp_number: whatsapp, instagram_url: instagram,
    store_address: address, phone, low_stock_threshold: String(threshold), site_url: siteUrl,
  };
  try {
    await prisma.$transaction(Object.entries(settings).map(([key, value]) => prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })));
  } catch {
    redirect("/admin/settings?failed=1");
  }
  revalidatePath("/", "layout");
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}
