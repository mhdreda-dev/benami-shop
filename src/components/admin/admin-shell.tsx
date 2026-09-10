import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/actions/auth";
import { AdminNav } from "@/components/admin/admin-nav";
import { Icon } from "@/components/admin/icons";

export function AdminShell({ email, children }: { email: string; children: ReactNode }) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin" aria-label="Ben Ami Shop — Administration">
          <span className="brand-mark">BA</span>
          <span><strong>Ben Ami</strong><small>Administration</small></span>
        </Link>
        <AdminNav />
        <form action={logoutAction} className="sidebar-logout">
          <button type="submit"><Icon name="logout" width="19" height="19" />Se déconnecter</button>
        </form>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <details className="mobile-menu">
            <summary aria-label="Ouvrir la navigation"><Icon name="menu" width="22" height="22" /><span>Menu</span></summary>
            <div className="mobile-menu-panel"><AdminNav mobile /></div>
          </details>
          <div className="mobile-brand"><span className="brand-mark">BA</span><strong>Ben Ami</strong></div>
          <div className="admin-account">
            <span className="account-dot" aria-hidden="true" />
            <span title={email}>{email}</span>
          </div>
        </header>
        <main id="main-content" className="admin-main">{children}</main>
      </div>
    </div>
  );
}
