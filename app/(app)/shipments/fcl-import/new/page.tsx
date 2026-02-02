import { redirect } from "next/navigation";

type NewFclImportPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewFclImportShipmentPage({
  searchParams,
}: NewFclImportPageProps) {
  const resolved = searchParams ? await Promise.resolve(searchParams) : {};
  const error = typeof resolved.error === "string" ? resolved.error : null;
  const query = error ? `?error=${encodeURIComponent(error)}` : "";
  redirect(`/shipments/new${query}`);
}
