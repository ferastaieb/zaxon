import Link from "next/link";
import { redirect } from "next/navigation";

import { GlobalVariablesBuilder } from "@/components/workflows/GlobalVariablesBuilder";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { requireAdmin } from "@/lib/auth";
import { createWorkflowTemplate } from "@/lib/data/workflows";
import { parseWorkflowGlobalVariables } from "@/lib/workflowGlobals";

export default async function NewWorkflowTemplatePage() {
  await requireAdmin();

  async function createTemplateAction(formData: FormData) {
    "use server";
    const user = await requireAdmin();
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const isSubworkflow = String(formData.get("isSubworkflow") ?? "") === "1";
    const globalsRaw = String(formData.get("globalVariablesJson") ?? "");
    const globals = parseWorkflowGlobalVariables(globalsRaw);
    if (!name) redirect("/workflows/new?error=invalid");
    const id = await createWorkflowTemplate({
      name,
      description,
      isSubworkflow,
      globalVariablesJson: JSON.stringify(globals),
      createdByUserId: user.id,
    });
    redirect(`/workflows/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="text-sm text-zinc-500">
          <Link href="/workflows" className="hover:underline">
            Workflows
          </Link>{" "}
          <span className="text-zinc-400">/</span> New
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          New workflow template
        </h1>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <form action={createTemplateAction} className="space-y-4">
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">Name</div>
            <input
              name="name"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Sea FCL Standard"
              required
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              Description
            </div>
            <textarea
              name="description"
              className="min-h-28 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="When to use this template..."
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" name="isSubworkflow" value="1" />
            Mark as subworkflow
          </label>
          <div>
            <div className="mb-2 text-sm font-medium text-zinc-800">
              Workflow variables
            </div>
            <GlobalVariablesBuilder
              name="globalVariablesJson"
              initialVariables={[]}
            />
            <div className="mt-1 text-xs text-zinc-500">
              Variables are named values you can reference in step fields for countdowns and rules.
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SubmitButton
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              pendingLabel="Creating..."
            >
              Create template
            </SubmitButton>
            <Link
              href="/workflows"
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
