import { NavLink } from "@/components/nav/NavLink";
import { ShipmentFlashToast } from "@/components/ui/ShipmentFlashToast";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px]">
        <aside className="w-64 border-r border-zinc-200 bg-white">
          <div className="px-5 py-4">
            <div className="text-lg font-semibold tracking-tight">Logistic</div>
            <div className="mt-1 text-xs text-zinc-500">
              Shipment management
            </div>
          </div>

          <nav className="flex flex-col gap-1 px-2 pb-5">
            <NavLink href="/shipments">Shipments</NavLink>
            <NavLink href="/parties">Parties</NavLink>
            <NavLink href="/alerts">Alerts</NavLink>
            {user.role === "ADMIN" ? (
              <>
                <NavLink href="/workflows">Workflows</NavLink>
                <NavLink href="/exceptions">Exceptions</NavLink>
              </>
            ) : null}
            {user.role === "ADMIN" ? (
              <NavLink href="/admin/users">Users</NavLink>
            ) : null}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
            <div className="min-w-0">
              <div className="truncate text-sm text-zinc-600">
                Signed in as{" "}
                <span className="font-medium text-zinc-900">{user.name}</span>{" "}
                <span className="text-zinc-400">•</span>{" "}
                <span className="text-zinc-600">{user.role}</span>
              </div>
            </div>
            <form action="/logout" method="post">
              <button
                type="submit"
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Logout
              </button>
            </form>
          </header>

          <main className="flex-1 p-6">{children}</main>
          <ShipmentFlashToast />
        </div>
      </div>
    </div>
  );
}
