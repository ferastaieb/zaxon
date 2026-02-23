"use client";

import * as React from "react";

import { cn } from "@/lib/cn";

type DatePickerInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function isoFromDate(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function parseIsoToDate(isoValue: string): Date | null {
  if (!isoValue) return null;
  const parsed = new Date(`${isoValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizeIso(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? "" : trimmed;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return isoFromDate(parsed);
}

function formatDateLabel(isoValue: string): string {
  if (!isoValue) return "";
  const parsed = new Date(`${isoValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function parseTextToIso(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return isoFromDate(parsed);
}

function isOutOfRange(isoValue: string, minIso: string, maxIso: string): boolean {
  if (!isoValue) return false;
  if (minIso && isoValue < minIso) return true;
  if (maxIso && isoValue > maxIso) return true;
  return false;
}

type CalendarCell = {
  iso: string;
  dayNumber: number;
  inCurrentMonth: boolean;
};

function buildMonthCells(month: Date): CalendarCell[] {
  const first = startOfMonth(month);
  const startWeekday = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startWeekday);

  const cells: CalendarCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    cells.push({
      iso: isoFromDate(day),
      dayNumber: day.getDate(),
      inCurrentMonth: day.getMonth() === month.getMonth(),
    });
  }
  return cells;
}

function monthTitle(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function DatePickerInput({
  className,
  name,
  id,
  value,
  defaultValue,
  placeholder,
  disabled,
  required,
  min,
  max,
  onChange,
  onBlur,
  onFocus,
  ...rest
}: DatePickerInputProps) {
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const hiddenInputRef = React.useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = React.useState(false);

  const minIso = normalizeIso(min);
  const maxIso = normalizeIso(max);

  const controlled = value !== undefined;
  const controlledIso = normalizeIso(value);
  const [uncontrolledIso, setUncontrolledIso] = React.useState(() =>
    normalizeIso(defaultValue),
  );

  const isoValue = controlled ? controlledIso : uncontrolledIso;

  const [month, setMonth] = React.useState<Date>(
    () => parseIsoToDate(isoValue) ?? startOfMonth(new Date()),
  );
  const [textValue, setTextValue] = React.useState(() =>
    formatDateLabel(isoValue),
  );
  const cells = React.useMemo(() => buildMonthCells(month), [month]);

  React.useEffect(() => {
    setTextValue(formatDateLabel(isoValue));
    const parsed = parseIsoToDate(isoValue);
    if (parsed) {
      setMonth(startOfMonth(parsed));
    }
  }, [isoValue]);

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const emitOnChange = React.useCallback(
    (nextIso: string) => {
      if (!onChange) return;
      const target =
        hiddenInputRef.current ??
        ({
          name: name ?? "",
          id: id ?? "",
          value: nextIso,
        } as HTMLInputElement);
      target.value = nextIso;
      onChange({
        target,
        currentTarget: target,
      } as React.ChangeEvent<HTMLInputElement>);
    },
    [id, name, onChange],
  );

  const commitIsoValue = React.useCallback(
    (nextIso: string) => {
      if (isOutOfRange(nextIso, minIso, maxIso)) return;

      if (!controlled) {
        setUncontrolledIso(nextIso);
      }
      setTextValue(formatDateLabel(nextIso));
      const parsed = parseIsoToDate(nextIso);
      if (parsed) {
        setMonth(startOfMonth(parsed));
      }
      emitOnChange(nextIso);
    },
    [controlled, emitOnChange, maxIso, minIso],
  );

  const triggerPicker = () => {
    setOpen((prev) => !prev);
  };

  const clearDate = () => {
    commitIsoValue("");
    setOpen(false);
  };

  const setToday = () => {
    const todayIso = isoFromDate(new Date());
    if (isOutOfRange(todayIso, minIso, maxIso)) return;
    commitIsoValue(todayIso);
    setOpen(false);
  };

  return (
    <div ref={popoverRef} className="relative">
      <input ref={hiddenInputRef} type="hidden" name={name} value={isoValue} />
      <input
        id={id}
        type="text"
        value={textValue}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        onFocus={onFocus}
        onBlur={(event) => {
          setTextValue(formatDateLabel(isoValue));
          onBlur?.(event);
        }}
        onChange={(event) => {
          const nextText = event.target.value;
          setTextValue(nextText);
          const parsed = parseTextToIso(nextText);
          if (parsed !== null) {
            commitIsoValue(parsed);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 pr-9 text-sm disabled:bg-zinc-100",
          className,
        )}
        {...rest}
      />
      <button
        type="button"
        onClick={triggerPicker}
        disabled={disabled}
        aria-label="Select date"
        aria-expanded={open}
        className="absolute inset-y-0 right-0 inline-flex w-9 items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-300"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4 fill-none" aria-hidden="true">
          <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 2.5V5.5M14 2.5V5.5M3 8.5H17" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth((prev) => addMonths(prev, -1))}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              aria-label="Previous month"
            >
              Prev
            </button>
            <div className="text-sm font-semibold text-zinc-900">{monthTitle(month)}</div>
            <button
              type="button"
              onClick={() => setMonth((prev) => addMonths(prev, 1))}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              aria-label="Next month"
            >
              Next
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((day) => (
              <div
                key={day}
                className="py-1 text-center text-[11px] font-medium text-zinc-500"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const isSelected = cell.iso === isoValue;
              const disabledDay = isOutOfRange(cell.iso, minIso, maxIso);
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={disabledDay}
                  onClick={() => {
                    commitIsoValue(cell.iso);
                    setOpen(false);
                  }}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-sm transition-colors",
                    cell.inCurrentMonth ? "text-zinc-900" : "text-zinc-400",
                    isSelected ? "bg-blue-600 text-white hover:bg-blue-600" : "hover:bg-zinc-100",
                    disabledDay ? "cursor-not-allowed text-zinc-300 hover:bg-transparent" : "",
                  )}
                >
                  {cell.dayNumber}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2">
            <button
              type="button"
              onClick={clearDate}
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={setToday}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
