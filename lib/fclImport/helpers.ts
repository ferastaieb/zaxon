export type ContainerRowValues = Record<string, string>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function isTruthy(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function normalizeContainerNumbers(input: Array<string | null | undefined>): string[] {
  const unique = new Set<string>();
  for (const raw of input) {
    if (!raw) continue;
    const value = raw.trim();
    if (value) unique.add(value);
  }
  return Array.from(unique);
}

export function extractContainerNumbers(
  values: Record<string, unknown>,
  groupId = "containers",
): string[] {
  const group = values[groupId];
  if (!Array.isArray(group)) return [];
  return normalizeContainerNumbers(
    group.map((entry) =>
      isPlainObject(entry) ? getString(entry.container_number ?? "") : "",
    ),
  );
}

export function normalizeContainerRows(
  containerNumbers: string[],
  values: Record<string, unknown>,
  groupId = "containers",
): ContainerRowValues[] {
  const normalized = normalizeContainerNumbers(containerNumbers);
  const byNumber = new Map<string, ContainerRowValues>();
  const group = values[groupId];
  if (Array.isArray(group)) {
    for (const entry of group) {
      if (!isPlainObject(entry)) continue;
      const number = getString(entry.container_number ?? "").trim();
      if (!number) continue;
      const record: ContainerRowValues = { container_number: number };
      for (const [key, value] of Object.entries(entry)) {
        if (typeof value === "string") {
          record[key] = value;
        }
      }
      byNumber.set(number, record);
    }
  }

  return normalized.map((number) => ({
    container_number: number,
    ...(byNumber.get(number) ?? {}),
  }));
}
