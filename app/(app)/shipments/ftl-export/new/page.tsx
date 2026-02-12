import { redirect } from "next/navigation";

type NewFtlExportPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewFtlExportShipmentPage({
  searchParams,
}: NewFtlExportPageProps) {
  const resolved = searchParams ? await Promise.resolve(searchParams) : {};
  const error = typeof resolved.error === "string" ? resolved.error : null;
  const query = error ? `?error=${encodeURIComponent(error)}` : "";
  redirect(`/shipments/new${query}`);
}

