import { AppSidebar } from "@/components/nav/AppSidebar";
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
        <AppSidebar role={user.role} />

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
