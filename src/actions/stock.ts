"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { textField } from "@/lib/admin-input";
import { adjustVariantStock, StockAdjustmentError } from "@/lib/stock";

export async function adjustStockAction(variantId: string, formData: FormData) {
  const session = await requireAdmin();
  const delta = Number(textField(formData, "delta"));
  const reason = textField(formData, "reason");
  if (!variantId || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000 || reason.length < 2 || reason.length > 240) redirect("/admin/stock?invalid=1");

  try {
    await adjustVariantStock({ variantId, delta, reason, createdById: session.user.id });
  } catch (error) {
    const state = error instanceof StockAdjustmentError && error.code === "NEGATIVE" ? "negative" : error instanceof StockAdjustmentError && error.code === "NOT_FOUND" ? "invalid" : "failed";
    redirect(`/admin/stock?${state}=1`);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/stock");
  revalidatePath("/admin/products");
  redirect("/admin/stock?updated=1");
}
