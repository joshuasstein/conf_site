"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Globe,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function Nav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
    toast({ title: "Signed out", description: "You have been logged out." });
  };

  const isAdmin = user?.role === "admin" || user?.role === "program_chair" || user?.role === "reviewer";

  const navLinks = [
    {
      href: isAdmin ? "/admin" : "/abstracts/new",
      label: "Dashboard",
      icon: LayoutDashboard,
      show: !!user && user.role !== "submitter",
    },
    {
      href: "/",
      label: "My Abstracts",
      icon: FileText,
      show: user?.role === "submitter",
    },
    {
      href: "/program",
      label: "Program",
      icon: Globe,
      show: true,
    },
  ].filter((l) => l.show);

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link
            href={isAdmin ? "/admin" : "/"}
            className="flex items-center gap-2 text-indigo-600 font-bold text-lg"
          >
            <FileText className="h-5 w-5" />
            <span>ConfSite</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-1.5 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "text-indigo-600"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-slate-600">
                  {user.full_name}{" "}
                  <span className="text-slate-400">({user.role.replace("_", " ")})</span>
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">Register</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 rounded-md text-slate-600 hover:text-slate-900"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 py-2 text-sm text-slate-700 hover:text-indigo-600"
              onClick={() => setMobileOpen(false)}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
          {user ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 py-2 text-sm text-slate-700 hover:text-red-600 w-full"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          ) : (
            <>
              <Link href="/login" className="block py-2 text-sm text-slate-700">
                Sign in
              </Link>
              <Link href="/register" className="block py-2 text-sm text-indigo-600 font-medium">
                Register
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
