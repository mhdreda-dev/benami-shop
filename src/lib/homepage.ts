import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const homepageSectionKeys = ["hero", "new", "featured", "best_sellers", "promotions"] as const;
export type HomepageSectionKey = (typeof homepageSectionKeys)[number];

const defaults: Record<HomepageSectionKey, { title: string; subtitle: string; ctaLabel: string; ctaLink: string; isActive: boolean; order: number }> = {
  hero: { title: "Le style juste. À votre manière.", subtitle: "Une sélection actuelle de vêtements et chaussures pensée pour le quotidien.", ctaLabel: "Découvrir la collection", ctaLink: "/shop", isActive: true, order: 0 },
  new: { title: "Nouveautés", subtitle: "Fraîchement arrivés", ctaLabel: "Tout voir", ctaLink: "/nouveautes", isActive: true, order: 10 },
  featured: { title: "Produits en vedette", subtitle: "La sélection", ctaLabel: "Tout voir", ctaLink: "/shop?featured=1", isActive: true, order: 20 },
  best_sellers: { title: "Best sellers", subtitle: "Vos favoris", ctaLabel: "Tout voir", ctaLink: "/shop", isActive: true, order: 30 },
  promotions: { title: "Promotions", subtitle: "Prix doux", ctaLabel: "Tout voir", ctaLink: "/promotions", isActive: true, order: 40 },
};

export const getHomepageSections = cache(async () => {
  const rows = await prisma.homepageSection.findMany({ where: { key: { in: [...homepageSectionKeys] } }, select: { key: true, title: true, subtitle: true, ctaLabel: true, ctaLink: true, isActive: true, order: true } });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return Object.fromEntries(homepageSectionKeys.map((key) => {
    const row = byKey.get(key);
    return [key, row ? { title: row.title || defaults[key].title, subtitle: row.subtitle || defaults[key].subtitle, ctaLabel: row.ctaLabel || defaults[key].ctaLabel, ctaLink: row.ctaLink || defaults[key].ctaLink, isActive: row.isActive, order: row.order } : defaults[key]];
  })) as Record<HomepageSectionKey, (typeof defaults)[HomepageSectionKey]>;
});
