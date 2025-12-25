"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { CopyField } from "@/components/ui/CopyField";
import {
    overallStatusLabel,
    riskLabel,
    stepStatusLabel,
    taskStatusLabel,
    transportModeLabel,
    type StepStatus,
    type TaskStatus,
    type ShipmentOverallStatus,
    type ShipmentRisk,
} from "@/lib/domain";
import {
    collectMissingFieldPaths,
    decodeFieldPath,
    describeFieldPath,
    encodeFieldPath,
    fieldInputName,
    fieldRemovalName,
    parseStepFieldDocType,
    parseStepFieldSchema,
    parseStepFieldValues,
    schemaFromLegacyFields,
    stepFieldDocType,
    type StepFieldDefinition,
    type StepFieldSchema,
    type StepFieldValues,
} from "@/lib/stepFields";
import type { WorkflowGlobalVariable, WorkflowGlobalValues } from "@/lib/workflowGlobals";
import {
    addCommentAction,
    addShipmentJobIdsAction,
    addShipmentGoodAction,
    createGoodAction,
    createTaskAction,
    deleteShipmentAction,
    deleteShipmentGoodAction,
    logExceptionAction,
    removeShipmentJobIdAction,
    requestDocumentAction,
    resolveExceptionAction,
    updateWorkflowGlobalsAction,
    updateDocumentFlagsAction,
    updateStepAction,
    updateTaskStatusAction,
    uploadDocumentAction,
} from "./actions";

// Types (imported from lib/data/... or defined here if simple)
// Ideally these should be imported from the source, but for now I'll define interfaces matching the data passed
// to avoid complex import chains if they are not fully exported or if they are database rows.

interface ShipmentViewProps {
    user: any; // Replace with actual User type
    shipment: any; // Replace with ShipmentRow & { customer_names: string | null }
    shipmentCustomers: any[];
    shipmentGoods: any[];
    goods: any[];
    inventoryBalances: any[];
    inventoryTransactions: any[];
    steps: any[];
    internalSteps: any[];
    trackingSteps: any[];
    jobIds: any[];
    tasks: any[];
    docs: any[];
    docRequests: any[];
    exceptions: any[];
    exceptionTypes: any[];
    activities: any[];
    trackingToken: string | null;
    activeUsers: any[];
    customers: any[];
    suppliers: any[];
    brokers: any[];

    // Computed/Derived state passed from server
    mySteps: any[];
    myTasks: any[];
    blockingExceptions: any[];
    workflowBlocked: boolean;
    primaryBlockingException: any;
    receivedDocTypes: string[];
    openDocRequestTypes: string[];
    latestReceivedDocByType: Record<string, any>;
    workflowGlobals: WorkflowGlobalVariable[];
    workflowGlobalValues: WorkflowGlobalValues;

    // Search params / Errors
    error: string | null;
    errorStepId: number | null;
}

function riskTone(risk: string) {
    if (risk === "BLOCKED") return "red";
    if (risk === "AT_RISK") return "yellow";
    return "green";
}

function stepTone(status: StepStatus) {
    if (status === "DONE") return "green";
    if (status === "IN_PROGRESS") return "blue";
    if (status === "BLOCKED") return "red";
    return "zinc";
}

function taskTone(status: TaskStatus) {
    if (status === "DONE") return "green";
    if (status === "IN_PROGRESS") return "blue";
    if (status === "BLOCKED") return "red";
    return "zinc";
}

export default function ShipmentView(props: ShipmentViewProps) {
    const {
        user,
        shipment,
        shipmentCustomers,
        shipmentGoods,
        goods,
        inventoryBalances,
        inventoryTransactions,
        steps,
        internalSteps,
        trackingSteps,
        jobIds,
        tasks,
        docs,
        docRequests,
        exceptions,
        exceptionTypes,
        activities,
        trackingToken,
        activeUsers,
        customers,
        suppliers,
        brokers,
        mySteps,
        myTasks,
        blockingExceptions,
        workflowBlocked,
        primaryBlockingException,
        receivedDocTypes,
        openDocRequestTypes,
        latestReceivedDocByType,
        workflowGlobals,
        workflowGlobalValues,
        error,
        errorStepId,
    } = props;

    const [activeTab, setActiveTab] = useState<"overview" | "workflow" | "goods" | "tasks" | "documents" | "exceptions" | "activity">("overview");

    const canEdit = ["ADMIN", "OPERATIONS", "CLEARANCE", "SALES"].includes(user.role);
    const canDelete = user.role === "ADMIN";
    const trackingLink = trackingToken ? `/track/${trackingToken}` : "-";
    const customerLabel =
        shipmentCustomers.length > 0
            ? shipmentCustomers.map((c: any) => c.name).join(", ")
            : shipment.customer_names ?? "-";

    // Helper to check if a doc type is received (using the array passed from server)
    const isDocReceived = (type: string) => receivedDocTypes.includes(type);
    const isDocRequested = (type: string) => openDocRequestTypes.includes(type);

    const stepSchemaById = useMemo(() => {
        const map = new Map<number, StepFieldSchema>();
        for (const s of steps) {
            map.set(s.id, getStepFieldSchema(s));
        }
        return map;
    }, [steps]);

    const stepById = useMemo(() => {
        return new Map<number, any>(steps.map((s) => [s.id, s]));
    }, [steps]);

    const formatDocumentType = (docType: string) => {
        const parsed = parseStepFieldDocType(docType);
        if (!parsed) return docType;
        const step = stepById.get(parsed.stepId);
        if (!step) return docType;
        const schema = stepSchemaById.get(parsed.stepId);
        if (!schema) return docType;
        const segments = decodeFieldPath(parsed.path);
        const label = describeFieldPath(schema, segments);
        if (!label) return `${step.name} / ${docType}`;
        return `${step.name} / ${label}`;
    };

    return (
        <div className="min-h-screen bg-zinc-50/50 pb-20">
            {/* Header Section */}
            <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 px-6 py-4 backdrop-blur-md">
                <div className="mx-auto max-w-6xl">
                    <div className="mb-2 text-sm text-zinc-500">
                        <Link href="/shipments" className="hover:text-zinc-900 hover:underline">
                            Shipments
                        </Link>{" "}
                        <span className="text-zinc-300">/</span> {shipment.shipment_code}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
                                {shipment.shipment_code}
                            </h1>
                            <div className="mt-1 flex items-center gap-2 text-sm text-zinc-600">
                                <span className="font-medium text-zinc-900">{customerLabel}</span>
                                <span className="text-zinc-300">•</span>
                                <span>{transportModeLabel(shipment.transport_mode)}</span>
                                <span className="text-zinc-300">•</span>
                                <span>{shipment.origin} → {shipment.destination}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Badge tone="zinc">{overallStatusLabel(shipment.overall_status)}</Badge>
                            <Badge tone={riskTone(shipment.risk)}>{riskLabel(shipment.risk)}</Badge>
                            {canDelete ? (
                                <form action={deleteShipmentAction.bind(null, shipment.id)}>
                                    <button
                                        type="submit"
                                        onClick={(event) => {
                                            if (!window.confirm("Delete this shipment? This cannot be undone.")) {
                                                event.preventDefault();
                                            }
                                        }}
                                        className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                                    >
                                        Delete
                                    </button>
                                </form>
                            ) : null}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="mt-6 flex items-center gap-1 overflow-x-auto pb-1">
                        {[
                            { id: "overview", label: "Overview" },
                            { id: "workflow", label: "Workflow" },
                            { id: "goods", label: "Goods", count: shipmentGoods.length },
                            { id: "tasks", label: "Tasks", count: myTasks.length > 0 ? myTasks.length : undefined },
                            { id: "documents", label: "Documents", count: docs.length },
                            { id: "exceptions", label: "Exceptions", count: exceptions.length, alert: exceptions.some((e: any) => e.status === "OPEN") },
                            { id: "activity", label: "Activity" },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${activeTab === tab.id
                                    ? "bg-zinc-100 text-zinc-900"
                                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                                    }`}
                            >
                                {tab.label}
                                {tab.count !== undefined && (
                                    <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] ${tab.alert ? "bg-red-100 text-red-700" : "bg-zinc-200 text-zinc-600"
                                        }`}>
                                        {tab.count}
                                    </span>
                                )}
                                {activeTab === tab.id && (
                                    <div className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-zinc-900" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-6xl px-6 py-8">
                {/* Error Banners */}
                <div className="mb-6 space-y-4">
                    {error === "missing_requirements" && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
                            Can’t mark the step as done yet. Fill the required fields and ensure required documents are received.
                        </div>
                    )}
                    {error === "blocked_by_exception" && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
                            Workflow is blocked by an open exception. Resolve the exception to continue updating shipment steps.
                        </div>
                    )}
                    {error === "exception_tasks_open" && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
                            Complete the exception steps before resolving the exception.
                        </div>
                    )}
                    {error === "goods_allocated" && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
                            Cannot delete this goods line because allocations were already applied.
                        </div>
                    )}
                    {workflowBlocked && primaryBlockingException && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
                            Workflow blocked by <span className="font-medium">{primaryBlockingException.exception_name}</span>.{" "}
                            <button onClick={() => setActiveTab("exceptions")} className="font-medium underline hover:text-red-800">
                                View exception
                            </button>
                        </div>
                    )}
                </div>

                {/* Tab Content */}
                <div className="space-y-6">
                    {activeTab === "overview" && (
                        <div className="grid gap-6 lg:grid-cols-3">
                            <div className="space-y-6 lg:col-span-2">
                                {/* Your Work Section */}
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h2 className="text-base font-semibold text-zinc-900">Your Work</h2>
                                    <p className="mt-1 text-sm text-zinc-500">Steps and tasks assigned to you.</p>

                                    <div className="mt-6 space-y-6">
                                        <div>
                                            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Your Steps</h3>
                                            <div className="mt-3 space-y-3">
                                                {mySteps.map((s) => (
                                                    <div key={s.id} className="group relative rounded-xl border border-zinc-200 bg-white p-4 transition-all hover:border-zinc-300 hover:shadow-md">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <div className="font-medium text-zinc-900">{s.sortOrder}. {s.name}</div>
                                                                <div className="mt-1 text-xs text-zinc-500">
                                                                    {s.dueAt ? `Due: ${new Date(s.dueAt).toLocaleString()}` : "No due date"}
                                                                </div>
                                                            </div>
                                                            <Badge tone={stepTone(s.status)}>{stepStatusLabel(s.status)}</Badge>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setActiveTab("workflow");
                                                                // Ideally scroll to step
                                                                setTimeout(() => document.getElementById(`step-${s.id}`)?.scrollIntoView({ behavior: 'smooth' }), 100);
                                                            }}
                                                            className="absolute inset-0 rounded-xl ring-inset focus:ring-2 focus:ring-zinc-900"
                                                        />
                                                    </div>
                                                ))}
                                                {mySteps.length === 0 && (
                                                    <div className="text-sm text-zinc-500 italic">No steps assigned to your role.</div>
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Your Tasks</h3>
                                            <div className="mt-3 space-y-3">
                                                {myTasks.map((t) => (
                                                    <div key={t.id} className="group relative rounded-xl border border-zinc-200 bg-white p-4 transition-all hover:border-zinc-300 hover:shadow-md">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div>
                                                                <div className="font-medium text-zinc-900">{t.title}</div>
                                                                <div className="mt-1 text-xs text-zinc-500">
                                                                    {t.due_at ? `Due: ${new Date(t.due_at).toLocaleDateString()}` : "No due date"}
                                                                </div>
                                                            </div>
                                                            <Badge tone={taskTone(t.status)}>{taskStatusLabel(t.status)}</Badge>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setActiveTab("tasks");
                                                                setTimeout(() => document.getElementById(`task-${t.id}`)?.scrollIntoView({ behavior: 'smooth' }), 100);
                                                            }}
                                                            className="absolute inset-0 rounded-xl ring-inset focus:ring-2 focus:ring-zinc-900"
                                                        />
                                                    </div>
                                                ))}
                                                {myTasks.length === 0 && (
                                                    <div className="text-sm text-zinc-500 italic">No open tasks assigned to you.</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Quick Stats / Timeline Preview */}
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h2 className="text-base font-semibold text-zinc-900">Timeline Preview</h2>
                                    <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2">
                                        {internalSteps.map((s) => (
                                            <div key={s.id} className={`flex h-2 flex-1 rounded-full ${s.status === "DONE" ? "bg-green-500" :
                                                s.status === "IN_PROGRESS" ? "bg-blue-500" :
                                                    s.status === "BLOCKED" ? "bg-red-500" : "bg-zinc-200"
                                                }`} title={`${s.name}: ${stepStatusLabel(s.status)}`} />
                                        ))}
                                    </div>
                                    <div className="mt-2 text-right">
                                        <button onClick={() => setActiveTab("workflow")} className="text-sm font-medium text-zinc-900 hover:underline">
                                            View full workflow →
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {/* Quick Info */}
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h2 className="text-base font-semibold text-zinc-900">Quick Info</h2>
                                    <dl className="mt-4 space-y-3 text-sm">
                                        <div className="flex justify-between">
                                            <dt className="text-zinc-500">Cargo</dt>
                                            <dd className="font-medium text-zinc-900">{shipment.cargo_description}</dd>
                                        </div>
                                        <div className="flex justify-between">
                                            <dt className="text-zinc-500">Packages</dt>
                                            <dd className="font-medium text-zinc-900">{shipment.packages_count ?? "—"}</dd>
                                        </div>
                                        <div className="flex justify-between">
                                            <dt className="text-zinc-500">Weight</dt>
                                            <dd className="font-medium text-zinc-900">{shipment.weight_kg ? `${shipment.weight_kg} kg` : "—"}</dd>
                                        </div>
                                        <div className="flex justify-between">
                                            <dt className="text-zinc-500">Container</dt>
                                            <dd className="font-medium text-zinc-900">{shipment.container_number ?? "—"}</dd>
                                        </div>
                                        <div className="flex justify-between">
                                            <dt className="text-zinc-500">B/L</dt>
                                            <dd className="font-medium text-zinc-900">{shipment.bl_number ?? "—"}</dd>
                                        </div>
                                    </dl>
                                </div>

                                {/* Tracking Link */}
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h2 className="text-base font-semibold text-zinc-900">Customer Tracking</h2>
                                    <div className="mt-4">
                                        <CopyField value={trackingLink} />
                                        <p className="mt-2 text-xs text-zinc-500">Share this link with the customer.</p>
                                    </div>
                                </div>

                                {/* Job IDs */}
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h2 className="text-base font-semibold text-zinc-900">Job IDs</h2>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {jobIds.map((j) => (
                                            <div key={j.id} className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-sm">
                                                <span>{j.job_id}</span>
                                                {canEdit && (
                                                    <form action={removeShipmentJobIdAction.bind(null, shipment.id)}>
                                                        <input type="hidden" name="jobIdId" value={j.id} />
                                                        <button type="submit" className="text-zinc-400 hover:text-red-600">×</button>
                                                    </form>
                                                )}
                                            </div>
                                        ))}
                                        {jobIds.length === 0 && <span className="text-sm text-zinc-500">—</span>}
                                    </div>
                                    {canEdit && (
                                        <form action={addShipmentJobIdsAction.bind(null, shipment.id)} className="mt-4">
                                            <div className="flex gap-2">
                                                <input name="jobIds" placeholder="Add ID..." className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
                                                <button type="submit" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800">Add</button>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "workflow" && (
                        <div className="space-y-8">
                            {workflowGlobals.length ? (
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h3 className="text-base font-semibold text-zinc-900">
                                        Workflow variables
                                    </h3>
                                    <form
                                        action={updateWorkflowGlobalsAction.bind(null, shipment.id)}
                                        className="mt-4 space-y-4"
                                    >
                                        <div className="grid gap-4 md:grid-cols-2">
                                            {workflowGlobals.map((variable) => (
                                                <label key={variable.id} className="block">
                                                    <div className="mb-1 text-sm font-medium text-zinc-800">
                                                        {variable.label}
                                                    </div>
                                                    <input
                                                        name={`global:${variable.id}`}
                                                        defaultValue={workflowGlobalValues[variable.id] ?? ""}
                                                        type={variable.type === "date" ? "date" : variable.type === "number" ? "number" : "text"}
                                                        disabled={!canEdit}
                                                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={!canEdit}
                                            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                                        >
                                            Save variables
                                        </button>
                                    </form>
                                </div>
                            ) : null}

                            {/* Internal Steps */}
                            <div>
                                <h3 className="mb-4 text-lg font-semibold text-zinc-900">Internal Workflow</h3>
                                <div className="space-y-4">
                                    {internalSteps.map((s) => (
                                        // This would be the complex step card rendering logic
                                        // For brevity, I'll need to copy the renderStepCard logic here or make it a sub-component
                                        // Since I can't easily make it a sub-component without passing tons of props, I'll inline a simplified version
                                        // or ideally, I should have copied the renderStepCard function.
                                        // I will implement a placeholder here and then fill it in with the actual logic in a subsequent edit if needed,
                                        // but to do this properly I should copy the logic.
                                        // Let's try to copy the logic into a helper function inside this component or just inline it.
                                        <StepCard
                                            key={s.id}
                                            step={s}
                                            user={user}
                                            shipment={shipment}
                                            canEdit={canEdit}
                                            workflowBlocked={workflowBlocked}
                                            receivedDocTypes={receivedDocTypes}
                                            openDocRequestTypes={openDocRequestTypes}
                                            latestReceivedDocByType={latestReceivedDocByType}
                                            workflowGlobalValues={workflowGlobalValues}
                                            highlightRequirements={error === "missing_requirements" && errorStepId === s.id}
                                            partiesById={new Map([...customers, ...suppliers, ...brokers].map(p => [p.id, p]))}
                                            customers={customers}
                                            suppliers={suppliers}
                                            brokers={brokers}
                                            shipmentGoods={shipmentGoods}
                                            setActiveTab={setActiveTab}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Tracking Steps */}
                            <div>
                                <h3 className="mb-4 text-lg font-semibold text-zinc-900">Tracking Milestones</h3>
                                <div className="space-y-4">
                                    {trackingSteps.map((s) => (
                                        <StepCard
                                            key={s.id}
                                            step={s}
                                            user={user}
                                            shipment={shipment}
                                            canEdit={canEdit}
                                            workflowBlocked={workflowBlocked}
                                            receivedDocTypes={receivedDocTypes}
                                            openDocRequestTypes={openDocRequestTypes}
                                            latestReceivedDocByType={latestReceivedDocByType}
                                            workflowGlobalValues={workflowGlobalValues}
                                            highlightRequirements={error === "missing_requirements" && errorStepId === s.id}
                                            partiesById={new Map([...customers, ...suppliers, ...brokers].map(p => [p.id, p]))}
                                            customers={customers}
                                            suppliers={suppliers}
                                            brokers={brokers}
                                            shipmentGoods={shipmentGoods}
                                            setActiveTab={setActiveTab}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "goods" && (
                        <div className="grid gap-6 lg:grid-cols-3">
                            <div className="lg:col-span-2 space-y-6">
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="text-lg font-semibold text-zinc-900">Shipment goods</h3>
                                        <div className="text-xs text-zinc-500">Quantities are integers.</div>
                                    </div>
                                    {shipmentGoods.length ? (
                                        <div className="mt-4 overflow-x-auto">
                                            <table className="min-w-full text-left text-sm">
                                                <thead className="text-xs text-zinc-500">
                                                    <tr>
                                                        <th className="py-2 pr-4">Good</th>
                                                        <th className="py-2 pr-4">Origin</th>
                                                        <th className="py-2 pr-4">Quantity</th>
                                                        <th className="py-2 pr-4">Customer</th>
                                                        <th className="py-2 pr-4">Allocation</th>
                                                        <th className="py-2 pr-4"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-100">
                                                    {shipmentGoods.map((sg) => {
                                                        const allocated =
                                                            sg.allocated_at ||
                                                            sg.allocated_quantity > 0 ||
                                                            sg.inventory_quantity > 0;
                                                        return (
                                                            <tr key={sg.id}>
                                                                <td className="py-2 pr-4 font-medium text-zinc-900">
                                                                    {sg.good_name}
                                                                </td>
                                                                <td className="py-2 pr-4 text-zinc-700">
                                                                    {sg.good_origin}
                                                                </td>
                                                                <td className="py-2 pr-4 text-zinc-700">
                                                                    {sg.quantity} {sg.unit_type}
                                                                </td>
                                                                <td className="py-2 pr-4 text-zinc-700">
                                                                    {sg.applies_to_all_customers
                                                                        ? "All customers"
                                                                        : sg.customer_name ?? "-"}
                                                                </td>
                                                                <td className="py-2 pr-4 text-zinc-700">
                                                                    {allocated
                                                                        ? `Taken ${sg.allocated_quantity}, Inventory ${sg.inventory_quantity}`
                                                                        : "Pending"}
                                                                </td>
                                                                <td className="py-2 pr-4 text-right">
                                                                    <form
                                                                        action={deleteShipmentGoodAction.bind(
                                                                            null,
                                                                            shipment.id,
                                                                        )}
                                                                    >
                                                                        <input
                                                                            type="hidden"
                                                                            name="shipmentGoodId"
                                                                            value={sg.id}
                                                                        />
                                                                        <button
                                                                            type="submit"
                                                                            disabled={!canEdit || allocated}
                                                                            className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                                        >
                                                                            Delete
                                                                        </button>
                                                                    </form>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="mt-4 text-sm text-zinc-500">
                                            No goods added to this shipment yet.
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h3 className="text-lg font-semibold text-zinc-900">Inventory balances</h3>
                                    {inventoryBalances.length ? (
                                        <div className="mt-4 space-y-2">
                                            {inventoryBalances.map((b) => (
                                                <div
                                                    key={b.good_id}
                                                    className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                                                >
                                                    <div>
                                                        <div className="font-medium text-zinc-900">{b.good_name}</div>
                                                        <div className="text-xs text-zinc-500">{b.good_origin}</div>
                                                    </div>
                                                    <div className="font-medium text-zinc-900">
                                                        {b.quantity} {b.unit_type}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mt-4 text-sm text-zinc-500">
                                            No inventory balances yet.
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h3 className="text-lg font-semibold text-zinc-900">
                                        Inventory transactions
                                    </h3>
                                    {inventoryTransactions.length ? (
                                        <div className="mt-4 overflow-x-auto">
                                            <table className="min-w-full text-left text-sm">
                                                <thead className="text-xs text-zinc-500">
                                                    <tr>
                                                        <th className="py-2 pr-4">Date</th>
                                                        <th className="py-2 pr-4">Good</th>
                                                        <th className="py-2 pr-4">Customer</th>
                                                        <th className="py-2 pr-4">Direction</th>
                                                        <th className="py-2 pr-4">Quantity</th>
                                                        <th className="py-2 pr-4">Shipment</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-100">
                                                    {inventoryTransactions.map((tx) => (
                                                        <tr key={tx.id}>
                                                            <td className="py-2 pr-4 text-zinc-700">
                                                                {new Date(tx.created_at).toLocaleString()}
                                                            </td>
                                                            <td className="py-2 pr-4 text-zinc-700">
                                                                {tx.good_name} ({tx.good_origin})
                                                            </td>
                                                            <td className="py-2 pr-4 text-zinc-700">
                                                                {tx.customer_party_id
                                                                    ? tx.customer_name ?? "-"
                                                                    : "All customers"}
                                                            </td>
                                                            <td className="py-2 pr-4">
                                                                <Badge tone={tx.direction === "IN" ? "green" : "red"}>
                                                                    {tx.direction}
                                                                </Badge>
                                                            </td>
                                                            <td className="py-2 pr-4 text-zinc-700">
                                                                {tx.quantity} {tx.unit_type}
                                                            </td>
                                                            <td className="py-2 pr-4 text-zinc-700">
                                                                {tx.shipment_code ?? "-"}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="mt-4 text-sm text-zinc-500">
                                            No inventory transactions yet.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h3 className="font-semibold text-zinc-900">Add goods to shipment</h3>
                                    <form
                                        action={addShipmentGoodAction.bind(null, shipment.id)}
                                        className="mt-4 space-y-3"
                                    >
                                        <label className="block">
                                            <div className="mb-1 text-xs font-medium text-zinc-600">Good</div>
                                            <select
                                                name="goodId"
                                                disabled={!canEdit || goods.length === 0}
                                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                                                required
                                            >
                                                <option value="">Select good...</option>
                                                {goods.map((g) => (
                                                    <option key={g.id} value={g.id}>
                                                        {g.name} - {g.origin} ({g.unit_type})
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="block">
                                            <div className="mb-1 text-xs font-medium text-zinc-600">Quantity</div>
                                            <input
                                                name="quantity"
                                                type="number"
                                                min={1}
                                                step={1}
                                                disabled={!canEdit}
                                                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
                                                placeholder="0"
                                                required
                                            />
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-zinc-700">
                                            <input type="checkbox" name="appliesToAllCustomers" value="1" />
                                            Shared for all customers
                                        </label>
                                        <label className="block">
                                            <div className="mb-1 text-xs font-medium text-zinc-600">Customer</div>
                                            <select
                                                name="customerPartyId"
                                                disabled={!canEdit}
                                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                                            >
                                                <option value="">Select customer...</option>
                                                {shipmentCustomers.map((c: any) => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <div className="mt-1 text-xs text-zinc-500">
                                                Leave blank if the line is shared for all customers.
                                            </div>
                                        </label>
                                        <button
                                            type="submit"
                                            disabled={!canEdit || goods.length === 0}
                                            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                                        >
                                            Add goods
                                        </button>
                                    </form>
                                </div>

                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h3 className="font-semibold text-zinc-900">Create good</h3>
                                    <form
                                        action={createGoodAction.bind(null, shipment.id)}
                                        className="mt-4 space-y-3"
                                    >
                                        <label className="block">
                                            <div className="mb-1 text-xs font-medium text-zinc-600">Name</div>
                                            <input
                                                name="name"
                                                disabled={!canEdit}
                                                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
                                                required
                                            />
                                        </label>
                                        <label className="block">
                                            <div className="mb-1 text-xs font-medium text-zinc-600">Origin</div>
                                            <input
                                                name="origin"
                                                disabled={!canEdit}
                                                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
                                                required
                                            />
                                        </label>
                                        <label className="block">
                                            <div className="mb-1 text-xs font-medium text-zinc-600">Unit type</div>
                                            <input
                                                name="unitType"
                                                disabled={!canEdit}
                                                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
                                                placeholder="pallet, kg, box..."
                                                required
                                            />
                                        </label>
                                        <button
                                            type="submit"
                                            disabled={!canEdit}
                                            className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                                        >
                                            Create good
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "tasks" && (
                        <div className="grid gap-6 lg:grid-cols-3">
                            <div className="lg:col-span-2 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-zinc-900">All Tasks</h3>
                                </div>
                                {tasks.map((t) => (
                                    <div key={t.id} id={`task-${t.id}`} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <div className="font-medium text-zinc-900">{t.title}</div>
                                                <div className="mt-1 text-sm text-zinc-500">
                                                    {t.assignee_name ? `Assignee: ${t.assignee_name}` : t.assignee_role ? `Team: ${t.assignee_role}` : "Unassigned"}
                                                    {t.due_at && ` • Due: ${new Date(t.due_at).toLocaleDateString()}`}
                                                </div>
                                            </div>
                                            <Badge tone={taskTone(t.status)}>{taskStatusLabel(t.status)}</Badge>
                                        </div>
                                        <form action={updateTaskStatusAction.bind(null, shipment.id)} className="mt-4 flex gap-2">
                                            <input type="hidden" name="taskId" value={t.id} />
                                            <select name="status" defaultValue={t.status} disabled={!canEdit} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm">
                                                {["OPEN", "IN_PROGRESS", "DONE", "BLOCKED"].map(st => (
                                                    <option key={st} value={st}>{taskStatusLabel(st as TaskStatus)}</option>
                                                ))}
                                            </select>
                                            <button type="submit" disabled={!canEdit} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200">Update</button>
                                        </form>
                                    </div>
                                ))}
                                {tasks.length === 0 && <div className="text-zinc-500">No tasks found.</div>}
                            </div>
                            <div>
                                <div className="sticky top-24 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h3 className="font-semibold text-zinc-900">Create Task</h3>
                                    <form action={createTaskAction.bind(null, shipment.id)} className="mt-4 space-y-3">
                                        <input name="title" placeholder="Task title" required className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
                                        <select name="assignee" className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
                                            <option value="">Unassigned</option>
                                            <optgroup label="Users">
                                                {activeUsers.map(u => <option key={u.id} value={`user:${u.id}`}>{u.name}</option>)}
                                            </optgroup>
                                            <optgroup label="Teams">
                                                <option value="role:OPERATIONS">Operations</option>
                                                <option value="role:CLEARANCE">Clearance</option>
                                            </optgroup>
                                        </select>
                                        <input type="date" name="dueAt" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
                                        <button type="submit" className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Create Task</button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "documents" && (
                        <div id="documents" className="grid gap-6 lg:grid-cols-3">
                            <div className="lg:col-span-2 space-y-4">
                                <h3 className="text-lg font-semibold text-zinc-900">Uploaded Documents</h3>
                                {docs.map((d) => (
                                    <div key={d.id} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                                        <div>
                                            <div className="font-medium text-zinc-900">
                                                {formatDocumentType(String(d.document_type))}
                                            </div>
                                            <div className="text-xs text-zinc-500">{d.file_name} • {new Date(d.uploaded_at).toLocaleDateString()}</div>
                                            <div className="mt-2 flex gap-2">
                                                {d.share_with_customer && <Badge tone="blue">Customer Visible</Badge>}
                                                {d.is_required && <Badge tone="yellow">Required</Badge>}
                                            </div>
                                        </div>
                                        <a href={`/api/documents/${d.id}`} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50">Download</a>
                                    </div>
                                ))}
                                {docs.length === 0 && <div className="text-zinc-500">No documents uploaded.</div>}
                            </div>
                            <div className="space-y-6">
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h3 className="font-semibold text-zinc-900">Upload Document</h3>
                                    <form action={uploadDocumentAction.bind(null, shipment.id)} className="mt-4 space-y-3">
                                        <input type="file" name="file" required className="w-full text-sm text-zinc-500 file:mr-4 file:rounded-full file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-zinc-700 hover:file:bg-zinc-200" />
                                        <select name="documentType" className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
                                            {["INVOICE", "BILL_OF_LADING", "PACKING_LIST", "CERTIFICATE", "CUSTOMS_ENTRY", "OTHER"].map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                        <label className="flex items-center gap-2 text-sm">
                                            <input type="checkbox" name="shareWithCustomer" value="1" /> Share with customer
                                        </label>
                                        <button type="submit" className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Upload</button>
                                    </form>
                                </div>

                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h3 className="font-semibold text-zinc-900">Request Document</h3>
                                    <form action={requestDocumentAction.bind(null, shipment.id)} className="mt-4 space-y-3">
                                        <select name="documentType" className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
                                            {["INVOICE", "BILL_OF_LADING", "PACKING_LIST", "CERTIFICATE", "CUSTOMS_ENTRY", "OTHER"].map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                        <input name="message" placeholder="Message to customer..." className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
                                        <button type="submit" className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Send Request</button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "exceptions" && (
                        <div className="grid gap-6 lg:grid-cols-3">
                            <div className="lg:col-span-2 space-y-4">
                                <h3 className="text-lg font-semibold text-zinc-900">Exceptions History</h3>
                                {exceptions.map((e) => (
                                    <div key={e.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                                        <div className="flex justify-between">
                                            <div>
                                                <div className="font-medium text-zinc-900">{e.exception_name}</div>
                                                <div className="text-sm text-zinc-500">{e.status} • {new Date(e.created_at).toLocaleString()}</div>
                                                {e.notes && <div className="mt-2 text-sm text-zinc-600 bg-zinc-50 p-2 rounded">{e.notes}</div>}
                                            </div>
                                            <Badge tone={riskTone(e.default_risk)}>{riskLabel(e.default_risk)}</Badge>
                                        </div>
                                        {e.status === "OPEN" && canEdit && (
                                            <form action={resolveExceptionAction.bind(null, shipment.id)} className="mt-4">
                                                <input type="hidden" name="exceptionId" value={e.id} />
                                                <button type="submit" className="text-sm font-medium text-blue-600 hover:underline">Mark Resolved</button>
                                            </form>
                                        )}
                                    </div>
                                ))}
                                {exceptions.length === 0 && <div className="text-zinc-500">No exceptions logged.</div>}
                            </div>
                            <div>
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h3 className="font-semibold text-zinc-900">Log Exception</h3>
                                    <form action={logExceptionAction.bind(null, shipment.id)} className="mt-4 space-y-3">
                                        <select name="exceptionTypeId" required className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm">
                                            <option value="">Select type...</option>
                                            {exceptionTypes.map((et) => (
                                                <option key={et.id} value={et.id}>{et.name}</option>
                                            ))}
                                        </select>
                                        <textarea name="notes" placeholder="Internal notes..." className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" rows={3} />
                                        <button type="submit" className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Log Exception</button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "activity" && (
                        <div className="grid gap-6 lg:grid-cols-3">
                            <div className="lg:col-span-2 space-y-4">
                                <h3 className="text-lg font-semibold text-zinc-900">Activity Log</h3>
                                {activities.map((a) => (
                                    <div key={a.id} className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                                        <div className="flex-1">
                                            <div className="text-sm text-zinc-900">{a.message}</div>
                                            <div className="mt-1 text-xs text-zinc-500">
                                                {new Date(a.created_at).toLocaleString()} • {a.actor_name || "System"}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div>
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h3 className="font-semibold text-zinc-900">Add Comment</h3>
                                    <form action={addCommentAction.bind(null, shipment.id)} className="mt-4 space-y-3">
                                        <textarea name="message" required placeholder="Write a comment..." className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" rows={3} />
                                        <button type="submit" className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">Post Comment</button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}



function StepFieldInputs({
    stepId,
    schema,
    values,
    missingPaths,
    canEdit,
    latestReceivedDocByType,
    workflowGlobalValues,
    docTypes,
    shipmentGoods,
}: {
    stepId: number;
    schema: StepFieldSchema;
    values: StepFieldValues;
    missingPaths: Set<string>;
    canEdit: boolean;
    latestReceivedDocByType: Record<string, any>;
    workflowGlobalValues: WorkflowGlobalValues;
    docTypes: Set<string>;
    shipmentGoods: any[];
}) {
    const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
    const [groupRemovals, setGroupRemovals] = useState<Record<string, number[]>>({});
    const [choiceTabs, setChoiceTabs] = useState<Record<string, string>>({});

    const addGroupItem = (groupKey: string, currentCount: number) => {
        setGroupCounts((prev) => ({
            ...prev,
            [groupKey]: currentCount + 1,
        }));
    };

    const removeGroupItem = (groupKey: string, index: number) => {
        setGroupRemovals((prev) => {
            const existing = new Set(prev[groupKey] ?? []);
            existing.add(index);
            return { ...prev, [groupKey]: Array.from(existing) };
        });
    };

    const renderFields = (
        fields: StepFieldDefinition[],
        basePath: string[],
        valuesObj: StepFieldValues,
        disabled: boolean,
    ) => {
        return fields.map((field) => {
            const fieldPath = [...basePath, field.id];
            const encodedPath = encodeFieldPath(fieldPath);
            const showMissing = missingPaths.has(encodedPath) && !disabled;
            const fieldKey = encodedPath;
            const fieldValues = toRecord(valuesObj);

            if (field.type === "text" || field.type === "number" || field.type === "date") {
                const raw = fieldValues[field.id];
                const value = typeof raw === "string" ? raw : "";
                const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
                const linkedCountdown = field.type === "date" && field.linkToGlobal
                    ? formatCountdown(value, workflowGlobalValues[field.linkToGlobal])
                    : null;

                return (
                    <label key={fieldKey} className="block">
                        <div className="mb-1 text-xs font-medium text-zinc-600">
                            {field.label}
                        </div>
                        <input
                            type={inputType}
                            name={fieldInputName(fieldPath)}
                            defaultValue={value}
                            disabled={!canEdit || disabled}
                            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm disabled:bg-zinc-100 ${showMissing ? "border-red-300" : "border-zinc-300"
                                }`}
                            placeholder="Enter value..."
                        />
                        {linkedCountdown ? (
                            <div className="mt-1 text-[11px] text-zinc-500">
                                {linkedCountdown}
                            </div>
                        ) : null}
                    </label>
                );
            }

            if (field.type === "shipment_goods") {
                const goodsValues = toRecord(fieldValues[field.id]);
                const blockClasses = showMissing
                    ? "border-red-200 bg-red-50"
                    : "border-zinc-200 bg-white";

                return (
                    <div key={fieldKey} className={`rounded-lg border p-3 ${blockClasses}`}>
                        <div className="text-xs font-medium text-zinc-700">{field.label}</div>
                        {shipmentGoods.length ? (
                            <div className="mt-2 space-y-2">
                                {shipmentGoods.map((sg) => {
                                    const key = `good-${sg.id}`;
                                    const raw = goodsValues[key];
                                    const value = typeof raw === "string" ? raw : "";
                                    const allocated =
                                        sg.allocated_at ||
                                        sg.allocated_quantity > 0 ||
                                        sg.inventory_quantity > 0;
                                    const customerLabel = sg.applies_to_all_customers
                                        ? "All customers"
                                        : sg.customer_name ?? "-";
                                    return (
                                        <div
                                            key={sg.id}
                                            className={`rounded-lg border px-3 py-2 text-xs ${allocated ? "border-zinc-200 bg-zinc-50 text-zinc-400" : "border-zinc-200 bg-white"}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div>
                                                    <div className="font-medium text-zinc-900">{sg.good_name}</div>
                                                    <div className="text-[11px] text-zinc-500">
                                                        {sg.good_origin} - {sg.quantity} {sg.unit_type} - {customerLabel}
                                                    </div>
                                                </div>
                                                {allocated ? <Badge tone="green">Allocated</Badge> : null}
                                            </div>
                                            <label className="mt-2 block">
                                                <div className="mb-1 text-[11px] font-medium text-zinc-600">
                                                    Taken amount
                                                </div>
                                                <input
                                                    type="number"
                                                    name={fieldInputName([...fieldPath, key])}
                                                    defaultValue={value}
                                                    min={0}
                                                    max={sg.quantity}
                                                    step={1}
                                                    disabled={!canEdit || disabled || allocated}
                                                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs disabled:bg-zinc-100"
                                                    placeholder="0"
                                                />
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="mt-2 text-xs text-zinc-500">
                                No goods lines available for this shipment.
                            </div>
                        )}
                    </div>
                );
            }

            if (field.type === "file") {
                const docType = stepFieldDocType(stepId, encodedPath);
                const latestDoc = latestReceivedDocByType[docType];
                const received = docTypes.has(docType);
                return (
                    <div key={fieldKey} className="rounded-lg border border-zinc-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-700">
                            <span>{field.label}</span>
                            {received ? <Badge tone="green">Uploaded</Badge> : null}
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <label className="block">
                                <div className="mb-1 text-[11px] font-medium text-zinc-600">
                                    Upload file
                                </div>
                                <input
                                    type="file"
                                    name={fieldInputName(fieldPath)}
                                    disabled={!canEdit || disabled}
                                    className={`w-full rounded-lg border bg-white px-3 py-2 text-xs disabled:bg-zinc-100 ${showMissing ? "border-red-300" : "border-zinc-300"
                                        }`}
                                />
                            </label>
                            <div className="text-[11px] text-zinc-500">
                                {latestDoc ? (
                                    <a
                                        href={`/api/documents/${latestDoc.id}`}
                                        className="text-zinc-600 hover:underline"
                                    >
                                        Download latest
                                    </a>
                                ) : (
                                    <span>No file uploaded</span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            }

            if (field.type === "group") {
                const groupValue = fieldValues[field.id];
                const groupKey = encodedPath;
                const removed = new Set(groupRemovals[groupKey] ?? []);
                const groupMissing = hasMissingUnderPath(missingPaths, encodedPath) && !disabled;

                if (field.repeatable) {
                    const items = Array.isArray(groupValue) ? groupValue : [];
                    const count = Math.max(items.length, groupCounts[groupKey] ?? 0);
                    return (
                        <div key={fieldKey} className={`rounded-lg border bg-white p-3 ${groupMissing ? "border-red-200" : "border-zinc-200"}`}>
                            <div className="flex items-center justify-between text-xs font-medium text-zinc-700">
                                <span>{field.label}</span>
                                {canEdit && !disabled ? (
                                    <button
                                        type="button"
                                        onClick={() => addGroupItem(groupKey, count)}
                                        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50"
                                    >
                                        Add item
                                    </button>
                                ) : null}
                            </div>
                            <div className="mt-3 space-y-3">
                                {Array.from({ length: count }).map((_, index) => {
                                    if (removed.has(index)) return null;
                                    const item = isPlainObject(items[index]) ? items[index] : {};
                                    const itemPath = [...fieldPath, String(index)];
                                    return (
                                        <div key={`${fieldKey}-${index}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                                            <div className="mb-2 flex items-center justify-between text-xs font-medium text-zinc-700">
                                                <span>Item {index + 1}</span>
                                                {canEdit && !disabled ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeGroupItem(groupKey, index)}
                                                        className="text-[11px] text-red-600 hover:underline"
                                                    >
                                                        Remove
                                                    </button>
                                                ) : null}
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                {renderFields(field.fields, itemPath, item as StepFieldValues, disabled)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {(groupRemovals[groupKey] ?? []).map((index) => (
                                <input
                                    key={`${fieldKey}-remove-${index}`}
                                    type="hidden"
                                    name={fieldRemovalName([...fieldPath, String(index)])}
                                    value="1"
                                />
                            ))}
                        </div>
                    );
                }

                const groupValues = isPlainObject(groupValue) ? (groupValue as StepFieldValues) : {};
                return (
                    <div key={fieldKey} className={`rounded-lg border bg-white p-3 ${groupMissing ? "border-red-200" : "border-zinc-200"}`}>
                        <div className="text-xs font-medium text-zinc-700">{field.label}</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {renderFields(field.fields, fieldPath, groupValues, disabled)}
                        </div>
                    </div>
                );
            }

            if (field.type === "choice") {
                const choiceValue = fieldValues[field.id];
                const choiceValues = toRecord(choiceValue);
                const choiceMissing = hasMissingUnderPath(missingPaths, encodedPath) && !disabled;
                const finalOption = field.options.find((opt) => opt.is_final);
                const finalComplete = finalOption
                    ? isOptionComplete(
                        stepId,
                        finalOption,
                        choiceValues[finalOption.id],
                        docTypes,
                        missingPaths,
                        [...fieldPath, finalOption.id],
                    )
                    : false;
                const optionWithValue = field.options.find((option) =>
                    hasAnyFieldValue(
                        stepId,
                        option.fields,
                        toRecord(choiceValues[option.id]),
                        docTypes,
                        [...fieldPath, option.id],
                    ),
                );
                const fallbackOptionId = optionWithValue?.id ?? field.options[0]?.id ?? "";
                const activeOptionId = choiceTabs[encodedPath] ?? (finalOption && finalComplete ? finalOption.id : fallbackOptionId);

                return (
                    <div key={fieldKey} className={`rounded-lg border bg-white p-3 ${choiceMissing ? "border-red-200" : "border-zinc-200"}`}>
                        <div className="text-xs font-medium text-zinc-700">{field.label}</div>
                        <div className="mt-3">
                            <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
                                {field.options.map((option) => {
                                    const optionPath = [...fieldPath, option.id];
                                    const optionEncoded = encodeFieldPath(optionPath);
                                    const superseded = !!finalOption && finalComplete && option.id !== finalOption.id;
                                    const optionMissing = hasMissingUnderPath(missingPaths, optionEncoded) && !superseded && !disabled;
                                    const isActive = option.id === activeOptionId;
                                    const baseClasses = "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors";
                                    const activeClasses = isActive
                                        ? "border-zinc-900 bg-zinc-900 text-white"
                                        : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50";
                                    const alertClasses = optionMissing ? "border-red-200 text-red-600" : "";
                                    const mutedClasses = superseded ? "opacity-60" : "";

                                    return (
                                        <button
                                            key={`${optionEncoded}-tab`}
                                            type="button"
                                            onClick={() =>
                                                setChoiceTabs((prev) => ({ ...prev, [encodedPath]: option.id }))
                                            }
                                            className={[baseClasses, activeClasses, alertClasses, mutedClasses].filter(Boolean).join(" ")}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-3 space-y-3">
                                {field.options.map((option) => {
                                    const optionPath = [...fieldPath, option.id];
                                    const optionEncoded = encodeFieldPath(optionPath);
                                    const optionValues = toRecord(choiceValues[option.id]);
                                    const superseded = !!finalOption && finalComplete && option.id !== finalOption.id;
                                    const optionMissing = hasMissingUnderPath(missingPaths, optionEncoded) && !superseded && !disabled;
                                    const isActive = option.id === activeOptionId;

                                    return (
                                        <div
                                            key={optionEncoded}
                                            hidden={!isActive}
                                            className={`rounded-lg border p-3 ${superseded ? "border-zinc-200 bg-zinc-50 text-zinc-400" : optionMissing ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"}`}
                                        >
                                            <div className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                                                <span>{option.label}</span>
                                                {option.is_final ? <Badge tone="yellow">Final</Badge> : null}
                                                {superseded ? <Badge tone="zinc">Superseded</Badge> : null}
                                            </div>
                                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                                {renderFields(option.fields, optionPath, optionValues as StepFieldValues, disabled || superseded)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            }

            return null;
        });
    };

    return (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-medium text-zinc-700">Step fields</div>
            <div className="mt-2 space-y-3">
                {renderFields(schema.fields, [], values, false)}
            </div>
        </div>
    );
}

// Simplified StepCard component for the Workflow tab
// In a real scenario, this would need all the logic from the original renderStepCard
// Helper functions for parsing step data and handling checklists
function jsonParse<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function parseRequiredFields(step: any): string[] {
    return jsonParse(step.required_fields_json, [] as string[]);
}

function parseRequiredDocumentTypes(step: any): string[] {
    return jsonParse(step.required_document_types_json, [] as string[]);
}

function parseChecklistGroups(step: any): any[] {
    return jsonParse(step.checklist_groups_json, [] as any[]);
}

function getStepFieldSchema(step: any): StepFieldSchema {
    const schema = parseStepFieldSchema(step.field_schema_json);
    if (schema.fields.length > 0) return schema;
    const legacyFields = parseRequiredFields(step);
    if (legacyFields.length > 0) return schemaFromLegacyFields(legacyFields);
    return schema;
}

function getStepFieldValues(step: any): StepFieldValues {
    return parseStepFieldValues(step.field_values_json);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object") return false;
    return Object.getPrototypeOf(value) === Object.prototype;
}

function toRecord(value: unknown): Record<string, unknown> {
    return isPlainObject(value) ? value : {};
}

function formatCountdown(start: string, target?: string | null): string | null {
    if (!start || !target) return null;
    const startMs = Date.parse(start);
    const targetMs = Date.parse(target);
    if (Number.isNaN(startMs) || Number.isNaN(targetMs)) return null;
    const diffMs = targetMs - startMs;
    const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    if (days === 0) return "Countdown: today";
    if (days > 0) return `Countdown: ${days} day${days === 1 ? "" : "s"}`;
    const overdue = Math.abs(days);
    return `Overdue by ${overdue} day${overdue === 1 ? "" : "s"}`;
}

function hasMissingUnderPath(missingPaths: Set<string>, prefix: string): boolean {
    if (missingPaths.has(prefix)) return true;
    for (const path of missingPaths) {
        if (path.startsWith(`${prefix}.`)) return true;
    }
    return false;
}

function isOptionComplete(
    stepId: number,
    option: { id: string; fields: StepFieldDefinition[] },
    optionValue: unknown,
    docTypes: Set<string>,
    missingPaths: Set<string>,
    optionPath: string[],
): boolean {
    const optionValues = toRecord(optionValue);
    if (!hasAnyFieldValue(stepId, option.fields, optionValues, docTypes, optionPath)) {
        return false;
    }
    const optionPrefix = encodeFieldPath(optionPath);
    return !hasMissingUnderPath(missingPaths, optionPrefix);
}

function hasAnyFieldValue(
    stepId: number,
    fields: StepFieldDefinition[],
    values: Record<string, unknown>,
    docTypes: Set<string>,
    basePath: string[],
): boolean {
    const container = toRecord(values);
    for (const field of fields) {
        const fieldPath = [...basePath, field.id];
        if (field.type === "text" || field.type === "number" || field.type === "date") {
            const value = container[field.id];
            if (typeof value === "string" && value.trim()) return true;
            continue;
        }
        if (field.type === "file") {
            const docType = stepFieldDocType(stepId, encodeFieldPath(fieldPath));
            if (docTypes.has(docType)) return true;
            continue;
        }
        if (field.type === "group") {
            const groupValue = container[field.id];
            if (field.repeatable) {
                const items = Array.isArray(groupValue) ? groupValue : [];
                for (let idx = 0; idx < items.length; idx += 1) {
                    if (hasAnyFieldValue(stepId, field.fields, toRecord(items[idx]), docTypes, [...fieldPath, String(idx)])) {
                        return true;
                    }
                }
            } else if (hasAnyFieldValue(stepId, field.fields, toRecord(groupValue), docTypes, fieldPath)) {
                return true;
            }
            continue;
        }
        if (field.type === "choice") {
            const choiceValue = toRecord(container[field.id]);
            for (const option of field.options) {
                if (hasAnyFieldValue(stepId, option.fields, toRecord(choiceValue[option.id]), docTypes, [...fieldPath, option.id])) {
                    return true;
                }
            }
        }
    }
    return false;
}

function toKey(value: string): string {
    return value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function checklistDocType(groupName: string, itemLabel: string): string {
    const groupKey = toKey(groupName);
    const itemKey = toKey(itemLabel);
    if (groupKey && itemKey) return `${groupKey}_${itemKey}`;
    return groupKey || itemKey || "CHECKLIST_ITEM";
}

function checklistDateKey(groupName: string, itemLabel: string): string {
    const groupKey = toKey(groupName);
    const itemKey = toKey(itemLabel);
    return `checklist:${groupKey}:${itemKey}:date`;
}

function checklistFileKey(groupName: string, itemLabel: string): string {
    const groupKey = toKey(groupName);
    const itemKey = toKey(itemLabel);
    return `checklist:${groupKey}:${itemKey}:file`;
}

function getFinalChecklistItem(items: any[]): any | null {
    if (!items.length) return null;
    const explicit = items.find((i: any) => i.is_final);
    return explicit ?? items[items.length - 1] ?? null;
}

function StepCard({
    step,
    user,
    shipment,
    canEdit,
    workflowBlocked,
    receivedDocTypes,
    openDocRequestTypes,
    latestReceivedDocByType,
    workflowGlobalValues,
    highlightRequirements,
    partiesById,
    customers,
    suppliers,
    brokers,
    shipmentGoods,
    setActiveTab,
}: any) {
    const fieldSchema = getStepFieldSchema(step);
    const fieldValues = getStepFieldValues(step);
    const requiredDocs = parseRequiredDocumentTypes(step);
    const checklistGroups = parseChecklistGroups(step);

    const docTypes = new Set(receivedDocTypes);
    const missingFieldPaths = collectMissingFieldPaths(fieldSchema, {
        stepId: step.id,
        values: fieldValues,
        docTypes,
    });
    const missingRequiredDocs = requiredDocs.filter(
        (dt) => !receivedDocTypes.includes(dt),
    );

    const isChecklistItemComplete = (
        group: { name: string },
        item: { label: string },
    ) => {
        const dateKey = checklistDateKey(group.name, item.label);
        const dateValue = String((fieldValues as Record<string, unknown>)[dateKey] ?? "").trim();
        const docType = checklistDocType(group.name, item.label);
        return !!dateValue && receivedDocTypes.includes(docType);
    };

    const missingChecklistGroups = checklistGroups.filter((group) => {
        const items = group.items ?? [];
        if (!items.length) return false;
        const finalItem = getFinalChecklistItem(items);
        if (finalItem && isChecklistItemComplete(group, finalItem)) return false;
        return !items.some((item: any) => isChecklistItemComplete(group, item));
    });

    const canMarkDone =
        missingFieldPaths.size === 0 &&
        missingRequiredDocs.length === 0 &&
        missingChecklistGroups.length === 0;
    const highlightFieldPaths = highlightRequirements ? missingFieldPaths : new Set<string>();
    const hasRequirements =
        fieldSchema.fields.length > 0 ||
        requiredDocs.length > 0 ||
        checklistGroups.length > 0;

    const isMyStep = step.owner_role === user.role;
    const blockedByException = workflowBlocked && step.status !== "DONE";
    const canEditStepStatus = canEdit && !blockedByException;
    const relatedParty = step.related_party_id
        ? partiesById.get(step.related_party_id) ?? null
        : null;
    const isTracking = step.is_external === 1;

    return (
        <div
            id={`step-${step.id}`}
            className={`rounded-xl border bg-white p-4 ${highlightRequirements
                ? "border-red-200 ring-4 ring-red-50"
                : isMyStep
                    ? "border-blue-200"
                    : "border-zinc-200"
                }`}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-zinc-900">
                            {step.sort_order}. {step.name}
                        </div>
                        <Badge tone={stepTone(step.status)}>
                            {stepStatusLabel(step.status)}
                        </Badge>
                        {isMyStep ? <Badge tone="blue">Your step</Badge> : null}
                        {isTracking ? <Badge tone="yellow">Tracking</Badge> : null}
                        {blockedByException ? (
                            <Badge tone="red">Blocked by exception</Badge>
                        ) : null}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                        Owner: {step.owner_role}
                        {step.sla_hours ? ` - SLA: ${step.sla_hours}h` : ""}
                        {step.due_at ? (
                            <>
                                {" "}
                                - Due: {new Date(step.due_at).toLocaleString()}
                            </>
                        ) : null}
                        {relatedParty ? (
                            <>
                                {" "}
                                - Party:{" "}
                                <span className="font-medium text-zinc-700">
                                    {relatedParty.name}
                                </span>
                            </>
                        ) : null}
                    </div>

                    {highlightRequirements ? (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                            Missing requirements. Fill required fields, documents, or checklist
                            items, then try marking Done again.
                        </div>
                    ) : null}

                    {requiredDocs.length ? (
                        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                            <div className="text-xs font-medium text-zinc-700">
                                Required documents
                            </div>
                            <div className="mt-2 flex flex-col gap-2">
                                {requiredDocs.map((dt) => {
                                    const received = receivedDocTypes.includes(dt);
                                    const requested = openDocRequestTypes.includes(dt);
                                    const showMissing = highlightRequirements && !received;
                                    const latestDoc = latestReceivedDocByType[dt];
                                    const tone = received
                                        ? "green"
                                        : requested
                                            ? "yellow"
                                            : "red";

                                    return (
                                        <div
                                            key={dt}
                                            className={`flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-xs ${showMissing
                                                ? "border-red-200 bg-red-50"
                                                : "border-zinc-200"
                                                }`}
                                        >
                                            <div className="font-medium text-zinc-900">{dt}</div>
                                            <div className="flex items-center gap-2">
                                                <Badge tone={tone}>
                                                    {received
                                                        ? "Received"
                                                        : requested
                                                            ? "Requested"
                                                            : "Missing"}
                                                </Badge>
                                                {received && latestDoc ? (
                                                    <a
                                                        href={`/api/documents/${latestDoc.id}`}
                                                        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                                                    >
                                                        Download
                                                    </a>
                                                ) : null}
                                                {!received && !requested && canEdit ? (
                                                    <form
                                                        action={requestDocumentAction.bind(
                                                            null,
                                                            shipment.id,
                                                        )}
                                                        className="flex items-center"
                                                    >
                                                        <input
                                                            type="hidden"
                                                            name="documentType"
                                                            value={dt}
                                                        />
                                                        <button
                                                            type="submit"
                                                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100"
                                                        >
                                                            Request
                                                        </button>
                                                    </form>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-2 text-xs text-zinc-600">
                                <button
                                    onClick={() => {
                                        setActiveTab("documents");
                                        setTimeout(() => document.getElementById("documents")?.scrollIntoView({ behavior: 'smooth' }), 100);
                                    }}
                                    className="font-medium text-zinc-700 hover:underline"
                                >
                                    Go to documents
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <form
                action={updateStepAction.bind(null, shipment.id)}
                className="mt-3 space-y-3"
            >
                <input type="hidden" name="stepId" value={step.id} />

                {fieldSchema.fields.length ? (
                    <StepFieldInputs
                        stepId={step.id}
                        schema={fieldSchema}
                        values={fieldValues}
                        missingPaths={highlightFieldPaths}
                        canEdit={canEdit}
                        latestReceivedDocByType={latestReceivedDocByType}
                        workflowGlobalValues={workflowGlobalValues}
                        docTypes={docTypes}
                        shipmentGoods={shipmentGoods}
                    />
                ) : null}

                {checklistGroups.length ? (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs font-medium text-zinc-700">Checklist</div>
                        <div className="mt-2 space-y-3">
                            {checklistGroups.map((group: any, groupIndex: number) => {
                                const items = group.items ?? [];
                                const finalItem = getFinalChecklistItem(items);
                                const finalComplete = !!(
                                    finalItem && isChecklistItemComplete(group, finalItem)
                                );
                                const groupComplete =
                                    finalComplete ||
                                    items.some((item: any) => isChecklistItemComplete(group, item));

                                return (
                                    <div
                                        key={`${group.name}-${groupIndex}`}
                                        className="rounded-lg border border-zinc-200 bg-white p-3"
                                    >
                                        <div className="text-xs font-medium text-zinc-700">
                                            {group.name}
                                        </div>
                                        <div className="mt-2 space-y-2">
                                            {items.map((item: any, itemIndex: number) => {
                                                const docType = checklistDocType(
                                                    group.name,
                                                    item.label,
                                                );
                                                const dateKey = checklistDateKey(
                                                    group.name,
                                                    item.label,
                                                );
                                                const fileKey = checklistFileKey(
                                                    group.name,
                                                    item.label,
                                                );
                                                const dateValue = String((fieldValues as Record<string, unknown>)[dateKey] ?? "");
                                                const received = receivedDocTypes.includes(docType);
                                                const complete =
                                                    !!dateValue.trim() && received;
                                                const superseded =
                                                    !!finalItem && finalComplete && finalItem !== item;
                                                const showMissing =
                                                    highlightRequirements &&
                                                    !groupComplete &&
                                                    !complete;
                                                const latestDoc = latestReceivedDocByType[docType];
                                                const tone = superseded
                                                    ? "zinc"
                                                    : complete
                                                        ? "green"
                                                        : "red";
                                                const statusLabel = superseded
                                                    ? "Superseded"
                                                    : complete
                                                        ? "Complete"
                                                        : "Missing";

                                                return (
                                                    <div
                                                        key={`${docType}-${itemIndex}`}
                                                        className={`rounded-lg border px-3 py-2 text-xs ${superseded
                                                            ? "border-zinc-200 bg-zinc-50 text-zinc-400"
                                                            : showMissing
                                                                ? "border-red-200 bg-red-50"
                                                                : "border-zinc-200 bg-white"
                                                            }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="font-medium text-zinc-900">
                                                                {item.label}
                                                            </div>
                                                            <Badge tone={tone}>{statusLabel}</Badge>
                                                        </div>
                                                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                                            <label className="block">
                                                                <div className="mb-1 text-[11px] font-medium text-zinc-600">
                                                                    Received date
                                                                </div>
                                                                <input
                                                                    type="date"
                                                                    name={dateKey}
                                                                    defaultValue={dateValue}
                                                                    disabled={!canEdit || superseded}
                                                                    className={`w-full rounded-lg border bg-white px-3 py-2 text-xs disabled:bg-zinc-100 ${showMissing
                                                                        ? "border-red-300"
                                                                        : "border-zinc-300"
                                                                        }`}
                                                                />
                                                            </label>
                                                            <label className="block">
                                                                <div className="mb-1 text-[11px] font-medium text-zinc-600">
                                                                    Upload file
                                                                </div>
                                                                <input
                                                                    type="file"
                                                                    name={fileKey}
                                                                    disabled={!canEdit || superseded}
                                                                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs disabled:bg-zinc-100"
                                                                />
                                                            </label>
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
                                                            <span>Document type: {docType}</span>
                                                            {received && latestDoc ? (
                                                                <a
                                                                    href={`/api/documents/${latestDoc.id}`}
                                                                    className="text-zinc-600 hover:underline"
                                                                >
                                                                    Download latest
                                                                </a>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                <label className="block">
                    <div className="mb-1 text-xs font-medium text-zinc-600">
                        Related party (optional)
                    </div>
                    <select
                        name="relatedPartyId"
                        defaultValue={step.related_party_id ?? ""}
                        disabled={!canEdit}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                    >
                        <option value="">None</option>
                        {customers.length ? (
                            <optgroup label="Customers">
                                {customers.map((p: any) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </optgroup>
                        ) : null}
                        {suppliers.length ? (
                            <optgroup label="Suppliers">
                                {suppliers.map((p: any) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </optgroup>
                        ) : null}
                        {brokers.length ? (
                            <optgroup label="Customs brokers">
                                {brokers.map((p: any) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </optgroup>
                        ) : null}
                    </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block sm:col-span-1">
                        <div className="mb-1 text-xs font-medium text-zinc-600">
                            Status
                        </div>
                        <select
                            name="status"
                            defaultValue={step.status}
                            disabled={!canEditStepStatus}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                        >
                            {["PENDING", "IN_PROGRESS", "DONE", "BLOCKED"].map((st) => (
                                <option
                                    key={st}
                                    value={st}
                                    disabled={
                                        st === "DONE" && !canMarkDone && step.status !== "DONE"
                                    }
                                >
                                    {stepStatusLabel(st as StepStatus)}
                                </option>
                            ))}
                        </select>
                        {canEdit &&
                            hasRequirements &&
                            !canMarkDone &&
                            step.status !== "DONE" ? (
                            <div className="mt-1 text-xs text-zinc-500">
                                Complete required fields, documents, or checklist items to mark
                                Done.
                            </div>
                        ) : null}
                        {blockedByException ? (
                            <div className="mt-1 text-xs text-zinc-500">
                                Status updates are disabled until the exception is resolved.
                            </div>
                        ) : null}
                    </label>
                    <label className="block sm:col-span-2">
                        <div className="mb-1 text-xs font-medium text-zinc-600">
                            Notes
                        </div>
                        <input
                            name="notes"
                            defaultValue={step.notes ?? ""}
                            disabled={!canEdit}
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
                            placeholder="Optional step notes..."
                        />
                    </label>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <button
                        type="submit"
                        disabled={!canEdit}
                        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                        Save step
                    </button>
                    {!canEdit ? (
                        <span className="text-xs text-zinc-500">
                            Finance role is view-only.
                        </span>
                    ) : null}
                </div>
            </form>
        </div>
    );
}
