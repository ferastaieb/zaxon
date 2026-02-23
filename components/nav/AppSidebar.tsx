"use client";

import { useMemo, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  PackagePlus,
  ShieldCheck,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { NavLink } from "@/components/nav/NavLink";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/domain";

const COLLAPSE_STORAGE_KEY = "logistic_sidebar_collapsed";
const SIDEBAR_CHANGE_EVENT = "logistic:sidebar-collapsed-change";

type SidebarItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  activeMatch?: (pathname: string, searchParams: URLSearchParams) => boolean;
};

const PARTY_TYPES = ["CUSTOMER", "SUPPLIER", "CUSTOMS_BROKER"] as const;
type SidebarPartyType = (typeof PARTY_TYPES)[number];

function readPartyType(searchParams: URLSearchParams): SidebarPartyType {
  const raw = searchParams.get("type");
  return PARTY_TYPES.includes(raw as SidebarPartyType)
    ? (raw as SidebarPartyType)
    : "CUSTOMER";
}

function readCollapsedFromStorage(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
  if (stored === null) return true;
  return stored === "1";
}

function subscribeToCollapsed(onChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleStorage = () => onChange();
  const handleCustomEvent = () => onChange();

  window.addEventListener("storage", handleStorage);
  window.addEventListener(SIDEBAR_CHANGE_EVENT, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, handleCustomEvent);
  };
}

function setCollapsedInStorage(nextCollapsed: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COLLAPSE_STORAGE_KEY, nextCollapsed ? "1" : "0");
  window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    id: "shipment",
    label: "Shipment",
    href: "/shipments",
    icon: PackagePlus,
  },
  {
    id: "customers",
    label: "Customers",
    href: "/parties?type=CUSTOMER",
    icon: UsersRound,
    activeMatch: (pathname, searchParams) =>
      (pathname === "/parties" || pathname.startsWith("/parties/")) &&
      readPartyType(searchParams) === "CUSTOMER",
  },
  {
    id: "agents",
    label: "Agents",
    href: "/parties?type=CUSTOMS_BROKER",
    icon: ShieldCheck,
    activeMatch: (pathname, searchParams) =>
      (pathname === "/parties" || pathname.startsWith("/parties/")) &&
      readPartyType(searchParams) === "CUSTOMS_BROKER",
  },
  {
    id: "suppliers",
    label: "Suppliers",
    href: "/parties?type=SUPPLIER",
    icon: Building2,
    activeMatch: (pathname, searchParams) =>
      (pathname === "/parties" || pathname.startsWith("/parties/")) &&
      readPartyType(searchParams) === "SUPPLIER",
  },
  {
    id: "users",
    label: "Users",
    href: "/admin/users",
    icon: UserCog,
    adminOnly: true,
  },
  {
    id: "management",
    label: "Management",
    href: "/overview",
    icon: LayoutDashboard,
    adminOnly: true,
  },
];

export function AppSidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const rawSearchParams = useSearchParams();
  const collapsed = useSyncExternalStore(
    subscribeToCollapsed,
    readCollapsedFromStorage,
    () => true,
  );

  const searchParams = useMemo(
    () => new URLSearchParams(rawSearchParams.toString()),
    [rawSearchParams],
  );

  const items = SIDEBAR_ITEMS.filter(
    (item) => !(item.adminOnly && role !== "ADMIN"),
  );
  const primaryItems = items.slice(0, 3);
  const secondaryItems = items.slice(3);

  const isItemActive = (item: SidebarItem) =>
    item.activeMatch
      ? item.activeMatch(pathname, searchParams)
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <aside
      className={cn(
        "border-r border-zinc-300 bg-zinc-100 transition-[width] duration-200",
        collapsed ? "w-16" : "w-52",
      )}
    >
      <div
        className={cn(
          "flex items-center border-b border-zinc-300",
          collapsed ? "justify-center px-1 py-2.5" : "justify-between px-2.5 py-3",
        )}
      >
        {!collapsed ? (
          <div>
            <div className="text-lg font-semibold tracking-tight text-zinc-900">
              Logistic
            </div>
            <div className="mt-1 text-xs text-zinc-500">Shipment management</div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setCollapsedInStorage(!collapsed)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/70"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>

      <nav className={cn("py-2.5", collapsed ? "px-0.5" : "px-1.5")}>
        <div className={cn("space-y-1", collapsed ? "pb-4" : "pb-3")}>
          {primaryItems.map((item) => {
            const active = isItemActive(item);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                href={item.href}
                label={item.label}
                collapsed={collapsed}
                isActive={active}
                icon={
                  <Icon
                    className={cn(
                      "h-[19px] w-[19px] transition duration-150",
                      collapsed
                        ? active
                          ? "text-zinc-900"
                          : "opacity-70"
                        : active
                          ? "text-white"
                          : "text-zinc-600",
                    )}
                    aria-hidden="true"
                  />
                }
              />
            );
          })}
        </div>

        <div className={cn("border-t border-zinc-300", collapsed ? "mx-1" : "mx-1.5")} />

        <div className={cn("space-y-1", collapsed ? "pt-4" : "pt-3")}>
          {secondaryItems.map((item) => {
            const active = isItemActive(item);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.id}
                href={item.href}
                label={item.label}
                collapsed={collapsed}
                isActive={active}
                icon={
                  <Icon
                    className={cn(
                      "h-[19px] w-[19px] transition duration-150",
                      collapsed
                        ? active
                          ? "text-zinc-900"
                          : "opacity-70"
                        : active
                          ? "text-white"
                          : "text-zinc-600",
                    )}
                    aria-hidden="true"
                  />
                }
              />
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
