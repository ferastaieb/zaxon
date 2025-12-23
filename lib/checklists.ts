import "server-only";

import { jsonParse } from "@/lib/sql";

export type ChecklistItem = {
  label: string;
  is_final?: boolean;
};

export type ChecklistGroup = {
  name: string;
  items: ChecklistItem[];
};

function toKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function checklistDocType(groupName: string, itemLabel: string): string {
  const groupKey = toKey(groupName);
  const itemKey = toKey(itemLabel);
  if (groupKey && itemKey) return `${groupKey}_${itemKey}`;
  return groupKey || itemKey || "CHECKLIST_ITEM";
}

export function checklistDateKey(groupName: string, itemLabel: string): string {
  const groupKey = toKey(groupName);
  const itemKey = toKey(itemLabel);
  return `checklist:${groupKey}:${itemKey}:date`;
}

export function checklistFileKey(groupName: string, itemLabel: string): string {
  const groupKey = toKey(groupName);
  const itemKey = toKey(itemLabel);
  return `checklist:${groupKey}:${itemKey}:file`;
}

export function getFinalChecklistItem(items: ChecklistItem[]): ChecklistItem | null {
  if (!items.length) return null;
  const explicit = items.find((i) => i.is_final);
  return explicit ?? items[items.length - 1] ?? null;
}

export function parseChecklistGroupsJson(
  value: string | null | undefined,
): ChecklistGroup[] {
  return jsonParse(value, [] as ChecklistGroup[]);
}

function parseChecklistItem(raw: string): ChecklistItem | null {
  let label = raw.trim();
  if (!label) return null;

  let isFinal = false;
  if (/\*$/.test(label)) {
    isFinal = true;
    label = label.replace(/\*+$/, "").trim();
  } else if (/\(final\)$/i.test(label)) {
    isFinal = true;
    label = label.replace(/\(final\)$/i, "").trim();
  }

  if (!label) return null;
  return { label, is_final: isFinal ? true : undefined };
}

export function parseChecklistGroupsInput(input: string): ChecklistGroup[] {
  const groups: ChecklistGroup[] = [];
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(":");
    if (parts.length < 2) continue;
    const name = parts.shift()?.trim() ?? "";
    const itemsPart = parts.join(":").trim();
    if (!name || !itemsPart) continue;

    const items = itemsPart
      .split(",")
      .map(parseChecklistItem)
      .filter((i): i is ChecklistItem => !!i);

    if (!items.length) continue;
    groups.push({ name, items });
  }
  return groups;
}

export function formatChecklistGroups(groups: ChecklistGroup[]): string {
  return groups
    .map((group) => {
      const items = group.items
        .map((item) => `${item.label}${item.is_final ? "*" : ""}`)
        .join(", ");
      return `${group.name}: ${items}`;
    })
    .join("\n");
}
