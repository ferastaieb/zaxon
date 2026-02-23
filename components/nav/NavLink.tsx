"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

export function NavLink({
  href,
  icon,
  label,
  collapsed = false,
  isActive,
  title,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  collapsed?: boolean;
  isActive?: boolean;
  title?: string;
}) {
  const pathname = usePathname();
  const defaultActive = pathname === href || pathname.startsWith(`${href}/`);
  const active = isActive ?? defaultActive;

  return (
    <Link
      href={href}
      aria-label={collapsed ? label : undefined}
      title={title ?? (collapsed ? label : undefined)}
      className={cn(
        "group items-center text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/70 active:translate-y-px",
        collapsed
          ? "mx-auto flex h-8 w-8 justify-center rounded-lg p-0"
          : "flex w-full gap-2 rounded-lg px-2.5 py-1.5",
        collapsed
          ? active
            ? "translate-y-px border border-zinc-300 bg-zinc-200 text-zinc-900 shadow-[inset_0_1px_1px_rgba(39,39,42,0.16)]"
            : "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
          : active
            ? "translate-y-px bg-zinc-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(24,24,27,0.32)]"
            : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900",
      )}
    >
      <span className="inline-flex shrink-0 items-center justify-center leading-none">
        {icon}
      </span>
      {!collapsed ? (
        <span className="truncate">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </Link>
  );
}
