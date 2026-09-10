import type { Prisma } from "@prisma/client";

import { adjustStockAction } from "@/actions/stock";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const messages: Record<string, { text: string; error?: boolean }> = {
  updated: { text: "Stock ajusté et mouvement enregistré." }, invalid: { text: "Saisissez un ajustement non nul et un motif valide.", error: true },
  negative: { text: "Ajustement refusé : le stock ne peut pas devenir négatif.", error: true }, failed: { text: "L’ajustement a échoué. Réessayez.", error: true },
};

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key].trim().slice(0, 120) : "";
  const query = value("q"), productId = value("product"), filter = value("filter");
  const thresholdRow = await prisma.setting.findUnique({ where: { key: "low_stock_threshold" }, select: { value: true } });
  const parsedThreshold = Number.parseInt(thresholdRow?.value ?? "3", 10);
  const threshold = Number.isFinite(parsedThreshold) ? Math.max(0, parsedThreshold) : 3;
  const where: Prisma.ProductVariantWhereInput = {
    product: { status: { not: "ARCHIVED" }, ...(productId ? { id: productId } : {}), ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { reference: { contains: query, mode: "insensitive" } }] } : {}) },
    ...(filter === "low" ? { stock: { gt: 0, lte: threshold } } : filter === "out" ? { stock: 0 } : {}),
  };
  const [variants, products, movements] = await Promise.all([
    prisma.productVariant.findMany({ where, orderBy: [{ stock: "asc" }, { product: { name: "asc" } }, { size: "asc" }], take: 200, select: { id: true, size: true, color: true, stock: true, product: { select: { id: true, name: true, reference: true } } } }),
    prisma.product.findMany({ where: { status: { not: "ARCHIVED" }, variants: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.stockMovement.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, type: true, quantity: true, reason: true, createdAt: true, productVariant: { select: { size: true, color: true, product: { select: { name: true, reference: true } } } } } }),
  ]);
  const noticeKey = Object.keys(messages).find((key) => params[key] === "1"); const notice = noticeKey ? messages[noticeKey] : null;
  return <div className="dashboard stock-page"><header className="dashboard-heading"><div><p className="eyebrow">Inventaire</p><h1>Stock</h1></div><p>Stock actif · seuil faible : {threshold}</p></header>
    {notice ? <div className="form-banner" data-error={notice.error || undefined} role={notice.error ? "alert" : "status"}>{notice.text}</div> : null}
    <form className="stock-filters" role="search"><label><span>Rechercher</span><input name="q" defaultValue={query} placeholder="Produit ou référence" /></label><label><span>Produit</span><select name="product" defaultValue={productId}><option value="">Tous les produits</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label><span>État</span><select name="filter" defaultValue={filter}><option value="">Tous</option><option value="low">Stock faible</option><option value="out">Rupture</option></select></label><button type="submit">Filtrer</button></form>
    <section className="stock-list" aria-label="Variantes en stock">{variants.length ? variants.map((variant) => { const state = variant.stock === 0 ? "Rupture" : variant.stock <= threshold ? "Faible" : "Disponible"; return <article className="stock-item" key={variant.id}><div className="stock-identity"><strong>{variant.product.name}</strong><span>Réf. {variant.product.reference} · Taille {variant.size}{variant.color ? ` · ${variant.color}` : ""}</span></div><div className="stock-value" data-state={state.toLowerCase()}><strong>{variant.stock}</strong><span>{state}</span></div><form action={adjustStockAction.bind(null, variant.id)} className="stock-adjust"><label><span>Ajustement</span><input name="delta" type="number" step="1" required placeholder="+5 ou -2" /></label><label><span>Motif</span><input name="reason" required minLength={2} maxLength={240} placeholder="Réception, correction…" /></label><button type="submit">Appliquer</button></form></article>; }) : <div className="dashboard-panel empty-panel"><h2>Aucune variante</h2><p>Aucune variante ne correspond aux filtres sélectionnés.</p></div>}</section>
    <section className="movement-panel"><header><p className="eyebrow">Traçabilité</p><h2>Mouvements récents</h2></header>{movements.length ? <div className="movement-list">{movements.map((movement) => <article key={movement.id}><div><strong>{movement.productVariant.product.name}</strong><span>{movement.productVariant.product.reference} · {movement.productVariant.size}{movement.productVariant.color ? ` · ${movement.productVariant.color}` : ""}</span></div><strong data-negative={movement.quantity < 0 || undefined}>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</strong><div><span>{movement.reason || movement.type}</span><time dateTime={movement.createdAt.toISOString()}>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(movement.createdAt)}</time></div></article>)}</div> : <p className="inline-empty">Aucun mouvement enregistré.</p>}</section>
  </div>;
}
