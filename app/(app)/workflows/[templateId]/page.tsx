import Link from "next/link";
import { redirect } from "next/navigation";

import { GlobalVariablesBuilder } from "@/components/workflows/GlobalVariablesBuilder";
import { StepFieldBuilder } from "@/components/workflows/StepFieldBuilder";
import { StepVisibilityToggle } from "@/components/workflows/StepVisibilityToggle";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { requireAdmin } from "@/lib/auth";
import { DocumentTypes, Roles, type Role } from "@/lib/domain";
import {
  parseChecklistGroupsInput,
  parseChecklistGroupsJson,
} from "@/lib/checklists";
import {
  collectBooleanFieldOptions,
  parseStepFieldSchema,
  schemaFromLegacyFields,
} from "@/lib/stepFields";
import { parseWorkflowGlobalVariables } from "@/lib/workflowGlobals";
import {
  addTemplateStep,
  addSubworkflowSteps,
  deleteWorkflowTemplate,
  deleteTemplateStep,
  deleteTemplateStepGroup,
  getWorkflowTemplateUsage,
  getWorkflowTemplate,
  listWorkflowTemplates,
  listTemplateSteps,
  moveTemplateStep,
  parseRequiredDocumentTypes,
  parseRequiredFields,
  updateTemplateStep,
  updateWorkflowTemplate,
} from "@/lib/data/workflows";

function parseDependsOn(value: string | null | undefined): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => Number(entry))
      .filter((id) => Number.isFinite(id) && id > 0);
  } catch {
    return [];
  }
}

function buildExternalBooleanOptions(
  steps: Array<{
    id: number;
    name: string;
    sort_order: number;
    field_schema_json: string | null;
  }>,
  excludeStepId?: number | null,
): Array<{ label: string; value: string }> {
  const options: Array<{ label: string; value: string }> = [];
  for (const step of steps) {
    if (excludeStepId && step.id === excludeStepId) continue;
    const schema = parseStepFieldSchema(step.field_schema_json);
    const boolOptions = collectBooleanFieldOptions(schema.fields);
    for (const option of boolOptions) {
      const label = option.label
        ? `${step.sort_order}. ${step.name} / ${option.label}`
        : `${step.sort_order}. ${step.name} / (checkbox)`;
      options.push({
        label,
        value: `step:${step.id}:${option.encodedPath}`,
      });
    }
  }
  return options;
}

export default async function WorkflowTemplateDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { templateId } = await params;
  const sp = (await searchParams) ?? {};
  const error = typeof sp.error === "string" ? sp.error : null;
  const template = await getWorkflowTemplate(Number(templateId));
  if (!template) redirect("/workflows");

  const steps = await listTemplateSteps(template.id);
  const externalBooleanOptions = buildExternalBooleanOptions(steps);
  const globalVariables = parseWorkflowGlobalVariables(
    template.global_variables_json,
  );
  const subworkflows = (await listWorkflowTemplates({
    includeArchived: false,
    isSubworkflow: true,
  })).filter((t) => t.id !== template.id);

  async function updateTemplateAction(formData: FormData) {
    "use server";
    const user = await requireAdmin();
    const id = Number(formData.get("id") ?? 0);
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const isArchived = String(formData.get("isArchived") ?? "") === "1";
    const isSubworkflow = String(formData.get("isSubworkflow") ?? "") === "1";
    const globalsRaw = String(formData.get("globalVariablesJson") ?? "");
    const globals = parseWorkflowGlobalVariables(globalsRaw);
    if (!id || !name) redirect(`/workflows/${id}?error=invalid`);
    await updateWorkflowTemplate({
      id,
      name,
      description,
      isArchived,
      isSubworkflow,
      globalVariablesJson: JSON.stringify(globals),
      updatedByUserId: user.id,
    });
    redirect(`/workflows/${id}`);
  }

  async function deleteTemplateAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const id = Number(formData.get("templateId") ?? 0);
    if (!id) redirect("/workflows?error=invalid");
    const usage = await getWorkflowTemplateUsage(id);
    if (usage.hasShipments) {
      redirect(`/workflows/${id}?error=in_use`);
    }
    if (usage.usedAsSubworkflow) {
      redirect(`/workflows/${id}?error=subworkflow_in_use`);
    }
    await deleteWorkflowTemplate(id);
    redirect("/workflows");
  }

  async function addStepAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const templateId = Number(formData.get("templateId") ?? 0);
    const name = String(formData.get("name") ?? "").trim();
    const ownerRole = String(formData.get("ownerRole") ?? "") as Role;
    const slaHoursRaw = String(formData.get("slaHours") ?? "").trim();
    const slaHours = slaHoursRaw ? Number(slaHoursRaw) : null;
    const customerVisible = String(formData.get("customerVisible") ?? "") === "1";
    const isExternal = String(formData.get("isExternal") ?? "") === "1";
    const dependsOn = (formData.getAll("dependsOn") ?? [])
      .map((entry) => Number(entry))
      .filter((id) => Number.isFinite(id) && id > 0);
    const fieldSchemaRaw = String(formData.get("fieldSchema") ?? "");
    const fieldSchema = parseStepFieldSchema(fieldSchemaRaw);
    const checklistGroups = formData.has("checklistGroups")
      ? parseChecklistGroupsInput(String(formData.get("checklistGroups") ?? ""))
      : [];
    if (!templateId || !name || !Roles.includes(ownerRole)) {
      redirect(`/workflows/${templateId}?error=invalid`);
    }
    await addTemplateStep({
      templateId,
      name,
      ownerRole,
      slaHours: Number.isFinite(slaHours) ? slaHours : null,
      customerVisible: isExternal ? true : customerVisible,
      isExternal,
      checklistGroups,
      dependsOnStepIds: dependsOn,
      fieldSchemaJson: JSON.stringify(fieldSchema),
      requiredFields: [],
      requiredDocumentTypes: [],
    });
    redirect(`/workflows/${templateId}`);
  }

  async function updateStepAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const stepId = Number(formData.get("stepId") ?? 0);
    const templateId = Number(formData.get("templateId") ?? 0);
    const name = String(formData.get("name") ?? "").trim();
    const ownerRole = String(formData.get("ownerRole") ?? "") as Role;
    const fieldSchemaRaw = String(formData.get("fieldSchema") ?? "");
    const fieldSchema = parseStepFieldSchema(fieldSchemaRaw);
    const requiredDocs = (formData.getAll("requiredDocs") ?? []).map((v) =>
      String(v),
    );
    const slaHoursRaw = String(formData.get("slaHours") ?? "").trim();
    const slaHours = slaHoursRaw ? Number(slaHoursRaw) : null;
    const customerVisible = String(formData.get("customerVisible") ?? "") === "1";
    const isExternal = String(formData.get("isExternal") ?? "") === "1";
    const dependsOn = (formData.getAll("dependsOn") ?? [])
      .map((entry) => Number(entry))
      .filter((id) => Number.isFinite(id) && id > 0 && id !== stepId);
    const checklistGroups = formData.has("checklistGroups")
      ? parseChecklistGroupsInput(String(formData.get("checklistGroups") ?? ""))
      : null;
    const customerMessageTemplate =
      String(formData.get("customerMessageTemplate") ?? "").trim() || null;

    if (!stepId || !templateId || !name || !Roles.includes(ownerRole)) {
      redirect(`/workflows/${templateId}?error=invalid`);
    }

    const existingStep = checklistGroups
      ? null
      : (await listTemplateSteps(templateId)).find((step) => step.id === stepId);
    if (!checklistGroups && !existingStep) {
      redirect(`/workflows/${templateId}?error=invalid`);
    }
    const resolvedChecklistGroups =
      checklistGroups ?? parseChecklistGroupsJson(existingStep!.checklist_groups_json);

    await updateTemplateStep({
      stepId,
      name,
      ownerRole,
      requiredDocumentTypes: requiredDocs,
      fieldSchemaJson: JSON.stringify(fieldSchema),
      slaHours: Number.isFinite(slaHours) ? slaHours : null,
      customerVisible: isExternal ? true : customerVisible,
      isExternal,
      checklistGroups: resolvedChecklistGroups,
      dependsOnStepIds: dependsOn,
      customerCompletionMessageTemplate: customerMessageTemplate,
    });
    redirect(`/workflows/${templateId}`);
  }

  async function moveStepAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const templateId = Number(formData.get("templateId") ?? 0);
    const stepId = Number(formData.get("stepId") ?? 0);
    const dir = String(formData.get("dir") ?? "");
    if (!templateId || !stepId || (dir !== "up" && dir !== "down")) {
      redirect(`/workflows/${templateId}?error=invalid`);
    }
    await moveTemplateStep({ templateId, stepId, dir });
    redirect(`/workflows/${templateId}`);
  }

  async function deleteStepAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const templateId = Number(formData.get("templateId") ?? 0);
    const stepId = Number(formData.get("stepId") ?? 0);
    if (!templateId || !stepId) redirect(`/workflows/${templateId}?error=invalid`);
    await deleteTemplateStep(stepId);
    redirect(`/workflows/${templateId}`);
  }

  async function addSubworkflowAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const templateId = Number(formData.get("templateId") ?? 0);
    const subworkflowTemplateId = Number(
      formData.get("subworkflowTemplateId") ?? 0,
    );
    if (!templateId || !subworkflowTemplateId) {
      redirect(`/workflows/${templateId}?error=invalid`);
    }
    await addSubworkflowSteps({
      templateId,
      subworkflowTemplateId,
    });
    redirect(`/workflows/${templateId}`);
  }

  async function deleteStepGroupAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const templateId = Number(formData.get("templateId") ?? 0);
    const groupId = String(formData.get("groupId") ?? "").trim();
    if (!templateId || !groupId) redirect(`/workflows/${templateId}?error=invalid`);
    await deleteTemplateStepGroup({ templateId, groupId });
    redirect(`/workflows/${templateId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-zinc-500">
          <Link href="/workflows" className="hover:underline">
            Workflows
          </Link>{" "}
          <span className="text-zinc-400">/</span> Template
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {template.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Configure steps and ownership.
            </p>
          </div>
          <Link
            href="/workflows/rules"
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Template rules
          </Link>
        </div>
      </div>

      {error === "in_use" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Cannot delete this workflow because shipments are assigned to it.
        </div>
      ) : null}
      {error === "subworkflow_in_use" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Cannot delete this workflow because it is used as a subworkflow.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Template</h2>
          <form action={updateTemplateAction} className="mt-4 space-y-3">
            <input type="hidden" name="id" value={template.id} />
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">Name</div>
              <input
                name="name"
                defaultValue={template.name}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">
                Description
              </div>
              <textarea
                name="description"
                defaultValue={template.description ?? ""}
                className="min-h-28 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  name="isSubworkflow"
                  value="1"
                  defaultChecked={!!template.is_subworkflow}
                />
                Mark as subworkflow
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  name="isArchived"
                  value="1"
                  defaultChecked={!!template.is_archived}
                />
                Archive template
              </label>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-zinc-800">
                Workflow variables
              </div>
              <GlobalVariablesBuilder
                name="globalVariablesJson"
                initialVariables={globalVariables}
              />
              <div className="mt-1 text-xs text-zinc-500">
                Use these values in step fields for countdowns and comparisons.
              </div>
            </div>
            <SubmitButton
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              pendingLabel="Saving..."
            >
              Save template
            </SubmitButton>
          </form>
          <form action={deleteTemplateAction} className="mt-4 space-y-2">
            <input type="hidden" name="templateId" value={template.id} />
            <SubmitButton
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              pendingLabel="Deleting..."
            >
              Delete template
            </SubmitButton>
            <div className="text-xs text-zinc-500">
              Delete is blocked if the workflow is assigned to shipments or used as a subworkflow.
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Add step</h2>
          <form action={addStepAction} className="mt-4 space-y-3">
            <input type="hidden" name="templateId" value={template.id} />
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">
                Step name
              </div>
              <input
                name="name"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder="Customs clearance"
                required
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  Owner role
                </div>
                <select
                  name="ownerRole"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  defaultValue="OPERATIONS"
                  required
                >
                  {Roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  SLA (hours)
                </div>
                <input
                  name="slaHours"
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="24"
                />
              </label>
            </div>
            <StepVisibilityToggle />
            {steps.length ? (
              <div>
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  Depends on steps
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {steps.map((step) => (
                    <label
                      key={`add-dep-${step.id}`}
                      className="flex items-center gap-2 text-sm text-zinc-700"
                    >
                      <input
                        type="checkbox"
                        name="dependsOn"
                        value={step.id}
                      />
                      {step.sort_order}. {step.name}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <div className="mb-1 text-sm font-medium text-zinc-800">
                Step fields
              </div>
              <StepFieldBuilder
                name="fieldSchema"
                initialSchema={{ version: 1, fields: [] }}
                globalVariables={globalVariables}
                externalBooleanOptions={externalBooleanOptions}
              />
            </div>
            <SubmitButton
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              pendingLabel="Adding..."
            >
              Add step
            </SubmitButton>
          </form>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Subworkflow</h2>
          {subworkflows.length ? (
            <form action={addSubworkflowAction} className="mt-4 space-y-3">
              <input type="hidden" name="templateId" value={template.id} />
              <label className="block">
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  Add subworkflow
                </div>
                <select
                  name="subworkflowTemplateId"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select subworkflow...</option>
                  {subworkflows.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                pendingLabel="Adding..."
              >
                Add subworkflow
              </SubmitButton>
            </form>
          ) : (
            <div className="mt-4 text-sm text-zinc-500">
              No subworkflow templates available.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-900">Steps</h2>
          <div className="text-xs text-zinc-500">
            Reorder with the Up and Down buttons, edit and save each step.
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {steps.map((s) => {
            const requiredDocs = new Set(parseRequiredDocumentTypes(s));
            const schemaFromStep = parseStepFieldSchema(s.field_schema_json);
            const legacyFields = parseRequiredFields(s);
            const dependsOn = new Set(parseDependsOn(s.depends_on_step_ids_json));
            const stepSchema =
              schemaFromStep.fields.length > 0
                ? schemaFromStep
                : legacyFields.length
                  ? schemaFromLegacyFields(legacyFields)
                  : schemaFromStep;
            return (
              <details
                key={s.id}
                className="rounded-xl border border-zinc-200 bg-white"
                open
              >
                <summary className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 cursor-pointer">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">
                      #{s.sort_order} {s.name}
                    </div>
                    {s.group_label ? (
                      <div className="mt-1 text-xs text-zinc-500">
                        Group: {s.group_label}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Owner: {s.owner_role}
                  </div>
                </summary>

                <div className="border-t border-zinc-100 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-zinc-500">Actions</div>
                    <div className="flex items-center gap-2">
                      <form action={moveStepAction}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <input type="hidden" name="stepId" value={s.id} />
                        <input type="hidden" name="dir" value="up" />
                        <SubmitButton
                          className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          pendingLabel="Moving..."
                        >
                          Up
                        </SubmitButton>
                      </form>
                      <form action={moveStepAction}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <input type="hidden" name="stepId" value={s.id} />
                        <input type="hidden" name="dir" value="down" />
                        <SubmitButton
                          className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          pendingLabel="Moving..."
                        >
                          Down
                        </SubmitButton>
                      </form>
                      <form action={deleteStepAction}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <input type="hidden" name="stepId" value={s.id} />
                        <SubmitButton
                          className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          pendingLabel="Deleting..."
                        >
                          Delete
                        </SubmitButton>
                      </form>
                      {s.group_id ? (
                        <form action={deleteStepGroupAction}>
                          <input type="hidden" name="templateId" value={template.id} />
                          <input type="hidden" name="groupId" value={s.group_id} />
                          <SubmitButton
                            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                            pendingLabel="Removing..."
                          >
                            Remove group
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <form action={updateStepAction} className="mt-3 space-y-3">
                    <input type="hidden" name="templateId" value={template.id} />
                    <input type="hidden" name="stepId" value={s.id} />
                  <label className="block">
                    <div className="mb-1 text-sm font-medium text-zinc-800">
                      Step name
                    </div>
                    <input
                      name="name"
                      defaultValue={s.name}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      required
                    />
                  </label>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <label className="block">
                      <div className="mb-1 text-sm font-medium text-zinc-800">
                        Owner role
                      </div>
                      <select
                        name="ownerRole"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                        defaultValue={s.owner_role}
                        required
                      >
                        {Roles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <div className="mb-1 text-sm font-medium text-zinc-800">
                        SLA (hours)
                      </div>
                      <input
                        name="slaHours"
                        type="number"
                        min={0}
                        defaultValue={s.sla_hours ?? ""}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      />
                    </label>

                  </div>
                  <StepVisibilityToggle
                    defaultIsExternal={!!s.is_external}
                    defaultCustomerVisible={!!s.customer_visible}
                  />

                  <div className="space-y-3">
                    {steps.length > 1 ? (
                      <div>
                        <div className="mb-1 text-sm font-medium text-zinc-800">
                          Depends on steps
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {steps
                            .filter((step) => step.id !== s.id)
                            .map((step) => (
                              <label
                                key={`dep-${s.id}-${step.id}`}
                                className="flex items-center gap-2 text-sm text-zinc-700"
                              >
                                <input
                                  type="checkbox"
                                  name="dependsOn"
                                  value={step.id}
                                  defaultChecked={dependsOn.has(step.id)}
                                />
                                {step.sort_order}. {step.name}
                              </label>
                            ))}
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <div className="mb-1 text-sm font-medium text-zinc-800">
                        Step fields
                      </div>
                      <StepFieldBuilder
                        name="fieldSchema"
                        initialSchema={stepSchema}
                        globalVariables={globalVariables}
                        externalBooleanOptions={buildExternalBooleanOptions(steps, s.id)}
                      />
                    </div>

                    <label className="block">
                      <div className="mb-1 text-sm font-medium text-zinc-800">
                        Customer completion message template
                      </div>
                      <input
                        name="customerMessageTemplate"
                        defaultValue={s.customer_completion_message_template ?? ""}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                        placeholder="Step completed: {{step}}"
                      />
                    </label>
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-medium text-zinc-800">
                      Required documents
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {DocumentTypes.map((dt) => (
                        <label
                          key={dt}
                          className="flex items-center gap-2 text-sm text-zinc-700"
                        >
                          <input
                            type="checkbox"
                            name="requiredDocs"
                            value={dt}
                            defaultChecked={requiredDocs.has(dt)}
                          />
                          {dt}
                        </label>
                      ))}
                    </div>
                  </div>

                    <SubmitButton
                      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                      pendingLabel="Saving..."
                    >
                      Save step
                    </SubmitButton>
                  </form>
                </div>
              </details>
            );
          })}

          {steps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
              Add your first step.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
