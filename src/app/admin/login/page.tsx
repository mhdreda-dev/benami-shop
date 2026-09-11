import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/login-form";
import { getAdminSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Connexion administration",
  description: "Accès sécurisé à l'administration Ben Ami Shop.",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");

  return (
    <main id="main-content" className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand"><Image className="login-brand-logo" src="/brand/ben-ami-logo.png" alt="BEN AMI" width={88} height={88} sizes="88px" /></div>
        <p className="login-kicker">Ben Ami Shop</p>
        <h1 id="login-title">Espace administration</h1>
        <p className="login-description">Connectez-vous pour gérer votre boutique.</p>
        <LoginForm />
        <p className="login-security"><span aria-hidden="true">●</span> Accès sécurisé et réservé</p>
      </section>
    </main>
  );
}
