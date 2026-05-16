"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  Calendar,
  UserCheck,
  ScrollText,
  Bell,
  ClipboardList,
} from "lucide-react";

interface SidebarLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

const links: SidebarLink[] = [
  {
    href: "/admin",
    label: "Overview",
    icon: LayoutDashboard,
    roles: ["admin", "program_chair", "reviewer"],
  },
  {
    href: "/admin/abstracts",
    label: "Abstracts",
    icon: FileText,
    roles: ["admin", "program_chair", "reviewer"],
  },
  {
    href: "/admin/reviews",
    label: "My Reviews",
    icon: ClipboardList,
    roles: ["reviewer"],
  },
  {
    href: "/admin/sessions",
    label: "Sessions",
    icon: Calendar,
    roles: ["admin", "program_chair"],
  },
  {
    href: "/admin/presenters",
    label: "Presenters",
    icon: UserCheck,
    roles: ["admin", "program_chair"],
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: Users,
    roles: ["admin"],
  },
  {
    href: "/admin/audit-log",
    label: "Audit Log",
    icon: ScrollText,
    roles: ["admin"],
  },
  {
    href: "/admin/notifications",
    label: "Notifications",
    icon: Bell,
    roles: ["admin"],
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: Settings,
    roles: ["admin"],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const visibleLinks = links.filter((l) => user && l.roles.includes(user.role));

  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 bg-white min-h-full">
      <nav className="flex flex-col gap-1 p-3">
        {visibleLinks.map((link) => {
          const active = pathname === link.href || (link.href !== "/admin" && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <link.icon className="h-4 w-4 shrink-0" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
