"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { CopyField } from "@/components/ui/CopyField";
import { FclImportWorkspace } from "@/components/shipments/fcl-import/FclImportWorkspace";
import {
    overallStatusLabel,
    riskLabel,
    stepStatusLabel,
    taskStatusLabel,
    transportModeLabel,
    type StepStatus,
    type TaskStatus,
} from "@/lib/domain";
import type { AuthUser } from "@/lib/auth";
import type { ActivityRow } from "@/lib/data/activities";
import type { DocumentRequestRow, DocumentRow } from "@/lib/data/documents";
import type { ExceptionTypeRow, ShipmentExceptionRow } from "@/lib/data/exceptions";
import type {
    ShipmentConnectOption,
    ShipmentJobIdRow,
    ShipmentRow,
    ShipmentStepRow,
} from "@/lib/data/shipments";
import type {
    CustomerInventoryTransactionRow,
    GoodRow,
    InventoryBalanceRow,
    ShipmentAllocationGoodRow,
    ShipmentGoodRow,
} from "@/lib/data/goods";
import type { PartyRow } from "@/lib/data/parties";
import type { ShipmentLinkSummary } from "@/lib/data/shipmentLinks";
import type { TaskRow } from "@/lib/data/tasks";
import type { DbUser } from "@/lib/data/users";
import type { ChecklistGroup, ChecklistItem } from "@/lib/checklists";
import {
    FCL_IMPORT_CONTAINER_STEPS,
    FCL_IMPORT_OPERATIONS_STEPS,
    FCL_IMPORT_STEP_NAMES,
    FCL_IMPORT_TRACKING_STEPS,
} from "@/lib/fclImport/constants";
import {
    extractContainerNumbers,
    isTruthy,
    normalizeContainerNumbers,
    normalizeContainerRows,
} from "@/lib/fclImport/helpers";
import {
    collectMissingFieldPaths,
    decodeFieldPath,
    describeFieldPath,
    encodeFieldPath,
    fieldInputName,
    fieldRemovalName,
    parseStopCountdownPath,
    parseStepFieldDocType,
    parseStepFieldSchema,
    parseStepFieldValues,
    schemaFromLegacyFields,
    stepFieldDocType,
    type StepFieldDefinition,
    type StepFieldSchema,
    type StepFieldValue,
    type StepFieldValues,
} from "@/lib/stepFields";
import type { WorkflowGlobalVariable, WorkflowGlobalValues } from "@/lib/workflowGlobals";
import {
    addCommentAction,
    addShipmentJobIdsAction,
    addShipmentGoodAction,
    createGoodAction,
    createShipmentLinkAction,
    createTaskAction,
    deleteShipmentAction,
    deleteShipmentGoodAction,
    deleteShipmentLinkAction,
    logExceptionAction,
    removeShipmentJobIdAction,
    requestDocumentAction,
    resolveExceptionAction,
    updateWorkflowGlobalsAction,
    updateStepAction,
    updateTaskStatusAction,
    updateDocumentFlagsAction,
    uploadDocumentAction,
} from "./actions";

type ShipmentViewShipment = ShipmentRow & { customer_names: string | null };

type ShipmentJobIdViewRow = ShipmentJobIdRow & { created_by_name: string | null };

type ConnectedShipmentRow = ShipmentLinkSummary & {
    goods: ShipmentGoodRow[];
    docs: DocumentRow[];
    trackingToken: string | null;
};

type ActiveUserRow = Pick<DbUser, "id" | "name" | "role">;

type MyStepRow = {
    id: number;
    sortOrder: number;
    name: string;
    status: StepStatus;
    dueAt: string | null;
    isExternal: boolean;
    relatedPartyName: string | null;
    missingFieldsCount: number;
    missingDocsCount: number;
};

// Types (imported from lib/data/... or defined here if simple)
// Ideally these should be imported from the source, but for now I'll define interfaces matching the data passed
// to avoid complex import chains if they are not fully exported or if they are database rows.

interface ShipmentViewProps {
    user: AuthUser;
    shipment: ShipmentViewShipment;
    shipmentCustomers: PartyRow[];
    shipmentGoods: ShipmentGoodRow[];
    allocationGoods: ShipmentAllocationGoodRow[];
    goods: GoodRow[];
    inventoryBalances: InventoryBalanceRow[];
    inventoryTransactions: CustomerInventoryTransactionRow[];
    connectableShipments: ShipmentConnectOption[];
    connectedShipments: ConnectedShipmentRow[];
    steps: ShipmentStepRow[];
    internalSteps: ShipmentStepRow[];
    trackingSteps: ShipmentStepRow[];
    jobIds: ShipmentJobIdViewRow[];
    tasks: TaskRow[];
    docs: DocumentRow[];
    docRequests: DocumentRequestRow[];
    exceptions: ShipmentExceptionRow[];
    exceptionTypes: ExceptionTypeRow[];
    activities: ActivityRow[];
    trackingToken: string | null;
    activeUsers: ActiveUserRow[];
    customers: PartyRow[];
    suppliers: PartyRow[];
    brokers: PartyRow[];

    // Computed/Derived state passed from server
    mySteps: MyStepRow[];
    myTasks: TaskRow[];
    blockingExceptions: ShipmentExceptionRow[];
    workflowBlocked: boolean;
    primaryBlockingException: ShipmentExceptionRow | null;
    receivedDocTypes: string[];
    openDocRequestTypes: string[];
    latestReceivedDocByType: Record<string, DocumentRow>;
    workflowGlobals: WorkflowGlobalVariable[];
    workflowGlobalValues: WorkflowGlobalValues;

    // Search params / Errors
    error: string | null;
    errorStepId: number | null;

    // Optional FCL actions
    fclUpdateAction?: (formData: FormData) => void;
    fclRequestAction?: (formData: FormData) => void;
}

function riskTone(risk: ShipmentViewShipment["risk"]) {
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

function stepStatusStyles(status: StepStatus) {
    if (status === "DONE") {
        return {
            border: "border-l-green-500",
            header: "bg-green-50",
            dot: "bg-green-500",
        };
    }
    if (status === "IN_PROGRESS") {
        return {
            border: "border-l-blue-500",
            header: "bg-blue-50",
            dot: "bg-blue-500",
        };
    }
    if (status === "BLOCKED") {
        return {
            border: "border-l-red-500",
            header: "bg-red-50",
            dot: "bg-red-500",
        };
    }
    return {
        border: "border-l-amber-400",
        header: "bg-amber-50",
        dot: "bg-amber-400",
    };
}

function taskTone(status: TaskStatus) {
    if (status === "DONE") return "green";
    if (status === "IN_PROGRESS") return "blue";
    if (status === "BLOCKED") return "red";
    return "zinc";
}

type ShipmentTabId =
    | "overview"
    | "connections"
    | "tracking-steps"
    | "operations-steps"
    | "container-steps"
    | "goods"
    | "tasks"
    | "documents"
    | "activity";

const SHIPMENT_TABS: ShipmentTabId[] = [
    "overview",
    "connections",
    "tracking-steps",
    "operations-steps",
    "container-steps",
    "goods",
    "tasks",
    "documents",
    "activity",
];

function isShipmentTab(value: string | null): value is ShipmentTabId {
    return value !== null && SHIPMENT_TABS.includes(value as ShipmentTabId);
}

export default function ShipmentView(props: ShipmentViewProps) {
    const {
        user,
        shipment,
        shipmentCustomers,
        shipmentGoods,
        allocationGoods,
        goods,
        inventoryBalances,
        inventoryTransactions,
        connectableShipments,
        connectedShipments,
        steps,
        internalSteps,
        trackingSteps,
        jobIds,
        tasks,
        docs,
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
        workflowBlocked,
        primaryBlockingException,
        receivedDocTypes,
        openDocRequestTypes,
        latestReceivedDocByType,
        workflowGlobals,
        workflowGlobalValues,
        error,
        errorStepId,
        fclUpdateAction,
        fclRequestAction,
    } = props;

    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const tabParamRaw = searchParams.get("tab");
    const tabParam =
        tabParamRaw === "workflow"
            ? "operations-steps"
            : tabParamRaw === "tracking"
                ? "tracking-steps"
                : tabParamRaw;
    const activeTab = isShipmentTab(tabParam) ? tabParam : "overview";
    const [isCompactHeader, setIsCompactHeader] = useState(false);
    const [toast, setToast] = useState<{ message: string; tone: "success" | "info" } | null>(
        null,
    );
    const [timelinePreviewTab, setTimelinePreviewTab] = useState<
        "operations" | "tracking" | "containers"
    >("operations");

    const setTab = (tab: ShipmentTabId) => {
        const params = new URLSearchParams(searchParams.toString());
        if (tab === "overview") {
            params.delete("tab");
        } else {
            params.set("tab", tab);
        }
        const next = params.toString();
        router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    };

    useEffect(() => {
        const onScroll = () => {
            setIsCompactHeader(window.scrollY > 70);
        };
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        const saved = searchParams.get("saved");
        const requested = searchParams.get("requested");
        if (!saved && !requested) return;

        if (saved) {
            setToast({ message: "Saved successfully.", tone: "success" });
        } else if (requested) {
            setToast({ message: "Request sent to customer.", tone: "info" });
        }

        const params = new URLSearchParams(searchParams.toString());
        params.delete("saved");
        params.delete("requested");
        const next = params.toString();
        const timeout = setTimeout(() => {
            setToast(null);
            router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
        }, 1800);
        return () => clearTimeout(timeout);
    }, [pathname, router, searchParams]);

    const canEdit = ["ADMIN", "OPERATIONS", "CLEARANCE", "SALES"].includes(user.role);
    const canDelete = user.role === "ADMIN";
    const customerLabel =
        shipmentCustomers.length > 0
            ? shipmentCustomers.map((c) => c.name).join(", ")
            : shipment.customer_names ?? "-";

    const stepSchemaById = useMemo(() => {
        const map = new Map<number, StepFieldSchema>();
        for (const s of steps) {
            map.set(s.id, getStepFieldSchema(s));
        }
        return map;
    }, [steps]);

    const stepById = useMemo(() => {
        return new Map<number, ShipmentStepRow>(steps.map((s) => [s.id, s]));
    }, [steps]);

    const isStepBlockedByDependencies = (step: ShipmentStepRow) => {
        const dependencyIds = parseDependsOn(step);
        if (!dependencyIds.length) return false;
        return dependencyIds.some((id) => {
            const dep = stepById.get(id);
            return !dep || dep.status !== "DONE";
        });
    };

    const fclTrackingNames = new Set<string>(FCL_IMPORT_TRACKING_STEPS);
    const fclOperationsNames = new Set<string>([
        ...FCL_IMPORT_OPERATIONS_STEPS,
        FCL_IMPORT_STEP_NAMES.shipmentCreation,
    ]);
    const fclContainerNames = new Set<string>(FCL_IMPORT_CONTAINER_STEPS);

    const isFclWorkflow = steps.some(
        (step) =>
            fclTrackingNames.has(step.name) ||
            fclOperationsNames.has(step.name) ||
            fclContainerNames.has(step.name),
    );

    const trackingLink = trackingToken
        ? isFclWorkflow
            ? `/track/fcl/${trackingToken}`
            : `/track/${trackingToken}`
        : "-";

    const trackingStepsView = isFclWorkflow
        ? steps.filter((step) => fclTrackingNames.has(step.name))
        : trackingSteps;
    const operationsStepsView = isFclWorkflow
        ? steps.filter((step) => fclOperationsNames.has(step.name))
        : internalSteps;
    const containerStepsView = isFclWorkflow
        ? steps.filter((step) => fclContainerNames.has(step.name))
        : [];
    const showContainerTab = !isFclWorkflow && containerStepsView.length > 0;

    const trackingStepIds = new Set(trackingStepsView.map((step) => step.id));
    const containerStepIds = new Set(containerStepsView.map((step) => step.id));

    const getStepTabId = (step: ShipmentStepRow): ShipmentTabId => {
        if (trackingStepIds.has(step.id)) return "tracking-steps";
        if (containerStepIds.has(step.id)) return "container-steps";
        return "operations-steps";
    };

    const creationStep = steps.find(
        (step) => step.name === FCL_IMPORT_STEP_NAMES.shipmentCreation,
    );
    const creationValues = creationStep ? getStepFieldValues(creationStep) : {};
    let containerNumbers = extractContainerNumbers(creationValues);
    if (!containerNumbers.length) {
        containerNumbers = normalizeContainerNumbers([shipment.container_number ?? ""]);
    }

    const dischargeStep = steps.find(
        (step) => step.name === FCL_IMPORT_STEP_NAMES.containersDischarge,
    );
    const pullOutStep = steps.find(
        (step) => step.name === FCL_IMPORT_STEP_NAMES.containerPullOut,
    );
    const deliveryStep = steps.find(
        (step) => step.name === FCL_IMPORT_STEP_NAMES.containerDelivery,
    );

    const dischargeRows = normalizeContainerRows(
        containerNumbers,
        dischargeStep ? getStepFieldValues(dischargeStep) : {},
    );
    const pullOutRows = normalizeContainerRows(
        containerNumbers,
        pullOutStep ? getStepFieldValues(pullOutStep) : {},
    );
    const deliveryRows = normalizeContainerRows(
        containerNumbers,
        deliveryStep ? getStepFieldValues(deliveryStep) : {},
    );

    const dischargedCount = dischargeRows.filter(
        (row) =>
            isTruthy(row.container_discharged) ||
            !!row.container_discharged_date?.trim(),
    ).length;
    const pulledOutCount = pullOutRows.filter(
        (row) => isTruthy(row.pulled_out) || !!row.pull_out_date?.trim(),
    ).length;
    const deliveredCount = deliveryRows.filter(
        (row) =>
            isTruthy(row.delivered_offloaded) ||
            !!row.delivered_offloaded_date?.trim(),
    ).length;
    const returnedCount = deliveryRows.filter(
        (row) => isTruthy(row.empty_returned) || !!row.empty_returned_date?.trim(),
    ).length;
    const totalContainers = containerNumbers.length;
    const showContainerStats = isFclWorkflow && totalContainers > 0;
    const fclStepData = useMemo(() => {
        if (!isFclWorkflow) return [];
        return steps.map((step) => ({
            id: step.id,
            name: step.name,
            status: step.status,
            notes: step.notes ?? null,
            values: getStepFieldValues(step),
        }));
    }, [isFclWorkflow, steps]);
    const fclLatestDocsByType = useMemo(() => {
        if (!isFclWorkflow) return {};
        const latest: Record<
            string,
            {
                id: number;
                file_name: string;
                uploaded_at: string;
                source: "STAFF" | "CUSTOMER";
                is_received: boolean;
            }
        > = {};
        for (const doc of docs) {
            const key = String(doc.document_type);
            if (!latest[key]) {
                latest[key] = {
                    id: doc.id,
                    file_name: doc.file_name,
                    uploaded_at: doc.uploaded_at,
                    source: doc.source,
                    is_received: doc.is_received === 1,
                };
            }
        }
        return latest;
    }, [docs, isFclWorkflow]);
    const fclShipmentMeta = {
        id: shipment.id,
        shipment_code: shipment.shipment_code,
        origin: shipment.origin,
        destination: shipment.destination,
        overall_status: shipment.overall_status,
        risk: shipment.risk,
    };
    const fclTrackingReturnTo = `/shipments/${shipment.id}?tab=tracking-steps&saved=1`;
    const fclOperationsReturnTo = `/shipments/${shipment.id}?tab=operations-steps&saved=1`;
    const fclContainerReturnTo = `/shipments/${shipment.id}?tab=container-steps&saved=1`;
    const canUseFclTabs = isFclWorkflow && !!fclUpdateAction;

    const defaultOpenOperationsStepId = (() => {
        const doable = operationsStepsView.find(
            (s) =>
                s.status !== "DONE" &&
                !workflowBlocked &&
                !isStepBlockedByDependencies(s),
        );
        if (doable) return doable.id;
        const next = operationsStepsView.find((s) => s.status !== "DONE");
        return next?.id ?? operationsStepsView[0]?.id ?? null;
    })();

    const defaultOpenTrackingStepId = (() => {
        const doable = trackingStepsView.find(
            (s) =>
                s.status !== "DONE" &&
                !workflowBlocked &&
                !isStepBlockedByDependencies(s),
        );
        if (doable) return doable.id;
        const next = trackingStepsView.find((s) => s.status !== "DONE");
        return next?.id ?? trackingStepsView[0]?.id ?? null;
    })();

    const defaultOpenContainerStepId = (() => {
        const doable = containerStepsView.find(
            (s) =>
                s.status !== "DONE" &&
                !workflowBlocked &&
                !isStepBlockedByDependencies(s),
        );
        if (doable) return doable.id;
        const next = containerStepsView.find((s) => s.status !== "DONE");
        return next?.id ?? containerStepsView[0]?.id ?? null;
    })();

    const errorStep = errorStepId ? stepById.get(errorStepId) ?? null : null;
    const errorStepTab = errorStep ? getStepTabId(errorStep) : null;

    const [openOperationsStepId, setOpenOperationsStepId] = useState<number | null>(
        () =>
            errorStep && errorStepTab === "operations-steps"
                ? errorStep.id
                : defaultOpenOperationsStepId ?? null,
    );
    const [openTrackingStepId, setOpenTrackingStepId] = useState<number | null>(
        () =>
            errorStep && errorStepTab === "tracking-steps"
                ? errorStep.id
                : defaultOpenTrackingStepId ?? null,
    );
    const [openContainerStepId, setOpenContainerStepId] = useState<number | null>(
        () =>
            errorStep && errorStepTab === "container-steps"
                ? errorStep.id
                : defaultOpenContainerStepId ?? null,
    );
    const [hasTouchedOperations, setHasTouchedOperations] = useState(false);
    const [hasTouchedTracking, setHasTouchedTracking] = useState(false);
    const [hasTouchedContainers, setHasTouchedContainers] = useState(false);
    const [dirtyFormIds, setDirtyFormIds] = useState<string[]>([]);
    const dirtyCount = dirtyFormIds.length;
    const [isGlobalSaving, setIsGlobalSaving] = useState(false);

    const effectiveOpenOperationsStepId = hasTouchedOperations
        ? openOperationsStepId
        : openOperationsStepId ?? defaultOpenOperationsStepId ?? null;
    const effectiveOpenTrackingStepId = hasTouchedTracking
        ? openTrackingStepId
        : openTrackingStepId ?? defaultOpenTrackingStepId ?? null;
    const effectiveOpenContainerStepId = hasTouchedContainers
        ? openContainerStepId
        : openContainerStepId ?? defaultOpenContainerStepId ?? null;

    const markFormDirty = (formId: string) => {
        setDirtyFormIds((prev) => (prev.includes(formId) ? prev : [...prev, formId]));
    };

    const clearFormDirty = (formId: string) => {
        setDirtyFormIds((prev) => prev.filter((id) => id !== formId));
    };

    const handleGlobalSave = () => {
        if (!dirtyCount) return;
        setIsGlobalSaving(true);
        const formId = dirtyFormIds[0];
        const form = document.getElementById(formId) as HTMLFormElement | null;
        if (form) form.requestSubmit();
    };

    const openStep = (stepId: number) => {
        const step = stepById.get(stepId);
        if (!step) return;
        const nextTab = getStepTabId(step);
        if (nextTab === "tracking-steps") {
            setHasTouchedTracking(true);
            setTab(nextTab);
            setOpenTrackingStepId(stepId);
        } else if (nextTab === "container-steps") {
            setHasTouchedContainers(true);
            setTab(nextTab);
            setOpenContainerStepId(stepId);
        } else {
            setHasTouchedOperations(true);
            setTab(nextTab);
            setOpenOperationsStepId(stepId);
        }
        setTimeout(
            () =>
                document
                    .getElementById(`step-${stepId}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" }),
            100,
        );
    };

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

    const renderStepper = (items: ShipmentStepRow[], openId: number | null) => {
        if (!items.length) return null;
        const doneCount = items.filter((s) => s.status === "DONE").length;
        return (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-zinc-900">Progress</h3>
                    <span className="text-xs text-zinc-500">
                        {doneCount}/{items.length} done
                    </span>
                </div>
                <div className="mt-4 flex items-center gap-3 overflow-x-auto pb-2">
                    {items.map((s) => {
                        const styles = stepStatusStyles(s.status);
                        const isActive = openId === s.id;
                        return (
                            <button
                                key={`stepper-${s.id}`}
                                type="button"
                                onClick={() => openStep(s.id)}
                                className={`flex min-w-[140px] items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${isActive
                                    ? "border-zinc-900 bg-zinc-900 text-white"
                                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                                    }`}
                            >
                                <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
                                <span className="truncate">
                                    {s.sort_order}. {s.name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-zinc-50/50 pb-20">
            {/* Header Section */}
            <div
                className={`sticky top-0 z-10 border-b border-zinc-200 bg-white/80 px-6 backdrop-blur-md transition-all ${isCompactHeader ? "py-2" : "py-4"
                    }`}
            >
                <div className="mx-auto max-w-6xl">
                    {!isCompactHeader ? (
                        <div className="mb-2 text-sm text-zinc-500">
                            <Link href="/shipments" className="hover:text-zinc-900 hover:underline">
                                Shipments
                            </Link>{" "}
                            <span className="text-zinc-300">/</span> {shipment.shipment_code}
                        </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h1
                                className={`font-bold tracking-tight text-zinc-900 ${isCompactHeader ? "text-xl" : "text-2xl"
                                    }`}
                            >
                                {shipment.shipment_code}
                            </h1>
                            {!isCompactHeader ? (
                                <div className="mt-1 flex items-center gap-2 text-sm text-zinc-600">
                                    <span className="font-medium text-zinc-900">{customerLabel}</span>
                                    <span className="text-zinc-300">•</span>
                                    <span>{transportModeLabel(shipment.transport_mode)}</span>
                                    <span className="text-zinc-300">•</span>
                                    <span>{shipment.origin} → {shipment.destination}</span>
                                </div>
                            ) : null}
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
                        {(
                            [
                                { id: "overview", label: "Overview" },
                                { id: "connections", label: "Connections", count: connectedShipments.length },
                                { id: "tracking-steps", label: "Tracking", count: trackingStepsView.length },
                                { id: "operations-steps", label: "Operations", count: operationsStepsView.length },
                                ...(showContainerTab
                                    ? [{ id: "container-steps", label: "Containers", count: containerStepsView.length }]
                                    : []),
                                { id: "goods", label: "Goods", count: shipmentGoods.length },
                                { id: "tasks", label: "Tasks", count: myTasks.length > 0 ? myTasks.length : undefined },
                                { id: "documents", label: "Documents", count: docs.length },
                                { id: "activity", label: "Activity" },
                            ] as Array<{
                                id: ShipmentTabId;
                                label: string;
                                count?: number;
                                alert?: boolean;
                            }>
                        ).map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setTab(tab.id as ShipmentTabId)}
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
                    {workflowGlobals.length ? (
                        <details className="mt-4 rounded-xl border border-zinc-200 bg-white/90 p-3 text-xs shadow-sm">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium text-zinc-600">
                                        Global dates
                                    </span>
                                    {workflowGlobals.map((variable) => {
                                        const value = workflowGlobalValues[variable.id];
                                        return (
                                            <span
                                                key={variable.id}
                                                className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700"
                                            >
                                                {variable.label}: {value || "Not set"}
                                            </span>
                                        );
                                    })}
                                </div>
                                <span className="text-zinc-500">Edit</span>
                            </summary>
                            <form
                                action={updateWorkflowGlobalsAction.bind(null, shipment.id)}
                                className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                            >
                                <input type="hidden" name="tab" value={activeTab} />
                                {workflowGlobals.map((variable) => (
                                    <label key={variable.id} className="block">
                                        <div className="mb-1 text-[11px] font-medium text-zinc-600">
                                            {variable.label}
                                        </div>
                                        <input
                                            type="date"
                                            name={`global:${variable.id}`}
                                            defaultValue={workflowGlobalValues[variable.id] ?? ""}
                                            disabled={!canEdit}
                                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs disabled:bg-zinc-100"
                                        />
                                    </label>
                                ))}
                                <div className="flex items-center justify-between gap-3 sm:col-span-2 lg:col-span-3">
                                    {!canEdit ? (
                                        <span className="text-[11px] text-zinc-500">
                                            Finance role is view-only.
                                        </span>
                                    ) : (
                                        <span />
                                    )}
                                    <button
                                        type="submit"
                                        disabled={!canEdit}
                                        className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                                    >
                                        Save dates
                                    </button>
                                </div>
                            </form>
                        </details>
                    ) : null}
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
                    {error === "blocked_by_dependencies" && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
                            This step is blocked by earlier steps. Complete the dependencies first.
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
                            Workflow blocked by <span className="font-medium">{primaryBlockingException.exception_name}</span>.
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
                                                            onClick={() => openStep(s.id)}
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
                                                                setTab("tasks");
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

                                {/* Timeline / Tracking Preview */}
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <h2 className="text-base font-semibold text-zinc-900">Timeline</h2>
                                        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 text-xs">
                                            <button
                                                onClick={() => setTimelinePreviewTab("operations")}
                                                className={`rounded-md px-3 py-1 font-medium ${timelinePreviewTab === "operations"
                                                    ? "bg-white text-zinc-900 shadow"
                                                    : "text-zinc-500 hover:text-zinc-800"
                                                    }`}
                                            >
                                                Operations
                                            </button>
                                            <button
                                                onClick={() => setTimelinePreviewTab("tracking")}
                                                className={`rounded-md px-3 py-1 font-medium ${timelinePreviewTab === "tracking"
                                                    ? "bg-white text-zinc-900 shadow"
                                                    : "text-zinc-500 hover:text-zinc-800"
                                                    }`}
                                            >
                                                Tracking
                                            </button>
                                            {containerStepsView.length ? (
                                                <button
                                                    onClick={() => setTimelinePreviewTab("containers")}
                                                    className={`rounded-md px-3 py-1 font-medium ${timelinePreviewTab === "containers"
                                                        ? "bg-white text-zinc-900 shadow"
                                                        : "text-zinc-500 hover:text-zinc-800"
                                                        }`}
                                                >
                                                    Containers
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>

                                    {timelinePreviewTab === "operations" ? (
                                        <>
                                            <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2">
                                                {operationsStepsView.map((s) => (
                                                    <div
                                                        key={s.id}
                                                        className={`flex h-2 flex-1 rounded-full ${s.status === "DONE"
                                                            ? "bg-green-500"
                                                            : s.status === "IN_PROGRESS"
                                                                ? "bg-blue-500"
                                                                : s.status === "BLOCKED"
                                                                    ? "bg-red-500"
                                                                    : "bg-zinc-200"
                                                            }`}
                                                        title={`${s.name}: ${stepStatusLabel(s.status)}`}
                                                    />
                                                ))}
                                            </div>
                                            {operationsStepsView.length === 0 ? (
                                                <div className="mt-3 text-sm text-zinc-500 italic">
                                                    No operations steps yet.
                                                </div>
                                            ) : null}
                                        </>
                                    ) : timelinePreviewTab === "tracking" ? (
                                        <>
                                            {trackingStepsView.length ? (
                                                <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2">
                                                    {trackingStepsView.map((s) => (
                                                        <div
                                                            key={s.id}
                                                            className={`flex h-2 flex-1 rounded-full ${s.status === "DONE"
                                                                ? "bg-green-500"
                                                                : s.status === "IN_PROGRESS"
                                                                    ? "bg-blue-500"
                                                                    : s.status === "BLOCKED"
                                                                        ? "bg-red-500"
                                                                        : "bg-zinc-200"
                                                                }`}
                                                            title={`${s.name}: ${stepStatusLabel(s.status)}`}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="mt-3 text-sm text-zinc-500 italic">
                                                    No tracking steps yet.
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {containerStepsView.length ? (
                                                <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2">
                                                    {containerStepsView.map((s) => (
                                                        <div
                                                            key={s.id}
                                                            className={`flex h-2 flex-1 rounded-full ${s.status === "DONE"
                                                                ? "bg-green-500"
                                                                : s.status === "IN_PROGRESS"
                                                                    ? "bg-blue-500"
                                                                    : s.status === "BLOCKED"
                                                                        ? "bg-red-500"
                                                                        : "bg-zinc-200"
                                                                }`}
                                                            title={`${s.name}: ${stepStatusLabel(s.status)}`}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="mt-3 text-sm text-zinc-500 italic">
                                                    No container steps yet.
                                                </div>
                                            )}
                                        </>
                                    )}

                                    <div className="mt-2 text-right">
                                        <button
                                            onClick={() =>
                                                setTab(
                                                    timelinePreviewTab === "operations"
                                                        ? "operations-steps"
                                                        : timelinePreviewTab === "tracking"
                                                            ? "tracking-steps"
                                                            : "container-steps",
                                                )
                                            }
                                            className="text-sm font-medium text-zinc-900 hover:underline"
                                        >
                                            View{" "}
                                            {timelinePreviewTab === "operations"
                                                ? "operations"
                                                : timelinePreviewTab === "tracking"
                                                    ? "tracking"
                                                    : "container"}{" "}
                                            steps
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

                                {showContainerStats ? (
                                    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                        <h2 className="text-base font-semibold text-zinc-900">Container stats</h2>
                                        <dl className="mt-4 space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <dt className="text-zinc-500">Total</dt>
                                                <dd className="font-medium text-zinc-900">{totalContainers}</dd>
                                            </div>
                                            <div className="flex justify-between">
                                                <dt className="text-zinc-500">Discharged</dt>
                                                <dd className="font-medium text-zinc-900">
                                                    {dischargedCount}/{totalContainers}
                                                </dd>
                                            </div>
                                            <div className="flex justify-between">
                                                <dt className="text-zinc-500">Pulled out</dt>
                                                <dd className="font-medium text-zinc-900">
                                                    {pulledOutCount}/{totalContainers}
                                                </dd>
                                            </div>
                                            <div className="flex justify-between">
                                                <dt className="text-zinc-500">Delivered</dt>
                                                <dd className="font-medium text-zinc-900">
                                                    {deliveredCount}/{totalContainers}
                                                </dd>
                                            </div>
                                            <div className="flex justify-between">
                                                <dt className="text-zinc-500">Returned</dt>
                                                <dd className="font-medium text-zinc-900">
                                                    {returnedCount}/{totalContainers}
                                                </dd>
                                            </div>
                                        </dl>
                                        <div className="mt-2 text-xs text-zinc-500">
                                            Live counts based on container tracking steps.
                                        </div>
                                    </div>
                                ) : null}

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

                    {activeTab === "connections" && (
                        <div className="space-y-6">
                            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-base font-semibold text-zinc-900">
                                            Connected shipments
                                        </h2>
                                        <p className="mt-1 text-sm text-zinc-500">
                                            Quick overview of related shipments.
                                        </p>
                                    </div>
                                </div>

                                {connectedShipments.length ? (
                                    <div className="mt-4 space-y-4">
                                        {connectedShipments.map((link) => {
                                            const goodsPreview = (link.goods ?? []).slice(0, 3);
                                            const docsPreview = (link.docs ?? []).slice(0, 3);
                                            return (
                                                <div
                                                    key={link.connected_shipment_id}
                                                    className="rounded-xl border border-zinc-200 bg-white p-4"
                                                >
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <div className="text-sm font-semibold text-zinc-900">
                                                                    {link.connected_shipment_code}
                                                                </div>
                                                                <Badge tone="zinc">
                                                                    {overallStatusLabel(
                                                                        link.connected_overall_status,
                                                                    )}
                                                                </Badge>
                                                                <Badge tone={riskTone(link.connected_risk)}>
                                                                    {riskLabel(link.connected_risk)}
                                                                </Badge>
                                                            </div>
                                                            <div className="mt-1 text-xs text-zinc-500">
                                                                {link.connected_origin} - {link.connected_destination}
                                                            </div>
                                                            <div className="mt-1 text-xs text-zinc-500">
                                                                Customers: {link.connected_customer_names ?? "-"}
                                                            </div>
                                                            <div className="mt-1 text-xs text-zinc-500">
                                                                Cargo: {link.connected_cargo_description}
                                                            </div>
                                                            {(link.shipment_label || link.connected_label) ? (
                                                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
                                                                    {link.shipment_label ? (
                                                                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-700">
                                                                            This: {link.shipment_label}
                                                                        </span>
                                                                    ) : null}
                                                                    {link.connected_label ? (
                                                                        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-700">
                                                                            Connected: {link.connected_label}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Link
                                                                href={`/shipments/${link.connected_shipment_id}`}
                                                                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                                                            >
                                                                Open
                                                            </Link>
                                                            {link.trackingToken ? (
                                                                <Link
                                                                    href={`/track/${link.trackingToken}`}
                                                                    className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                                                                >
                                                                    Tracking
                                                                </Link>
                                                            ) : null}
                                                            {canEdit ? (
                                                                <form
                                                                    action={deleteShipmentLinkAction.bind(
                                                                        null,
                                                                        shipment.id,
                                                                    )}
                                                                >
                                                                    <input
                                                                        type="hidden"
                                                                        name="connectedShipmentId"
                                                                        value={link.connected_shipment_id}
                                                                    />
                                                                    <button
                                                                        type="submit"
                                                                        className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                </form>
                                                            ) : null}
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                                        <div>
                                                            <div className="text-xs font-medium text-zinc-600">
                                                                Goods
                                                            </div>
                                                            {goodsPreview.length ? (
                                                                <ul className="mt-2 space-y-1 text-xs text-zinc-700">
                                                                    {goodsPreview.map((g) => (
                                                                        <li key={g.id}>
                                                                            {g.good_name} - {g.quantity} {g.unit_type}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <div className="mt-2 text-xs text-zinc-500">
                                                                    No goods lines.
                                                                </div>
                                                            )}
                                                            {link.goods?.length > goodsPreview.length ? (
                                                                <div className="mt-1 text-xs text-zinc-400">
                                                                    And {link.goods.length - goodsPreview.length} more goods
                                                                </div>
                                                            ) : null}
                                                        </div>

                                                        <div>
                                                            <div className="text-xs font-medium text-zinc-600">
                                                                Documents
                                                            </div>
                                                            {docsPreview.length ? (
                                                                <ul className="mt-2 space-y-1 text-xs text-zinc-700">
                                                                    {docsPreview.map((d) => (
                                                                        <li key={d.id}>{d.document_type}</li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <div className="mt-2 text-xs text-zinc-500">
                                                                    No documents yet.
                                                                </div>
                                                            )}
                                                            {link.docs?.length > docsPreview.length ? (
                                                                <div className="mt-1 text-xs text-zinc-400">
                                                                    And {link.docs.length - docsPreview.length} more documents
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="mt-4 text-sm text-zinc-500">
                                        No connected shipments yet.
                                    </div>
                                )}

                                {canEdit ? (
                                    <form
                                        action={createShipmentLinkAction.bind(null, shipment.id)}
                                        className="mt-6 grid gap-3 md:grid-cols-4"
                                    >
                                        <label className="block md:col-span-2">
                                            <div className="mb-1 text-xs font-medium text-zinc-600">
                                                Connect shipment
                                            </div>
                                            <input
                                                name="connectedShipment"
                                                list="connectable-shipments"
                                                placeholder="Search shipments by ID or code"
                                                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                                                required
                                            />
                                            <datalist id="connectable-shipments">
                                                {connectableShipments.map((s) => (
                                                    <option
                                                        key={s.id}
                                                        value={s.shipment_code}
                                                    >
                                                        {s.shipment_code} — {s.origin} to {s.destination}
                                                        {s.customer_names ? ` (${s.customer_names})` : ""}
                                                    </option>
                                                ))}
                                            </datalist>
                                            {connectableShipments.length === 0 ? (
                                                <div className="mt-1 text-xs text-zinc-500">
                                                    No shipments share a customer with this shipment.
                                                </div>
                                            ) : null}
                                        </label>
                                        <label className="block">
                                            <div className="mb-1 text-xs font-medium text-zinc-600">
                                                Label (this)
                                            </div>
                                            <input
                                                name="shipmentLabel"
                                                placeholder="Import"
                                                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                                            />
                                        </label>
                                        <label className="block">
                                            <div className="mb-1 text-xs font-medium text-zinc-600">
                                                Label (connected)
                                            </div>
                                            <input
                                                name="connectedLabel"
                                                placeholder="Export"
                                                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                                            />
                                        </label>
                                        <div className="md:col-span-4">
                                            <button
                                                type="submit"
                                                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                                            >
                                                Add connection
                                            </button>
                                        </div>
                                    </form>
                                ) : null}
                            </div>
                        </div>
                    )}

                    {activeTab === "operations-steps" && (
                        canUseFclTabs ? (
                            <div className="space-y-6">
                                <FclImportWorkspace
                                    headingClassName=""
                                    shipment={fclShipmentMeta}
                                    customers={shipmentCustomers}
                                    steps={fclStepData}
                                    jobIds={jobIds}
                                    containerNumbers={containerNumbers}
                                    latestDocsByType={fclLatestDocsByType}
                                    openDocRequestTypes={openDocRequestTypes}
                                    trackingToken={trackingToken}
                                    canEdit={canEdit}
                                    canAdminEdit={user.role === "ADMIN"}
                                    updateAction={fclUpdateAction!}
                                    requestDocumentAction={fclRequestAction}
                                    mode="operations"
                                    returnTo={fclOperationsReturnTo}
                                />
                            </div>
                        ) : (
                            <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-zinc-900">Operations steps</h3>
                            <div className="sticky top-28 z-10 bg-zinc-50/90 pb-3 backdrop-blur">
                                {renderStepper(operationsStepsView, effectiveOpenOperationsStepId)}
                            </div>

                            <div className="space-y-4">
                                {operationsStepsView.map((s) => (
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
                                        highlightDependencies={error === "blocked_by_dependencies" && errorStepId === s.id}
                                        partiesById={new Map([...customers, ...suppliers, ...brokers].map(p => [p.id, p]))}
                                        customers={customers}
                                        suppliers={suppliers}
                                        brokers={brokers}
                                        allocationGoods={allocationGoods}
                                        setTab={setTab}
                                        tabId="operations-steps"
                                        stepsById={stepById}
                                        workflowGlobals={workflowGlobals}
                                        isOpen={effectiveOpenOperationsStepId === s.id}
                                        onToggle={() => {
                                            setHasTouchedOperations(true);
                                            setOpenOperationsStepId((prev) =>
                                                prev === s.id ? null : s.id,
                                            );
                                        }}
                                        onDirty={markFormDirty}
                                        onClean={clearFormDirty}
                                        isDirty={dirtyFormIds.includes(`step-form-${s.id}`)}
                                    />
                                ))}
                                {operationsStepsView.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
                                        No operations steps configured.
                                    </div>
                                ) : null}
                            </div>
                            </div>
                        )
                    )}

                    {activeTab === "tracking-steps" && (
                        canUseFclTabs ? (
                            <div className="space-y-6">
                                <FclImportWorkspace
                                    headingClassName=""
                                    shipment={fclShipmentMeta}
                                    customers={shipmentCustomers}
                                    steps={fclStepData}
                                    jobIds={jobIds}
                                    containerNumbers={containerNumbers}
                                    latestDocsByType={fclLatestDocsByType}
                                    openDocRequestTypes={openDocRequestTypes}
                                    trackingToken={trackingToken}
                                    canEdit={canEdit}
                                    canAdminEdit={user.role === "ADMIN"}
                                    updateAction={fclUpdateAction!}
                                    requestDocumentAction={fclRequestAction}
                                    mode="tracking"
                                    returnTo={fclTrackingReturnTo}
                                />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-zinc-900">Tracking steps</h3>
                                <div className="sticky top-28 z-10 bg-zinc-50/90 pb-3 backdrop-blur">
                                    {renderStepper(trackingStepsView, effectiveOpenTrackingStepId)}
                                </div>
                                {trackingStepsView.map((s) => (
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
                                        highlightDependencies={error === "blocked_by_dependencies" && errorStepId === s.id}
                                        partiesById={new Map([...customers, ...suppliers, ...brokers].map(p => [p.id, p]))}
                                        customers={customers}
                                        suppliers={suppliers}
                                        brokers={brokers}
                                        allocationGoods={allocationGoods}
                                        setTab={setTab}
                                        tabId="tracking-steps"
                                        stepsById={stepById}
                                        workflowGlobals={workflowGlobals}
                                        isOpen={effectiveOpenTrackingStepId === s.id}
                                        onToggle={() => {
                                            setHasTouchedTracking(true);
                                            setOpenTrackingStepId((prev) =>
                                                prev === s.id ? null : s.id,
                                            );
                                        }}
                                        onDirty={markFormDirty}
                                        onClean={clearFormDirty}
                                        isDirty={dirtyFormIds.includes(`step-form-${s.id}`)}
                                    />
                                ))}
                                {trackingStepsView.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
                                        No tracking steps configured.
                                    </div>
                                ) : null}
                            </div>
                        )
                    )}

                    {activeTab === "container-steps" && (
                        canUseFclTabs ? (
                            <div className="space-y-6">
                                <FclImportWorkspace
                                    headingClassName=""
                                    shipment={fclShipmentMeta}
                                    customers={shipmentCustomers}
                                    steps={fclStepData}
                                    jobIds={jobIds}
                                    containerNumbers={containerNumbers}
                                    latestDocsByType={fclLatestDocsByType}
                                    openDocRequestTypes={openDocRequestTypes}
                                    trackingToken={trackingToken}
                                    canEdit={canEdit}
                                    canAdminEdit={user.role === "ADMIN"}
                                    updateAction={fclUpdateAction!}
                                    requestDocumentAction={fclRequestAction}
                                    mode="container-ops"
                                    returnTo={fclContainerReturnTo}
                                />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-zinc-900">Container steps</h3>
                                <div className="sticky top-28 z-10 bg-zinc-50/90 pb-3 backdrop-blur">
                                    {renderStepper(containerStepsView, effectiveOpenContainerStepId)}
                                </div>
                                {containerStepsView.map((s) => (
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
                                        highlightDependencies={error === "blocked_by_dependencies" && errorStepId === s.id}
                                        partiesById={new Map([...customers, ...suppliers, ...brokers].map(p => [p.id, p]))}
                                        customers={customers}
                                        suppliers={suppliers}
                                        brokers={brokers}
                                        allocationGoods={allocationGoods}
                                        setTab={setTab}
                                        tabId="container-steps"
                                        stepsById={stepById}
                                        workflowGlobals={workflowGlobals}
                                        isOpen={effectiveOpenContainerStepId === s.id}
                                        onToggle={() => {
                                            setHasTouchedContainers(true);
                                            setOpenContainerStepId((prev) =>
                                                prev === s.id ? null : s.id,
                                            );
                                        }}
                                        onDirty={markFormDirty}
                                        onClean={clearFormDirty}
                                        isDirty={dirtyFormIds.includes(`step-form-${s.id}`)}
                                    />
                                ))}
                                {containerStepsView.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600">
                                        No container steps configured.
                                    </div>
                                ) : null}
                            </div>
                        )
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
                                                            !!sg.allocated_at ||
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
                                                {shipmentCustomers.map((c) => (
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
                                                {d.source === "CUSTOMER" && <Badge tone="blue">Customer Upload</Badge>}
                                                {d.source === "CUSTOMER" && !d.is_received && (
                                                    <Badge tone="yellow">Pending Verification</Badge>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <a href={`/api/documents/${d.id}`} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50">Download</a>
                                            {d.source === "CUSTOMER" && !d.is_received && canEdit ? (
                                                <form action={updateDocumentFlagsAction.bind(null, shipment.id)}>
                                                    <input type="hidden" name="documentId" value={d.id} />
                                                    <input type="hidden" name="isRequired" value={d.is_required ? "1" : "0"} />
                                                    <input type="hidden" name="shareWithCustomer" value={d.share_with_customer ? "1" : "0"} />
                                                    <input type="hidden" name="isReceived" value="1" />
                                                    <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
                                                        Verify
                                                    </button>
                                                </form>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                                {docs.length === 0 && <div className="text-zinc-500">No documents uploaded.</div>}
                            </div>
                            <div className="space-y-6">
                                <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                                    <h3 className="font-semibold text-zinc-900">Upload Document</h3>
                                    <form action={uploadDocumentAction.bind(null, shipment.id)} className="mt-4 space-y-3">
                                        <input type="hidden" name="tab" value="documents" />
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
                                        <input type="hidden" name="tab" value="documents" />
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
            {toast ? (
                <div className="fixed top-20 right-6 z-30">
                    <div
                        className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${toast.tone === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-blue-200 bg-blue-50 text-blue-900"
                            }`}
                    >
                        {toast.message}
                    </div>
                </div>
            ) : null}
            <div className="fixed bottom-4 left-1/2 z-30 w-[min(92vw,680px)] -translate-x-1/2 rounded-2xl border border-zinc-200 bg-white/90 p-3 shadow-lg backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs font-medium text-zinc-600">
                        {dirtyCount
                            ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`
                            : "All changes saved"}
                    </div>
                    <button
                        type="button"
                        onClick={handleGlobalSave}
                        disabled={!canEdit || dirtyCount === 0 || isGlobalSaving}
                        className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                    >
                        {isGlobalSaving ? "Saving..." : "Save updates"}
                    </button>
                </div>
            </div>
        </div>
    );
}



function StepFieldInputs({
    shipmentId,
    stepId,
    schema,
    values,
    missingPaths,
    canEdit,
    latestReceivedDocByType,
    openDocRequestTypes,
    workflowGlobals,
    workflowGlobalValues,
    docTypes,
    allocationGoods,
    stepsById,
}: {
    shipmentId: number;
    stepId: number;
    schema: StepFieldSchema;
    values: StepFieldValues;
    missingPaths: Set<string>;
    canEdit: boolean;
    latestReceivedDocByType: Record<string, DocumentRow>;
    openDocRequestTypes: string[];
    workflowGlobals: WorkflowGlobalVariable[];
    workflowGlobalValues: WorkflowGlobalValues;
    docTypes: Set<string>;
    allocationGoods: ShipmentAllocationGoodRow[];
    stepsById?: Map<number, ShipmentStepRow>;
}) {
    const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
    const [groupRemovals, setGroupRemovals] = useState<Record<string, number[]>>({});
    const [choiceTabs, setChoiceTabs] = useState<Record<string, string>>({});
    const freezeMap = getFreezeMap(values);
    const globalLabelMap = new Map(
        workflowGlobals.map((variable) => [variable.id, variable.label]),
    );

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
                const globalLabel = field.linkToGlobal
                    ? globalLabelMap.get(field.linkToGlobal) ?? null
                    : null;
                const stopRef = parseStopCountdownPath(field.stopCountdownPath);
                const externalStep =
                    stopRef?.stepId && stopRef.stepId !== stepId
                        ? stepsById?.get?.(stopRef.stepId) ?? null
                        : null;
                const stopSource = externalStep
                    ? getStepFieldValues(externalStep)
                    : stopRef?.stepId && stopRef.stepId !== stepId
                        ? {}
                        : values;
                const stopValue = stopRef ? getValueAtPath(stopSource, stopRef.path) : null;
                const stopActive = isTruthyBooleanValue(stopValue);
                const freezeAt = freezeMap[encodedPath];
                const countdownText =
                    field.type === "number" && field.linkToGlobal
                        ? formatCountdownRemaining(value, workflowGlobalValues[field.linkToGlobal], stopActive ? freezeAt ?? null : null, stopActive)
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
                        {field.type === "date" && globalLabel ? (
                            <div className="mt-1 text-[11px] text-zinc-500">
                                Sets global date: {globalLabel}
                            </div>
                        ) : null}
                        {countdownText ? (
                            <div className="mt-1 text-[11px] text-zinc-500">
                                {countdownText}
                            </div>
                        ) : null}
                    </label>
                );
            }

            if (field.type === "boolean") {
                const raw = fieldValues[field.id];
                const checked = isTruthyBooleanValue(raw);
                return (
                    <label key={fieldKey} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
                        <input type="hidden" name={fieldInputName(fieldPath)} value="" />
                        <input
                            type="checkbox"
                            name={fieldInputName(fieldPath)}
                            value="1"
                            defaultChecked={checked}
                            disabled={!canEdit || disabled}
                            className={`h-4 w-4 rounded border ${showMissing ? "border-red-300" : "border-zinc-300"}`}
                        />
                        <span className="text-sm text-zinc-700">{field.label}</span>
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
                        {allocationGoods.length ? (
                            <div className="mt-2 space-y-2">
                                {allocationGoods.map((sg) => {
                                    const key = `good-${sg.id}`;
                                    const raw = goodsValues[key];
                                    const value = typeof raw === "string" ? raw : "";
                                    const available = Math.max(0, sg.quantity - sg.allocated_quantity);
                                    const exhausted = available <= 0;
                                    const isConnected = sg.shipment_id !== shipmentId;
                                    const customerLabel = sg.applies_to_all_customers
                                        ? "All customers"
                                        : sg.customer_name ?? "-";
                                    return (
                                        <div
                                            key={sg.id}
                                            className={`rounded-lg border px-3 py-2 text-xs ${exhausted ? "border-zinc-200 bg-zinc-50 text-zinc-400" : "border-zinc-200 bg-white"}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div>
                                                    <div className="font-medium text-zinc-900">{sg.good_name}</div>
                                                    <div className="text-[11px] text-zinc-500">
                                                        {sg.good_origin} - {sg.quantity} {sg.unit_type} - {customerLabel}
                                                    </div>
                                                    {isConnected ? (
                                                        <div className="mt-1 text-[11px] text-zinc-500">
                                                            From {sg.shipment_code}
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {isConnected ? <Badge tone="blue">Connected</Badge> : null}
                                                    {exhausted ? <Badge tone="green">Allocated</Badge> : null}
                                                </div>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                                                <span>
                                                    Available: {available} {sg.unit_type}
                                                </span>
                                                {sg.allocated_quantity > 0 ? (
                                                    <span>Already taken: {sg.allocated_quantity}</span>
                                                ) : null}
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
                                                    max={available}
                                                    step={1}
                                                    disabled={!canEdit || disabled || exhausted}
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
                const requested = openDocRequestTypes.includes(docType);
                return (
                    <div key={fieldKey} className="rounded-lg border border-zinc-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-700">
                            <span>{field.label}</span>
                            {received ? <Badge tone="green">Uploaded</Badge> : requested ? <Badge tone="yellow">Requested</Badge> : null}
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
                                {!received && !requested && canEdit && !disabled ? (
                                    <button
                                        type="submit"
                                        formAction={requestDocumentAction.bind(
                                            null,
                                            shipmentId,
                                            docType,
                                        )}
                                        className="mt-2 inline-flex items-center rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
                                    >
                                        Request from customer
                                    </button>
                                ) : null}
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
                const finalOptions = field.options.filter((opt) => opt.is_final);
                const completedFinalOptions = finalOptions.filter((option) =>
                    isOptionComplete(
                        stepId,
                        option,
                        choiceValues[option.id],
                        docTypes,
                        missingPaths,
                        [...fieldPath, option.id],
                    ),
                );
                const finalComplete = completedFinalOptions.length > 0;
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
                const primaryFinalId = completedFinalOptions[0]?.id ?? finalOptions[0]?.id ?? "";
                const activeOptionId =
                    choiceTabs[encodedPath] ??
                    (finalComplete && primaryFinalId ? primaryFinalId : fallbackOptionId);

                return (
                    <div key={fieldKey} className={`rounded-lg border bg-white p-3 ${choiceMissing ? "border-red-200" : "border-zinc-200"}`}>
                        <div className="text-xs font-medium text-zinc-700">{field.label}</div>
                        <div className="mt-3">
                            <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
                                {field.options.map((option) => {
                                    const optionPath = [...fieldPath, option.id];
                                    const optionEncoded = encodeFieldPath(optionPath);
                                    const superseded = finalComplete && !option.is_final;
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
                                    const superseded = finalComplete && !option.is_final;
                                    const optionMissing = hasMissingUnderPath(missingPaths, optionEncoded) && !superseded && !disabled;
                                    const isActive = option.id === activeOptionId;
                                    const optionHasValue = hasAnyFieldValue(
                                        stepId,
                                        option.fields,
                                        optionValues,
                                        docTypes,
                                        optionPath,
                                    );
                                    const optionMessage =
                                        option.customer_message_visible && option.customer_message
                                            ? String(option.customer_message).trim()
                                            : "";
                                    const showCustomerMessage =
                                        optionHasValue && !superseded && !!optionMessage;

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
                                            {showCustomerMessage ? (
                                                <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
                                                    Customer message: {optionMessage}
                                                </div>
                                            ) : null}
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

// Step card component shared by operations, tracking, and container tabs.
// Helper functions for parsing step data and handling checklists.
function jsonParse<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function parseRequiredFields(step: ShipmentStepRow): string[] {
    return jsonParse(step.required_fields_json, [] as string[]);
}

function parseRequiredDocumentTypes(step: ShipmentStepRow): string[] {
    return jsonParse(step.required_document_types_json, [] as string[]);
}

function parseChecklistGroups(step: ShipmentStepRow): ChecklistGroup[] {
    return jsonParse(step.checklist_groups_json, [] as ChecklistGroup[]);
}

function parseDependsOn(step: ShipmentStepRow): number[] {
    return jsonParse(step.depends_on_step_ids_json, [] as number[]);
}

function getStepFieldSchema(step: ShipmentStepRow): StepFieldSchema {
    const schema = parseStepFieldSchema(step.field_schema_json);
    if (schema.fields.length > 0) return schema;
    const legacyFields = parseRequiredFields(step);
    if (legacyFields.length > 0) return schemaFromLegacyFields(legacyFields);
    return schema;
}

function getStepFieldValues(step: ShipmentStepRow): StepFieldValues {
    return parseStepFieldValues(step.field_values_json);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object") return false;
    return Object.getPrototypeOf(value) === Object.prototype;
}

function toRecord(value: unknown): Record<string, unknown> {
    return isPlainObject(value) ? value : {};
}

const COUNTDOWN_FREEZE_KEY = "__countdown_freeze__";

function isTruthyBooleanValue(value: unknown): boolean {
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function getFreezeMap(values: StepFieldValues): Record<string, string> {
    const raw = values[COUNTDOWN_FREEZE_KEY];
    if (!isPlainObject(raw)) return {};
    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(raw)) {
        if (typeof entry === "string") {
            result[key] = entry;
        }
    }
    return result;
}

function normalizeDate(value: string): Date | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return null;
    const date = new Date(parsed);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatCountdownRemaining(
    totalRaw: string,
    globalDateRaw?: string | null,
    freezeAtRaw?: string | null,
    isStopped?: boolean,
): string | null {
    if (!totalRaw || !globalDateRaw) return null;
    const total = Number(totalRaw);
    if (!Number.isFinite(total)) return null;
    const globalDate = normalizeDate(globalDateRaw);
    if (!globalDate) return null;
    const anchor = freezeAtRaw ? normalizeDate(freezeAtRaw) : null;
    const today = anchor ?? new Date();
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffMs = base.getTime() - globalDate.getTime();
    const daysSince = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const remaining = Math.ceil(total - daysSince);
    let message = "";
    if (remaining === 0) {
        message = "Due today";
    } else if (remaining > 0) {
        message = `Remaining: ${remaining} day${remaining === 1 ? "" : "s"}`;
    } else {
        const overdue = Math.abs(remaining);
        message = `Overdue by ${overdue} day${overdue === 1 ? "" : "s"}`;
    }
    return isStopped ? `${message} (stopped)` : message;
}

function getValueAtPath(values: StepFieldValues, path: string[]): StepFieldValue | undefined {
    let current: StepFieldValue | undefined = values;
    for (const segment of path) {
        if (!current) return undefined;
        if (Array.isArray(current)) {
            if (!/^[0-9]+$/.test(segment)) return undefined;
            current = current[Number(segment)];
            continue;
        }
        if (!isPlainObject(current)) return undefined;
        current = current[segment] as StepFieldValue | undefined;
    }
    return current;
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
        if (field.type === "boolean") {
            const value = container[field.id];
            if (isTruthyBooleanValue(value)) return true;
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

function getFinalChecklistItem(items: ChecklistItem[]): ChecklistItem | null {
    if (!items.length) return null;
    const explicit = items.find((i) => i.is_final);
    return explicit ?? items[items.length - 1] ?? null;
}

type StepCardProps = {
    step: ShipmentStepRow;
    user: AuthUser;
    shipment: ShipmentViewShipment;
    canEdit: boolean;
    workflowBlocked: boolean;
    receivedDocTypes: string[];
    openDocRequestTypes: string[];
    latestReceivedDocByType: Record<string, DocumentRow>;
    workflowGlobalValues: WorkflowGlobalValues;
    workflowGlobals: WorkflowGlobalVariable[];
    highlightRequirements: boolean;
    highlightDependencies: boolean;
    partiesById: Map<number, PartyRow>;
    customers: PartyRow[];
    suppliers: PartyRow[];
    brokers: PartyRow[];
    allocationGoods: ShipmentAllocationGoodRow[];
    setTab: (tab: ShipmentTabId) => void;
    tabId: ShipmentTabId;
    stepsById: Map<number, ShipmentStepRow>;
    isOpen: boolean;
    onToggle: () => void;
    onDirty: (formId: string) => void;
    onClean: (formId: string) => void;
    isDirty: boolean;
};

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
    workflowGlobals,
    highlightRequirements,
    highlightDependencies,
    partiesById,
    customers,
    suppliers,
    brokers,
    allocationGoods,
    setTab,
    tabId,
    stepsById,
    isOpen,
    onToggle,
    onDirty,
    onClean,
    isDirty,
}: StepCardProps) {
    const fieldSchema = getStepFieldSchema(step);
    const fieldValues = getStepFieldValues(step);
    const requiredDocs = parseRequiredDocumentTypes(step);
    const checklistGroups = parseChecklistGroups(step);
    const receivedDocTypesList = Array.isArray(receivedDocTypes)
        ? receivedDocTypes.filter((dt): dt is string => typeof dt === "string")
        : [];

    const docTypes = new Set(receivedDocTypesList);
    const missingFieldPaths = collectMissingFieldPaths(fieldSchema, {
        stepId: step.id,
        values: fieldValues,
        docTypes,
    });
    const missingRequiredDocs = requiredDocs.filter(
        (dt) => !receivedDocTypesList.includes(dt),
    );

    const isChecklistItemComplete = (
        group: { name: string },
        item: { label: string },
    ) => {
        const dateKey = checklistDateKey(group.name, item.label);
        const dateValue = String((fieldValues as Record<string, unknown>)[dateKey] ?? "").trim();
        const docType = checklistDocType(group.name, item.label);
        return !!dateValue && receivedDocTypesList.includes(docType);
    };

    const missingChecklistGroups = checklistGroups.filter((group) => {
        const items = group.items ?? [];
        if (!items.length) return false;
        const finalItem = getFinalChecklistItem(items);
        if (finalItem && isChecklistItemComplete(group, finalItem)) return false;
        return !items.some((item) => isChecklistItemComplete(group, item));
    });

    const dependencyIds = parseDependsOn(step);
    const unmetDependencyIds = dependencyIds.filter((id) => {
        const dep = stepsById?.get?.(id);
        return !dep || dep.status !== "DONE";
    });
    const blockedByDependencies = unmetDependencyIds.length > 0 && step.status !== "DONE";

    const canMarkDone =
        missingFieldPaths.size === 0 &&
        missingRequiredDocs.length === 0 &&
        missingChecklistGroups.length === 0 &&
        !blockedByDependencies;
    const highlightFieldPaths = highlightRequirements ? missingFieldPaths : new Set<string>();
    const hasRequirements =
        fieldSchema.fields.length > 0 ||
        requiredDocs.length > 0 ||
        checklistGroups.length > 0;

    const isMyStep = step.owner_role === user.role;
    const blockedByException = workflowBlocked && step.status !== "DONE";
    const canEditStepStatus = canEdit && !blockedByException && !blockedByDependencies;
    const relatedParty = step.related_party_id
        ? partiesById.get(step.related_party_id) ?? null
        : null;
    const isTracking = step.is_external === 1;
    const formId = `step-form-${step.id}`;
    const statusStyles = stepStatusStyles(step.status);
    const cardBorder =
        highlightRequirements || highlightDependencies
            ? "border-red-200 ring-2 ring-red-50"
            : isMyStep
                ? "border-blue-200"
                : "border-zinc-200";
    const cardBackground = step.status === "DONE" ? "bg-amber-50/40" : "bg-white";
    const [isSaving, setIsSaving] = useState(false);

    return (
        <div
            id={`step-${step.id}`}
            className={`scroll-mt-32 rounded-xl border ${cardBackground} ${cardBorder} border-l-4 ${statusStyles.border}`}
        >
            <div
                className={`flex flex-wrap items-start justify-between gap-3 rounded-t-xl px-4 py-3 ${statusStyles.header} ${isOpen ? "border-b border-zinc-200" : ""}`}
            >
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={isOpen}
                    aria-controls={`step-body-${step.id}`}
                    className="flex min-w-0 flex-1 flex-col text-left"
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-zinc-900">
                            {step.sort_order}. {step.name}
                        </div>
                        <Badge tone={stepTone(step.status)}>
                            {stepStatusLabel(step.status)}
                        </Badge>
                        {isDirty ? <Badge tone="yellow">Unsaved</Badge> : null}
                        {isMyStep ? <Badge tone="blue">Your step</Badge> : null}
                        {isTracking ? <Badge tone="yellow">Tracking</Badge> : null}
                        {blockedByException ? (
                            <Badge tone="red">Blocked by exception</Badge>
                        ) : null}
                        {blockedByDependencies ? (
                            <Badge tone="zinc">Blocked by dependencies</Badge>
                        ) : null}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
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
                </button>
                <div className="flex items-center gap-2">
                    <button
                        type="submit"
                        form={formId}
                        disabled={!canEdit || isSaving}
                        onClick={() => setIsSaving(true)}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100"
                    >
                        {isSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                        type="button"
                        onClick={onToggle}
                        className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                        {isOpen ? "Collapse" : "Expand"}
                    </button>
                </div>
            </div>

            <div
                id={`step-body-${step.id}`}
                className={isOpen ? "px-4 pb-4" : "hidden"}
            >
                {dependencyIds.length ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                        <span className="font-medium text-zinc-600">Depends on:</span>
                        {dependencyIds.map((id) => {
                            const dep = stepsById?.get?.(id);
                            const label = dep ? `${dep.sort_order}. ${dep.name}` : `Step ${id}`;
                            const tone = dep && dep.status === "DONE" ? "green" : "zinc";
                            return (
                                <span
                                    key={`dep-${step.id}-${id}`}
                                    className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5"
                                >
                                    <span className="text-zinc-700">{label}</span>
                                    <Badge tone={tone}>
                                        {dep ? stepStatusLabel(dep.status) : "Missing"}
                                    </Badge>
                                </span>
                            );
                        })}
                    </div>
                ) : null}

                {highlightRequirements ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                        Missing requirements. Fill required fields, documents, or checklist
                        items, then try marking Done again.
                    </div>
                ) : null}
                {highlightDependencies ? (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                        Complete the dependency steps before updating the status.
                    </div>
                ) : null}

                {requiredDocs.length ? (
                    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs font-medium text-zinc-700">
                            Required documents
                        </div>
                        <div className="mt-2 flex flex-col gap-2">
                            {requiredDocs.map((dt) => {
                                const received = receivedDocTypesList.includes(dt);
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
                                    setTab("documents");
                                    setTimeout(() => document.getElementById("documents")?.scrollIntoView({ behavior: 'smooth' }), 100);
                                }}
                                className="font-medium text-zinc-700 hover:underline"
                            >
                                Go to documents
                            </button>
                        </div>
                    </div>
                ) : null}

                <form
                    id={formId}
                    action={updateStepAction.bind(null, shipment.id)}
                    className="mt-4 space-y-3"
                    onChange={() => onDirty?.(formId)}
                    onSubmit={() => {
                        setIsSaving(true);
                        onClean?.(formId);
                    }}
                >
                <input type="hidden" name="stepId" value={step.id} />
                <input type="hidden" name="tab" value={tabId} />

                {fieldSchema.fields.length ? (
                    <StepFieldInputs
                        shipmentId={shipment.id}
                        stepId={step.id}
                        schema={fieldSchema}
                        values={fieldValues}
                        missingPaths={highlightFieldPaths}
                        canEdit={canEdit}
                        latestReceivedDocByType={latestReceivedDocByType}
                        openDocRequestTypes={openDocRequestTypes}
                        workflowGlobals={workflowGlobals}
                        workflowGlobalValues={workflowGlobalValues}
                        docTypes={docTypes}
                        allocationGoods={allocationGoods}
                        stepsById={stepsById}
                    />
                ) : null}

                {checklistGroups.length ? (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs font-medium text-zinc-700">Checklist</div>
                        <div className="mt-2 space-y-3">
                            {checklistGroups.map((group, groupIndex) => {
                                const items = group.items ?? [];
                                const finalItem = getFinalChecklistItem(items);
                                const finalComplete = !!(
                                    finalItem && isChecklistItemComplete(group, finalItem)
                                );
                                const groupComplete =
                                    finalComplete ||
                                    items.some((item) => isChecklistItemComplete(group, item));

                                return (
                                    <div
                                        key={`${group.name}-${groupIndex}`}
                                        className="rounded-lg border border-zinc-200 bg-white p-3"
                                    >
                                        <div className="text-xs font-medium text-zinc-700">
                                            {group.name}
                                        </div>
                                        <div className="mt-2 space-y-2">
                                            {items.map((item, itemIndex) => {
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
                                                const received = receivedDocTypesList.includes(docType);
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
                                {customers.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </optgroup>
                        ) : null}
                        {suppliers.length ? (
                            <optgroup label="Suppliers">
                                {suppliers.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </optgroup>
                        ) : null}
                        {brokers.length ? (
                            <optgroup label="Customs brokers">
                                {brokers.map((p) => (
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
                        {blockedByDependencies ? (
                            <div className="mt-1 text-xs text-zinc-500">
                                Status updates are disabled until the dependency steps are done.
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
    </div>
    );
}
