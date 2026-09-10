import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class StockAdjustmentError extends Error {
  constructor(public readonly code: "NEGATIVE" | "NOT_FOUND") {
    super(code);
  }
}

export async function adjustVariantStock({ variantId, delta, reason, createdById }: { variantId: string; delta: number; reason: string; createdById: string }) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.productVariant.updateMany({
      where: { id: variantId, ...(delta < 0 ? { stock: { gte: -delta } } : {}) },
      data: { stock: { increment: delta } },
    });
    if (!updated.count) {
      const exists = await tx.productVariant.findUnique({ where: { id: variantId }, select: { id: true } });
      throw new StockAdjustmentError(exists ? "NEGATIVE" : "NOT_FOUND");
    }
    await tx.stockMovement.create({ data: { productVariantId: variantId, type: "ADJUSTMENT", quantity: delta, reason, createdById } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
