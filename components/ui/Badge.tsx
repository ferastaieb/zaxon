import { cn } from "@/lib/cn";

export function Badge({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: "zinc" | "green" | "yellow" | "red" | "blue";
}) {
  const toneClasses =
    tone === "green"
      ? "border-green-200 bg-green-50 text-green-800"
      : tone === "yellow"
        ? "border-yellow-200 bg-yellow-50 text-yellow-800"
        : tone === "red"
          ? "border-red-200 bg-red-50 text-red-800"
          : tone === "blue"
            ? "border-blue-200 bg-blue-50 text-blue-800"
            : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        toneClasses,
      )}
    >
      {children}
    </span>
  );
}

