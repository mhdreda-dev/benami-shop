import type { ProductStatus } from "@prisma/client";

const labels: Record<ProductStatus, string> = { DRAFT: "Brouillon", PUBLISHED: "Publié", ARCHIVED: "Archivé" };

export function StatusBadge({ status }: { status: ProductStatus }) {
  return <span className="status-badge" data-status={status.toLowerCase()}>{labels[status]}</span>;
}
