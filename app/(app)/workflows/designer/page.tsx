import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { Roles, type Role } from "@/lib/domain";
import { addTemplateStep, createWorkflowTemplate } from "@/lib/data/workflows";
import { parseWorkflowGlobalVariables } from "@/lib/workflowGlobals";
import { WorkflowDesigner } from "@/components/workflows/WorkflowDesigner";

type SearchParams = Record<string, string | string[] | undefined>;

type DesignerStepInput = {
  id?: string;
  name?: string;
  ownerRole?: string;
  customerVisible?: boolean;
  isExternal?: boolean;
  slaHours?: number | null;
  dependsOn?: string[];
  fieldSchemaKey?: string;
};

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function WorkflowDesignerPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  await requireAdmin();
  const resolved = searchParams
    ? await Promise.resolve(searchParams)
    : ({} as SearchParams);
  const error = readParam(resolved, "error");

  async function createDesignerAction(formData: FormData) {
    "use server";
    const user = await requireAdmin();
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const globalsRaw = String(formData.get("globalVariablesJson") ?? "");
    const globals = parseWorkflowGlobalVariables(globalsRaw);

    const stepsRaw = String(formData.get("stepsJson") ?? "");
    let steps: DesignerStepInput[] = [];
    try {
      const parsed = JSON.parse(stepsRaw);
      steps = Array.isArray(parsed) ? (parsed as DesignerStepInput[]) : [];
    } catch {
      steps = [];
    }

    if (!name || steps.length === 0) {
      redirect("/workflows/designer?error=invalid");
    }

    const templateId = await createWorkflowTemplate({
      name,
      description,
      globalVariablesJson: JSON.stringify(globals),
      createdByUserId: user.id,
    });

    const idMap = new Map<string, number>();

    for (const [index, step] of steps.entries()) {
      const stepName = String(step.name ?? "").trim() || `Step ${index + 1}`;
      const ownerRole = Roles.includes(step.ownerRole as Role)
        ? (step.ownerRole as Role)
        : "OPERATIONS";
      const schemaKey = String(step.fieldSchemaKey ?? "");
      const schemaValue = schemaKey ? formData.get(schemaKey) : null;
      const fieldSchemaJson =
        typeof schemaValue === "string" && schemaValue.trim()
          ? schemaValue
          : JSON.stringify({ version: 1, fields: [] });
      const dependsOn = Array.isArray(step.dependsOn) ? step.dependsOn : [];
      const mappedDepends = dependsOn
        .map((id) => idMap.get(id))
        .filter((id): id is number => typeof id === "number");

      const isExternal = !!step.isExternal;
      const stepId = await addTemplateStep({
        templateId,
        name: stepName,
        ownerRole,
        slaHours:
          typeof step.slaHours === "number" && Number.isFinite(step.slaHours)
            ? step.slaHours
            : null,
        customerVisible: isExternal ? true : !!step.customerVisible,
        isExternal,
        dependsOnStepIds: mappedDepends,
        fieldSchemaJson,
        requiredFields: [],
        requiredDocumentTypes: [],
      });

      if (step.id) {
        idMap.set(step.id, stepId);
      }
    }

    redirect(`/workflows/${templateId}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Workflow designer
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Build workflows visually with steps, connections, and previews.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/workflows"
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Back
          </Link>
          <Link
            href="/workflows/new"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Classic editor
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Please add a name and at least one step.
        </div>
      ) : null}

      <WorkflowDesigner action={createDesignerAction} />
    </div>
  );
}
