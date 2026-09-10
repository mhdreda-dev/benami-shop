import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Administration",
  description: "Espace de gestion Ben Ami Shop.",
  robots: { index: false, follow: false },
};

export default async function ProtectedAdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdmin();
  return <AdminShell email={session.user.email}>{children}</AdminShell>;
}
