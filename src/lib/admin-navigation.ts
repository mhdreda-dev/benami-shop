import type { IconName } from "@/components/admin/icons";

export const adminNavigation = [
  { href: "/admin", label: "Dashboard", icon: "dashboard" },
  { href: "/admin/products", label: "Produits", icon: "products" },
  { href: "/admin/categories", label: "Catégories", icon: "categories" },
  { href: "/admin/brands", label: "Marques", icon: "brands" },
  { href: "/admin/stock", label: "Stock", icon: "stock" },
  { href: "/admin/homepage", label: "Page d'accueil", icon: "home" },
  { href: "/admin/settings", label: "Paramètres", icon: "settings" },
] satisfies ReadonlyArray<{ href: string; label: string; icon: IconName }>;
