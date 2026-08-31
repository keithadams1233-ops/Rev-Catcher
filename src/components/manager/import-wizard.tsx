"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CSV_TARGET_FIELDS,
  EMPTY_MAPPING,
  parseCsv,
  applyMapping,
  validateRows,
  guessMapping,
  type ColumnMapping,
  type ParsedCsv,
} from "@/lib/csv-import";
import { importCsv, type ImportCsvResult } from "@/app/manager/settings/data-sources/actions";

type Step = "upload" | "map" | "result";

function buildInitialMapping(headers: string[], saved: ColumnMapping | null): ColumnMapping {
  const guessed = guessMapping(headers);
  if (!saved) return guessed;
  const merged = { ...guessed };
  for (const field of CSV_TARGET_FIELDS) {
    const savedHeader = saved[field.key];
    if (savedHeader && headers.includes(savedHeader)) {
      merged[field.key] = savedHeader;
    }
  }
  return merged;
}

export function ImportWizard({ savedMapping }: { savedMapping: ColumnMapping | null }) {
  const [step, setStep] = useState<Step>("upload");
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING);
  const [saveMapping, setSaveMapping] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportCsvResult | null>(null);

  const validation = useMemo(() => {
    if (!parsed) return { validRows: [], errors: [] };
    return validateRows(applyMapping(parsed, mapping));
  }, [parsed, mapping]);

  const missingRequired = CSV_TARGET_FIELDS.filter((f) => f.required && !mapping[f.key]);

  function handleFile(file: File) {
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const csv = parseCsv(text);
      if (csv.headers.length === 0) {
        setFileError("Couldn't read a header row from that file.");
        return;
      }
      if (csv.rows.length === 0) {
        setFileError("That file has a header row but no data rows.");
        return;
      }
      setParsed(csv);
      setFilename(file.name);
      setMapping(buildInitialMapping(csv.headers, savedMapping));
      setStep("map");
    };
    reader.onerror = () => setFileError("Couldn't read that file.");
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!parsed) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const outcome = await importCsv({
        filename,
        headers: parsed.headers,
        rows: parsed.rows,
        mapping,
        saveMapping,
      });
      if ("error" in outcome) {
        setSubmitError(outcome.error);
        setSubmitting(false);
        return;
      }
      setResult(outcome.result);
      setStep("result");
    } catch {
      setSubmitError("Import failed unexpectedly. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep("upload");
    setParsed(null);
    setFilename("");
    setMapping(EMPTY_MAPPING);
    setResult(null);
    setSubmitError(null);
    setFileError(null);
  }

  if (step === "upload") {
    return (
      <div className="rounded-2xl border border-dashed border-manager-border p-6 text-center">
        <p className="text-sm text-manager-text">Upload a POS export CSV — one row per line item.</p>
        <label className="mt-3 inline-block cursor-pointer rounded-lg bg-manager-accent px-4 py-2 text-sm font-semibold text-manager-bg">
          Choose file
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
        {fileError && <p className="mt-2 text-xs text-manager-danger">{fileError}</p>}
      </div>
    );
  }

  if (step === "map" && parsed) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-manager-text">{filename}</p>
          <button type="button" onClick={reset} className="text-xs text-manager-muted hover:text-manager-text">
            Choose a different file
          </button>
        </div>

        <div className="rounded-2xl border border-manager-border bg-manager-surface p-4">
          <h3 className="text-sm font-semibold text-manager-text">Map columns</h3>
          <p className="mt-1 text-xs text-manager-muted">
            Match each field to a column in your file. Fields marked * are required.
          </p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {CSV_TARGET_FIELDS.map((field) => (
              <label key={field.key} className="block text-xs text-manager-muted">
                {field.label}
                {field.required && <span className="text-manager-danger"> *</span>}
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value || null }))}
                  className="mt-1 w-full rounded-lg border border-manager-border bg-manager-surface2 px-2 py-1.5 text-sm text-manager-text"
                >
                  <option value="">— not mapped —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-manager-border bg-manager-surface p-4">
          <h3 className="text-sm font-semibold text-manager-text">Preview</h3>
          <p className="mt-1 text-xs text-manager-muted">
            {parsed.rows.length.toLocaleString()} rows · {validation.validRows.length.toLocaleString()} valid ·{" "}
            {validation.errors.length.toLocaleString()} rejected
          </p>

          {validation.validRows.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-xs">
                <thead>
                  <tr className="text-manager-muted">
                    <th className="pb-1 pr-3 font-medium">Transaction</th>
                    <th className="pb-1 pr-3 font-medium">Item</th>
                    <th className="pb-1 pr-3 font-medium">Qty</th>
                    <th className="pb-1 pr-3 font-medium">Price</th>
                    <th className="pb-1 font-medium">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {validation.validRows.slice(0, 8).map((row, i) => (
                    <tr key={i} className="border-t border-manager-border text-manager-text">
                      <td className="py-1 pr-3">{row.externalTransactionId}</td>
                      <td className="py-1 pr-3">{row.itemName}</td>
                      <td className="py-1 pr-3">{row.quantity}</td>
                      <td className="py-1 pr-3">{row.price.toFixed(2)}</td>
                      <td className="py-1">{row.locationName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {validation.errors.length > 0 && (
            <div className="mt-3 rounded-lg border border-manager-warn/40 bg-manager-warn/10 p-2.5">
              <p className="text-xs font-medium text-manager-warn">
                {validation.errors.length} row{validation.errors.length === 1 ? "" : "s"} will be skipped
              </p>
              <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-manager-muted">
                {validation.errors.slice(0, 8).map((e, i) => (
                  <li key={i}>
                    Row {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {missingRequired.length > 0 && (
            <p className="mt-3 text-xs text-manager-danger">
              Map required fields first: {missingRequired.map((f) => f.label).join(", ")}
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-manager-text">
          <input
            type="checkbox"
            checked={saveMapping}
            onChange={(e) => setSaveMapping(e.target.checked)}
            className="h-4 w-4"
          />
          Save this mapping for future imports
        </label>

        {submitError && (
          <p role="alert" className="rounded-lg border border-manager-danger/40 bg-manager-danger/10 px-3 py-2 text-sm text-manager-danger">
            {submitError}
          </p>
        )}

        <button
          type="button"
          onClick={handleImport}
          disabled={submitting || missingRequired.length > 0 || validation.validRows.length === 0}
          className="w-full rounded-lg bg-manager-accent px-4 py-3 text-sm font-semibold text-manager-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Importing…" : `Import ${validation.validRows.length.toLocaleString()} valid rows`}
        </button>
      </div>
    );
  }

  if (step === "result" && result) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-manager-accent/40 bg-manager-accent/10 p-4">
          <p className="text-sm font-semibold text-manager-text">Import complete</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-manager-muted">Imported</dt>
              <dd className="text-base font-semibold text-manager-accent">
                {result.importedTransactionCount.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-manager-muted">Duplicates skipped</dt>
              <dd className="text-base font-semibold text-manager-text">
                {result.skippedDuplicateCount.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-manager-muted">Rows rejected</dt>
              <dd className="text-base font-semibold text-manager-text">{result.errorCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-manager-muted">Snapshots written</dt>
              <dd className="text-base font-semibold text-manager-text">
                {result.snapshotsWritten.toLocaleString()}
              </dd>
            </div>
          </dl>
          {(result.leaksCreated > 0 || result.leaksUpdated > 0 || result.leaksResolved > 0) && (
            <p className="mt-3 text-xs text-manager-muted">
              Revenue leak detection: {result.leaksCreated} new, {result.leaksUpdated} updated,{" "}
              {result.leaksResolved} resolved.{" "}
              <Link href="/manager/leaks" className="font-medium text-manager-accent hover:underline">
                View leaks
              </Link>
            </p>
          )}
        </div>

        {result.errors.length > 0 && (
          <div className="rounded-2xl border border-manager-border bg-manager-surface p-4">
            <p className="text-sm font-semibold text-manager-text">Rejected rows</p>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-manager-muted">
              {result.errors.map((e, i) => (
                <li key={i}>
                  Row {e.rowNumber || "—"}: {e.message}
                </li>
              ))}
            </ul>
            {result.errorsTruncated && <p className="mt-1 text-xs text-manager-muted">…and more.</p>}
          </div>
        )}

        <button
          type="button"
          onClick={reset}
          className="w-full rounded-lg border border-manager-border px-4 py-2.5 text-sm font-medium text-manager-text"
        >
          Import another file
        </button>
      </div>
    );
  }

  return null;
}
