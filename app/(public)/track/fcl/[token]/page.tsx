import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

function appendSearchParams(
  token: string,
  searchParams: SearchParams,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry) params.append(key, entry);
      }
      continue;
    }
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `/track/${token}?${query}` : `/track/${token}`;
}

export default async function LegacyFclTrackingRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const { token } = await params;
  const resolvedSearchParams = searchParams
    ? await Promise.resolve(searchParams)
    : ({} as SearchParams);
  redirect(appendSearchParams(token, resolvedSearchParams));
}
