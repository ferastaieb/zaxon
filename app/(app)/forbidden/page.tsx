import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight">Access denied</h1>
      <p className="mt-2 text-sm text-zinc-600">
        You don’t have permission to perform this action.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/shipments"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Back to shipments
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Home
        </Link>
      </div>
    </div>
  );
}

