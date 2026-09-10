import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const numberFormatter = new Intl.NumberFormat("fr-FR");

export default async function AdminDashboardPage() {
  const [products, categories, brands, variants, stockAggregate, thresholdSetting] = await Promise.all([
    prisma.product.count({ where: { status: { not: "ARCHIVED" } } }),
    prisma.category.count(),
    prisma.brand.count(),
    prisma.productVariant.count({ where: { product: { status: { not: "ARCHIVED" } } } }),
    prisma.productVariant.aggregate({ where: { product: { status: { not: "ARCHIVED" } } }, _sum: { stock: true } }),
    prisma.setting.findUnique({ where: { key: "low_stock_threshold" }, select: { value: true } }),
  ]);
  const parsedThreshold = Number.parseInt(thresholdSetting?.value ?? "3", 10);
  const lowStockThreshold = Number.isFinite(parsedThreshold) ? Math.max(0, parsedThreshold) : 3;
  const lowStock = await prisma.productVariant.count({ where: { stock: { lte: lowStockThreshold }, product: { status: { not: "ARCHIVED" } } } });
  const stock = stockAggregate._sum.stock ?? 0;
  const metrics = [
    { label: "Produits", value: products, note: products ? "Dans le catalogue" : "Catalogue vide" },
    { label: "Catégories", value: categories, note: "Collections organisées" },
    { label: "Marques", value: brands, note: "Marques référencées" },
    { label: "Variantes", value: variants, note: variants ? "Tailles et couleurs" : "Aucune variante" },
    { label: "Unités en stock", value: stock, note: stock ? "Stock total disponible" : "Aucun stock enregistré" },
    { label: "Stock faible", value: lowStock, note: `Seuil : ${lowStockThreshold} unités`, alert: lowStock > 0 },
  ];

  return (
    <div className="dashboard">
      <header className="dashboard-heading">
        <div><p className="eyebrow">Vue d’ensemble</p><h1>Dashboard</h1></div>
        <p>Suivez l’essentiel de votre boutique en un coup d’œil.</p>
      </header>
      <section className="metric-grid" aria-label="Indicateurs de la boutique">
        {metrics.map((metric) => (
          <article className="metric-card" data-alert={metric.alert || undefined} key={metric.label}>
            <p>{metric.label}</p><strong>{numberFormatter.format(metric.value)}</strong><span>{metric.note}</span>
          </article>
        ))}
      </section>
      <section className="dashboard-panel">
        <div><p className="eyebrow">Catalogue</p><h2>{products ? "Catalogue actif" : "Votre catalogue est vide"}</h2></div>
        <p>{products ? "Consultez les produits et leur stock depuis la section Produits." : "Ajoutez votre premier produit pour commencer à construire votre catalogue."}</p>
      </section>
    </div>
  );
}
