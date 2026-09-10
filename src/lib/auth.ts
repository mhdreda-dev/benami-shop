import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";

export async function getAdminSession() {
  const session = await auth();

  return session?.user.role === "ADMIN" ? session : null;
}

export async function requireAdmin() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/admin/login");
  }

  return session;
}
