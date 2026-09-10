"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/admin/icons";
import { adminNavigation } from "@/lib/admin-navigation";

export function AdminNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigation de l'administration">
      <ul className={mobile ? "mobile-nav-list" : "admin-nav-list"}>
        {adminNavigation.map((item) => {
          const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link className="admin-nav-link" data-active={active || undefined} href={item.href}>
                <Icon name={item.icon} width="19" height="19" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
