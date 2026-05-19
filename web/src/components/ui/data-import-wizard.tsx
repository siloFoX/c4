import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ChangeEvent,
  ForwardedRef,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Upload,
} from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.449, TODO 11.431) DataImportWizard primitive.
//
// Five-step wizard: upload -> map -> preview -> import -> done.
// File upload (with drag-and-drop), column mapping between
// source headers and target schema, validation preview with
// row-level error chips, batch import progress, and a final
// error report with per-row drill-down.
//
// Hosts wire the actual file parsing + import network calls;
// the primitive owns the wizard state machine + ARIA wiring +
// data-section markers.
//
// Reference: /root/c4/arps-design-system-v1/.

export type ImportWizardStep =
  | 'upload'
  | 'map'
  | 'preview'
  | 'import'
  | 'done';

export interface ImportColumn {
  key: string;
  label: string;
  required?: boolean;
  description?: string;
}

export interface ImportRowError {
  column?: string;
  message: string;
}

export interface ImportRow {
  index: number;
  values: Record<string, string>;
  errors?: ImportRowError[];
}

export interface ImportWizardLabels {
  upload?: string;
  map?: string;
  preview?: string;
  import?: string;
  done?: string;
  next?: string;
  back?: string;
  retry?: string;
  close?: string;
  importAction?: string;
}

export interface DataImportWizardProps {
  step?: ImportWizardStep;
  defaultStep?: ImportWizardStep;
  onStepChange?: (step: ImportWizardStep) => void;

  acceptedFileTypes?: readonly string[];
  uploadedFile?: File | null;
  onFileUpload?: (file: File) => Promise<void> | void;

  sourceColumns?: readonly string[];
  targetColumns?: readonly ImportColumn[];
  mapping?: Record<string, string>;
  defaultMapping?: Record<string, string>;
  onMappingChange?: (mapping: Record<string, string>) => void;

  previewRows?: readonly ImportRow[];
  previewSummary?: { valid: number; invalid: number };

  importProgress?: number;
  isImporting?: boolean;

  errorRows?: readonly ImportRow[];
  successCount?: number;
  errorCount?: number;

  onImport?: () => Promise<void> | void;
  onRetry?: () => void;
  onClose?: () => void;

  labels?: ImportWizardLabels;
  ariaLabel?: string;
  className?: string;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const IMPORT_WIZARD_STEPS: readonly ImportWizardStep[] = [
  'upload',
  'map',
  'preview',
  'import',
  'done',
];

export const IMPORT_WIZARD_STEP_LABELS: Record<
  ImportWizardStep,
  string
> = {
  upload: 'Upload',
  map: 'Map columns',
  preview: 'Preview',
  import: 'Import',
  done: 'Done',
};

export function getImportStepIndex(step: ImportWizardStep): number {
  const i = IMPORT_WIZARD_STEPS.indexOf(step);
  return i < 0 ? 0 : i;
}

export function getNextImportStep(
  step: ImportWizardStep,
): ImportWizardStep {
  const i = getImportStepIndex(step);
  return IMPORT_WIZARD_STEPS[
    Math.min(i + 1, IMPORT_WIZARD_STEPS.length - 1)
  ]!;
}

export function getPrevImportStep(
  step: ImportWizardStep,
): ImportWizardStep {
  const i = getImportStepIndex(step);
  return IMPORT_WIZARD_STEPS[Math.max(i - 1, 0)]!;
}

export function validateImportMapping(
  mapping: Record<string, string>,
  targetColumns: readonly ImportColumn[],
): { ok: boolean; missing: string[] } {
  const mappedTargets = new Set(Object.values(mapping));
  const missing: string[] = [];
  for (const col of targetColumns) {
    if (col.required && !mappedTargets.has(col.key)) {
      missing.push(col.key);
    }
  }
  return { ok: missing.length === 0, missing };
}

export function isImportMappingComplete(
  mapping: Record<string, string>,
  targetColumns: readonly ImportColumn[],
): boolean {
  return validateImportMapping(mapping, targetColumns).ok;
}

export function clampImportProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function formatImportProgressPercent(value: number): string {
  const v = clampImportProgress(value);
  return `${Math.round(v * 100)}%`;
}

function resolveLabels(
  labels?: ImportWizardLabels,
): Required<ImportWizardLabels> {
  return {
    upload: labels?.upload ?? IMPORT_WIZARD_STEP_LABELS.upload,
    map: labels?.map ?? IMPORT_WIZARD_STEP_LABELS.map,
    preview: labels?.preview ?? IMPORT_WIZARD_STEP_LABELS.preview,
    import: labels?.import ?? IMPORT_WIZARD_STEP_LABELS.import,
    done: labels?.done ?? IMPORT_WIZARD_STEP_LABELS.done,
    next: labels?.next ?? 'Next',
    back: labels?.back ?? 'Back',
    retry: labels?.retry ?? 'Retry',
    close: labels?.close ?? 'Close',
    importAction: labels?.importAction ?? 'Start import',
  };
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const DataImportWizard = forwardRef(function DataImportWizard(
  {
    step: stepProp,
    defaultStep = 'upload',
    onStepChange,

    acceptedFileTypes = ['.csv', '.json', '.xlsx'],
    uploadedFile,
    onFileUpload,

    sourceColumns = [],
    targetColumns = [],
    mapping,
    defaultMapping,
    onMappingChange,

    previewRows = [],
    previewSummary,

    importProgress = 0,
    isImporting = false,

    errorRows = [],
    successCount,
    errorCount,

    onImport,
    onRetry,
    onClose,

    labels,
    ariaLabel = 'Data import wizard',
    className,
  }: DataImportWizardProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const resolvedLabels = useMemo(() => resolveLabels(labels), [labels]);

  const isStepControlled = stepProp !== undefined;
  const [internalStep, setInternalStep] = useState<ImportWizardStep>(
    defaultStep,
  );
  const effectiveStep: ImportWizardStep = isStepControlled
    ? (stepProp ?? defaultStep)
    : internalStep;

  const onStepChangeRef = useRef(onStepChange);
  useEffect(() => {
    onStepChangeRef.current = onStepChange;
  }, [onStepChange]);

  const emitStep = useCallback(
    (next: ImportWizardStep) => {
      if (!isStepControlled) setInternalStep(next);
      onStepChangeRef.current?.(next);
    },
    [isStepControlled],
  );

  const isMappingControlled = mapping !== undefined;
  const [internalMapping, setInternalMapping] = useState<
    Record<string, string>
  >(defaultMapping ?? {});
  const effectiveMapping = isMappingControlled
    ? (mapping ?? {})
    : internalMapping;

  const onMappingChangeRef = useRef(onMappingChange);
  useEffect(() => {
    onMappingChangeRef.current = onMappingChange;
  }, [onMappingChange]);

  const emitMapping = useCallback(
    (next: Record<string, string>) => {
      if (!isMappingControlled) setInternalMapping(next);
      onMappingChangeRef.current?.(next);
    },
    [isMappingControlled],
  );

  const handleMappingChange = useCallback(
    (sourceCol: string, targetKey: string) => {
      const next = { ...effectiveMapping };
      if (targetKey === '') {
        delete next[sourceCol];
      } else {
        next[sourceCol] = targetKey;
      }
      emitMapping(next);
    },
    [effectiveMapping, emitMapping],
  );

  const handleFileInput = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await onFileUpload?.(file);
    },
    [onFileUpload],
  );

  const [isDragging, setIsDragging] = useState(false);
  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      await onFileUpload?.(file);
    },
    [onFileUpload],
  );

  const handleNext = useCallback(() => {
    emitStep(getNextImportStep(effectiveStep));
  }, [effectiveStep, emitStep]);

  const handleBack = useCallback(() => {
    emitStep(getPrevImportStep(effectiveStep));
  }, [effectiveStep, emitStep]);

  const handleStartImport = useCallback(async () => {
    emitStep('import');
    await onImport?.();
  }, [emitStep, onImport]);

  const mappingValidation = useMemo(
    () => validateImportMapping(effectiveMapping, targetColumns),
    [effectiveMapping, targetColumns],
  );

  const stepIndex = getImportStepIndex(effectiveStep);
  const isFirstStep = stepIndex === 0;
  const isLastStep =
    stepIndex === IMPORT_WIZARD_STEPS.length - 1;

  const [expandedErrorRow, setExpandedErrorRow] = useState<
    number | null
  >(null);
  const toggleErrorRow = useCallback((index: number) => {
    setExpandedErrorRow((prev) => (prev === index ? null : index));
  }, []);

  // --- Step gating ---------------------------------------
  const nextDisabled =
    (effectiveStep === 'upload' && !uploadedFile) ||
    (effectiveStep === 'map' && !mappingValidation.ok) ||
    (effectiveStep === 'preview' &&
      previewSummary !== undefined &&
      previewSummary.valid === 0) ||
    effectiveStep === 'import' ||
    effectiveStep === 'done';

  const progressClamped = clampImportProgress(importProgress);
  const progressPercent = Math.round(progressClamped * 100);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="data-import-wizard"
      data-step={effectiveStep}
      data-step-index={stepIndex}
      data-mapping-complete={
        mappingValidation.ok ? 'true' : 'false'
      }
      data-importing={isImporting ? 'true' : 'false'}
      className={cn(
        'flex w-full flex-col gap-4 rounded-md border border-border bg-card p-4',
        className,
      )}
    >
      <nav
        role="navigation"
        aria-label="Wizard steps"
        data-section="data-import-wizard-steps"
      >
        <ol className="flex items-center gap-2">
          {IMPORT_WIZARD_STEPS.map((s, i) => {
            const active = s === effectiveStep;
            const completed = i < stepIndex;
            return (
              <li
                key={s}
                data-section="data-import-wizard-step"
                data-step={s}
                data-state={
                  completed ? 'completed' : active ? 'active' : 'pending'
                }
                className="flex items-center gap-2 text-xs"
                aria-current={active ? 'step' : undefined}
              >
                <span
                  data-section="data-import-wizard-step-marker"
                  className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold',
                    completed
                      ? 'bg-primary text-primary-foreground border-primary'
                      : active
                        ? 'bg-background text-primary border-primary'
                        : 'bg-background text-muted-foreground border-border',
                  )}
                >
                  {completed ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  data-section="data-import-wizard-step-label"
                  className={cn(
                    active ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {resolvedLabels[s]}
                </span>
                {i < IMPORT_WIZARD_STEPS.length - 1 ? (
                  <span
                    aria-hidden="true"
                    data-section="data-import-wizard-step-connector"
                    className="h-px w-4 bg-border"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <div
        data-section="data-import-wizard-body"
        className="flex flex-col gap-3"
      >
        {effectiveStep === 'upload' ? (
          <div
            data-section="data-import-wizard-upload"
            data-dragging={isDragging ? 'true' : 'false'}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm',
              isDragging && 'border-primary bg-primary/5',
            )}
          >
            <Upload
              aria-hidden="true"
              className="h-6 w-6 text-muted-foreground"
            />
            <p className="text-muted-foreground">
              Drag and drop a file, or
            </p>
            <label
              data-section="data-import-wizard-upload-label"
              className="inline-flex cursor-pointer items-center gap-2 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Choose file
              <input
                type="file"
                aria-label="Choose import file"
                data-section="data-import-wizard-upload-input"
                accept={acceptedFileTypes.join(',')}
                onChange={handleFileInput}
                className="hidden"
              />
            </label>
            {uploadedFile ? (
              <p
                data-section="data-import-wizard-upload-file"
                className="text-xs text-foreground"
              >
                Selected: {uploadedFile.name}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Accepted: {acceptedFileTypes.join(', ')}
            </p>
          </div>
        ) : null}

        {effectiveStep === 'map' ? (
          <div
            data-section="data-import-wizard-map"
            className="flex flex-col gap-2"
          >
            <p className="text-sm text-muted-foreground">
              Map source columns to target fields.
            </p>
            <table
              role="table"
              data-section="data-import-wizard-map-table"
              className="w-full text-left text-sm"
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="border-b border-border px-2 py-1 text-xs uppercase text-muted-foreground"
                  >
                    Source
                  </th>
                  <th
                    scope="col"
                    className="border-b border-border px-2 py-1 text-xs uppercase text-muted-foreground"
                  >
                    Target
                  </th>
                </tr>
              </thead>
              <tbody>
                {sourceColumns.map((sourceCol) => (
                  <tr
                    key={sourceCol}
                    data-section="data-import-wizard-map-row"
                    data-source={sourceCol}
                  >
                    <td className="px-2 py-1 font-medium text-foreground">
                      {sourceCol}
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={effectiveMapping[sourceCol] ?? ''}
                        onChange={(e) =>
                          handleMappingChange(
                            sourceCol,
                            e.target.value,
                          )
                        }
                        aria-label={`Map ${sourceCol} to target column`}
                        data-section="data-import-wizard-map-select"
                        className="h-8 w-full rounded border border-border bg-background px-2 text-sm"
                      >
                        <option value="">-- skip --</option>
                        {targetColumns.map((col) => (
                          <option key={col.key} value={col.key}>
                            {col.label}
                            {col.required ? ' *' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mappingValidation.missing.length > 0 ? (
              <div
                role="alert"
                data-section="data-import-wizard-map-error"
                className="flex items-start gap-2 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning"
              >
                <AlertTriangle className="mt-0.5 h-3 w-3" />
                <span>
                  Missing required columns:{' '}
                  {mappingValidation.missing.join(', ')}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {effectiveStep === 'preview' ? (
          <div
            data-section="data-import-wizard-preview"
            className="flex flex-col gap-2"
          >
            {previewSummary ? (
              <div
                data-section="data-import-wizard-preview-summary"
                className="flex items-center gap-3 text-xs"
              >
                <span
                  data-section="data-import-wizard-preview-summary-valid"
                  className="text-success"
                >
                  Valid: {previewSummary.valid}
                </span>
                <span
                  data-section="data-import-wizard-preview-summary-invalid"
                  className="text-destructive"
                >
                  Invalid: {previewSummary.invalid}
                </span>
              </div>
            ) : null}
            <div
              data-section="data-import-wizard-preview-rows"
              className="max-h-72 overflow-y-auto rounded border border-border"
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="border-b border-border px-2 py-1 text-xs uppercase text-muted-foreground"
                    >
                      #
                    </th>
                    {targetColumns.map((col) => (
                      <th
                        key={col.key}
                        scope="col"
                        className="border-b border-border px-2 py-1 text-xs uppercase text-muted-foreground"
                      >
                        {col.label}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="border-b border-border px-2 py-1 text-xs uppercase text-muted-foreground"
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => {
                    const hasErrors =
                      row.errors !== undefined &&
                      row.errors.length > 0;
                    return (
                      <tr
                        key={row.index}
                        data-section="data-import-wizard-preview-row"
                        data-row-index={row.index}
                        data-row-status={
                          hasErrors ? 'invalid' : 'valid'
                        }
                      >
                        <td className="px-2 py-1 text-muted-foreground">
                          {row.index + 1}
                        </td>
                        {targetColumns.map((col) => (
                          <td
                            key={col.key}
                            className="px-2 py-1 text-foreground"
                          >
                            {row.values[col.key] ?? ''}
                          </td>
                        ))}
                        <td className="px-2 py-1 text-xs">
                          {hasErrors ? (
                            <span className="text-destructive">
                              {row.errors!.length} error
                              {row.errors!.length === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="text-success">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {effectiveStep === 'import' ? (
          <div
            data-section="data-import-wizard-import"
            className="flex flex-col gap-2"
          >
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              aria-valuetext={`${progressPercent}%`}
              data-section="data-import-wizard-import-progress"
              data-progress={progressClamped}
              className="flex items-center gap-2"
            >
              <Loader2
                aria-hidden="true"
                className="h-4 w-4 motion-safe:animate-spin"
              />
              <div
                data-section="data-import-wizard-import-track"
                className="relative h-1.5 flex-1 overflow-hidden rounded bg-muted"
              >
                <div
                  aria-hidden="true"
                  data-section="data-import-wizard-import-fill"
                  style={{ width: `${progressPercent}%` }}
                  className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-200"
                />
              </div>
              <span
                data-section="data-import-wizard-import-label"
                className="font-mono text-xs tabular-nums text-muted-foreground"
              >
                {formatImportProgressPercent(progressClamped)}
              </span>
            </div>
          </div>
        ) : null}

        {effectiveStep === 'done' ? (
          <div
            data-section="data-import-wizard-done"
            className="flex flex-col gap-2"
          >
            <div
              data-section="data-import-wizard-done-summary"
              className="flex items-center gap-3 text-sm"
            >
              {successCount !== undefined ? (
                <span
                  data-section="data-import-wizard-done-success"
                  className="text-success"
                >
                  {successCount} imported
                </span>
              ) : null}
              {errorCount !== undefined ? (
                <span
                  data-section="data-import-wizard-done-errors"
                  className="text-destructive"
                >
                  {errorCount} errors
                </span>
              ) : null}
            </div>
            {errorRows.length > 0 ? (
              <ul
                data-section="data-import-wizard-error-report"
                className="flex flex-col gap-1 rounded border border-border"
              >
                {errorRows.map((row) => {
                  const expanded = expandedErrorRow === row.index;
                  return (
                    <li
                      key={row.index}
                      data-section="data-import-wizard-error-row"
                      data-row-index={row.index}
                      data-expanded={expanded ? 'true' : 'false'}
                      className="border-b border-border last:border-b-0"
                    >
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={`import-error-${row.index}`}
                        data-section="data-import-wizard-error-toggle"
                        onClick={() => toggleErrorRow(row.index)}
                        className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {expanded ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        <AlertCircle
                          aria-hidden="true"
                          className="h-3 w-3 text-destructive"
                        />
                        <span className="font-mono text-muted-foreground">
                          Row {row.index + 1}
                        </span>
                        <span className="text-destructive">
                          {(row.errors ?? []).length} error
                          {(row.errors ?? []).length === 1
                            ? ''
                            : 's'}
                        </span>
                      </button>
                      {expanded ? (
                        <div
                          id={`import-error-${row.index}`}
                          data-section="data-import-wizard-error-detail"
                          className="flex flex-col gap-1 border-t border-border bg-background/50 px-3 py-2"
                        >
                          <div
                            data-section="data-import-wizard-error-values"
                            className="flex flex-wrap gap-2 text-xs"
                          >
                            {Object.entries(row.values).map(
                              ([k, v]) => (
                                <span
                                  key={k}
                                  data-section="data-import-wizard-error-value"
                                  className="rounded bg-muted/40 px-1 py-0.5 font-mono"
                                >
                                  {k}={v}
                                </span>
                              ),
                            )}
                          </div>
                          <ul
                            data-section="data-import-wizard-error-list"
                            className="flex flex-col gap-1 text-xs"
                          >
                            {(row.errors ?? []).map(
                              (err, idx) => (
                                <li
                                  key={idx}
                                  data-section="data-import-wizard-error-entry"
                                  className="text-destructive"
                                >
                                  {err.column ? (
                                    <span className="font-mono">
                                      {err.column}:{' '}
                                    </span>
                                  ) : null}
                                  {err.message}
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        data-section="data-import-wizard-actions"
        className="flex items-center justify-between gap-2"
      >
        <button
          type="button"
          data-section="data-import-wizard-back"
          onClick={handleBack}
          disabled={isFirstStep || isImporting}
          className="rounded px-3 py-1 text-xs text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          {resolvedLabels.back}
        </button>
        <div className="flex items-center gap-2">
          {effectiveStep === 'done' ? (
            <>
              {onRetry ? (
                <button
                  type="button"
                  data-section="data-import-wizard-retry"
                  onClick={onRetry}
                  className="rounded px-3 py-1 text-xs text-foreground hover:bg-muted"
                >
                  {resolvedLabels.retry}
                </button>
              ) : null}
              {onClose ? (
                <button
                  type="button"
                  data-section="data-import-wizard-close"
                  onClick={onClose}
                  className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {resolvedLabels.close}
                </button>
              ) : null}
            </>
          ) : effectiveStep === 'preview' ? (
            <button
              type="button"
              data-section="data-import-wizard-import-action"
              onClick={() => void handleStartImport()}
              disabled={
                isImporting ||
                (previewSummary !== undefined &&
                  previewSummary.valid === 0)
              }
              className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resolvedLabels.importAction}
            </button>
          ) : (
            <button
              type="button"
              data-section="data-import-wizard-next"
              onClick={handleNext}
              disabled={nextDisabled || isLastStep}
              className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resolvedLabels.next}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

DataImportWizard.displayName = 'DataImportWizard';
