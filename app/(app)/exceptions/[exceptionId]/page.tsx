import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import {
  addExceptionPlaybookTask,
  deleteExceptionPlaybookTask,
  getExceptionType,
  listExceptionPlaybookTasks,
  updateExceptionPlaybookTask,
  updateExceptionType,
} from "@/lib/data/exceptions";
import { Roles, ShipmentRisks, riskLabel, type ShipmentRisk } from "@/lib/domain";

export default async function ExceptionDetailsPage({
  params,
}: {
  params: Promise<{ exceptionId: string }>;
}) {
  await requireAdmin();
  const { exceptionId } = await params;
  const exception = await getExceptionType(Number(exceptionId));
  if (!exception) redirect("/exceptions");

  const tasks = await listExceptionPlaybookTasks(exception.id);

  async function updateExceptionAction(formData: FormData) {
    "use server";
    const user = await requireAdmin();

    const id = Number(formData.get("id") ?? 0);
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const defaultRisk = String(formData.get("defaultRisk") ?? "") as ShipmentRisk;
    const customerMessageTemplate =
      String(formData.get("customerMessageTemplate") ?? "").trim() || null;
    const isArchived = String(formData.get("isArchived") ?? "") === "1";

    if (!id || !name || !ShipmentRisks.includes(defaultRisk)) {
      redirect(`/exceptions/${id}?error=invalid`);
    }

    await updateExceptionType({
      id,
      name,
      description,
      defaultRisk,
      customerMessageTemplate,
      isArchived,
      updatedByUserId: user.id,
    });

    redirect(`/exceptions/${id}`);
  }

  async function addPlaybookTaskAction(formData: FormData) {
    "use server";
    await requireAdmin();

    const exceptionTypeId = Number(formData.get("exceptionTypeId") ?? 0);
    const title = String(formData.get("title") ?? "").trim();
    const ownerRole = String(formData.get("ownerRole") ?? "").trim();
    const dueHoursRaw = String(formData.get("dueHours") ?? "").trim();
    const dueHours = dueHoursRaw ? Number(dueHoursRaw) : null;

    if (!exceptionTypeId || !title || !ownerRole) {
      redirect(`/exceptions/${exceptionTypeId}?error=invalid`);
    }

    await addExceptionPlaybookTask({
      exceptionTypeId,
      title,
      ownerRole,
      dueHours: Number.isFinite(dueHours) ? dueHours : null,
    });

    redirect(`/exceptions/${exceptionTypeId}`);
  }

  async function updatePlaybookTaskAction(formData: FormData) {
    "use server";
    await requireAdmin();

    const exceptionTypeId = Number(formData.get("exceptionTypeId") ?? 0);
    const taskId = Number(formData.get("taskId") ?? 0);
    const title = String(formData.get("title") ?? "").trim();
    const ownerRole = String(formData.get("ownerRole") ?? "").trim();
    const dueHoursRaw = String(formData.get("dueHours") ?? "").trim();
    const dueHours = dueHoursRaw ? Number(dueHoursRaw) : null;

    if (!exceptionTypeId || !taskId || !title || !ownerRole) {
      redirect(`/exceptions/${exceptionTypeId}?error=invalid`);
    }

    await updateExceptionPlaybookTask({
      taskId,
      title,
      ownerRole,
      dueHours: Number.isFinite(dueHours) ? dueHours : null,
    });

    redirect(`/exceptions/${exceptionTypeId}`);
  }

  async function deletePlaybookTaskAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const exceptionTypeId = Number(formData.get("exceptionTypeId") ?? 0);
    const taskId = Number(formData.get("taskId") ?? 0);
    if (!exceptionTypeId || !taskId) redirect(`/exceptions/${exceptionTypeId}`);
    await deleteExceptionPlaybookTask(taskId);
    redirect(`/exceptions/${exceptionTypeId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-zinc-500">
          <Link href="/exceptions" className="hover:underline">
            Exceptions
          </Link>{" "}
          <span className="text-zinc-400">/</span> Type
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {exception.name}
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Exception</h2>
          <form action={updateExceptionAction} className="mt-4 space-y-3">
            <input type="hidden" name="id" value={exception.id} />
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">Name</div>
              <input
                name="name"
                defaultValue={exception.name}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">
                Default risk
              </div>
              <select
                name="defaultRisk"
                defaultValue={exception.default_risk}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              >
                {ShipmentRisks.filter((r) => r !== "ON_TRACK").map((r) => (
                  <option key={r} value={r}>
                    {riskLabel(r)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">
                Description
              </div>
              <textarea
                name="description"
                defaultValue={exception.description ?? ""}
                className="min-h-28 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">
                Customer message template
              </div>
              <input
                name="customerMessageTemplate"
                defaultValue={exception.customer_message_template ?? ""}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                name="isArchived"
                value="1"
                defaultChecked={!!exception.is_archived}
              />
              Archive exception
            </label>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Save
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Add playbook task</h2>
          <form action={addPlaybookTaskAction} className="mt-4 space-y-3">
            <input type="hidden" name="exceptionTypeId" value={exception.id} />
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">Title</div>
              <input
                name="title"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder="Ask customer for missing invoice"
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
                  Due in (hours)
                </div>
                <input
                  name="dueHours"
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="24"
                />
              </label>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Add task
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Playbook tasks</h2>
        <div className="mt-4 space-y-3">
          {tasks.map((t) => (
            <div key={t.id} className="rounded-xl border border-zinc-200 p-4">
              <form action={updatePlaybookTaskAction} className="space-y-3">
                <input type="hidden" name="exceptionTypeId" value={exception.id} />
                <input type="hidden" name="taskId" value={t.id} />
                <label className="block">
                  <div className="mb-1 text-xs font-medium text-zinc-600">Title</div>
                  <input
                    name="title"
                    defaultValue={t.title}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    required
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <div className="mb-1 text-xs font-medium text-zinc-600">
                      Owner role
                    </div>
                    <select
                      name="ownerRole"
                      defaultValue={t.owner_role}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
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
                    <div className="mb-1 text-xs font-medium text-zinc-600">
                      Due in (hours)
                    </div>
                    <input
                      name="dueHours"
                      type="number"
                      min={0}
                      defaultValue={t.due_hours ?? ""}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Save
                  </button>
                </div>
              </form>

              <form action={deletePlaybookTaskAction} className="mt-2">
                <input type="hidden" name="exceptionTypeId" value={exception.id} />
                <input type="hidden" name="taskId" value={t.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </form>
            </div>
          ))}

          {tasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
              No playbook tasks yet.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
