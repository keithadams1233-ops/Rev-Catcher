"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, isManagerRole } from "@/lib/auth/get-current-profile";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { recalculateMetricSnapshots } from "@/lib/metrics/recalculate";
import { detectRevenueLeaks } from "@/lib/revenue-leaks/detect";
import {
  applyMapping,
  validateRows,
  groupIntoTransactions,
  type ColumnMapping,
  type NormalizedTransactionGroup,
  type ParsedCsv,
  type RowError,
} from "@/lib/csv-import";
import type { Inserts } from "@/lib/types/database";

const MAX_ROWS = 5000;
const MAX_ERRORS_RETURNED = 100;

export interface ImportCsvInput {
  filename: string;
  headers: string[];
  rows: string[][];
  mapping: ColumnMapping;
  saveMapping: boolean;
}

export interface ImportCsvResult {
  posImportId: string;
  totalRows: number;
  importedTransactionCount: number;
  skippedDuplicateCount: number;
  errorCount: number;
  errors: RowError[];
  errorsTruncated: boolean;
  snapshotsWritten: number;
  leaksCreated: number;
  leaksUpdated: number;
  leaksResolved: number;
}

/**
 * The whole CSV import pipeline (spec §19): re-validates everything
 * server-side (the client's mapping/preview is a UX convenience, never
 * trusted as the authoritative check), resolves location/employee names
 * against this organization's real rows, dedupes against transactions
 * already imported, writes through the service-role client (transactions/
 * transaction_items have no client insert RLS policy by design — see
 * ARCHITECTURE.md), and finishes by re-running the metric engine over the
 * organization's full transaction history.
 */
export async function importCsv(input: ImportCsvInput): Promise<{ result: ImportCsvResult } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id || !isManagerRole(profile.role)) {
    return { error: "You don't have permission to import data." };
  }
  const organizationId = profile.organization_id;

  if (input.rows.length === 0) return { error: "That file has no data rows." };
  if (input.rows.length > MAX_ROWS) {
    return {
      error: `This file has ${input.rows.length.toLocaleString()} rows — the pilot import supports up to ${MAX_ROWS.toLocaleString()} per upload. Split it and upload in parts.`,
    };
  }

  const supabase = createServiceRoleClient();

  const { data: posImport, error: posImportError } = await supabase
    .from("pos_imports")
    .insert({
      organization_id: organizationId,
      filename: input.filename,
      status: "processing",
      row_count: input.rows.length,
      import_type: "csv",
    })
    .select("id")
    .single();

  if (posImportError) return { error: posImportError.message };

  try {
    const parsed: ParsedCsv = { headers: input.headers, rows: input.rows };
    const mappedRows = applyMapping(parsed, input.mapping);
    const { validRows, errors: rowErrors } = validateRows(mappedRows);
    const groups = groupIntoTransactions(validRows);

    const [{ data: locations, error: locError }, { data: profiles, error: profileError }] = await Promise.all([
      supabase.from("locations").select("id, name").eq("organization_id", organizationId),
      supabase.from("profiles").select("id, email, first_name, last_name").eq("organization_id", organizationId),
    ]);
    if (locError) throw locError;
    if (profileError) throw profileError;

    const locationByName = new Map((locations ?? []).map((l) => [l.name.toLowerCase(), l.id]));
    const employeeByEmail = new Map((profiles ?? []).map((p) => [p.email.toLowerCase(), p.id]));
    const employeeByName = new Map(
      (profiles ?? []).map((p) => [`${p.first_name} ${p.last_name}`.trim().toLowerCase(), p.id]),
    );

    const candidateIds = groups.map((g) => g.externalTransactionId);
    const { data: existing, error: existingError } =
      candidateIds.length > 0
        ? await supabase
            .from("transactions")
            .select("external_transaction_id")
            .eq("organization_id", organizationId)
            .in("external_transaction_id", candidateIds)
        : { data: [], error: null };
    if (existingError) throw existingError;
    const existingIds = new Set((existing ?? []).map((r) => r.external_transaction_id));

    let skippedDuplicateCount = 0;
    const resolved = new Map<
      string,
      { group: NormalizedTransactionGroup; locationId: string; employeeId: string | null }
    >();

    for (const group of groups) {
      if (existingIds.has(group.externalTransactionId)) {
        skippedDuplicateCount += 1;
        continue;
      }

      const locationId = locationByName.get(group.locationName.toLowerCase());
      if (!locationId) {
        rowErrors.push({
          rowNumber: 0,
          message: `Unknown location "${group.locationName}" (transaction ${group.externalTransactionId}) — add it in Settings first.`,
        });
        continue;
      }

      let employeeId: string | null = null;
      if (group.employeeIdentifier) {
        const key = group.employeeIdentifier.toLowerCase();
        employeeId = employeeByEmail.get(key) ?? employeeByName.get(key) ?? null;
      }

      resolved.set(group.externalTransactionId, { group, locationId, employeeId });
    }

    const transactionsToInsert: Inserts<"transactions">[] = [...resolved.values()].map(
      ({ group, locationId, employeeId }) => ({
        organization_id: organizationId,
        location_id: locationId,
        external_transaction_id: group.externalTransactionId,
        employee_id: employeeId,
        transaction_timestamp: group.timestamp,
        subtotal: group.subtotal,
        discount_total: group.discountTotal,
        tax_total: 0,
        total: group.total,
        refund_amount: group.refundAmount,
        voided: group.voided,
      }),
    );

    let snapshotsWritten = 0;
    let leaksCreated = 0;
    let leaksUpdated = 0;
    let leaksResolved = 0;

    if (transactionsToInsert.length > 0) {
      const { data: insertedTx, error: insertTxError } = await supabase
        .from("transactions")
        .insert(transactionsToInsert)
        .select("id, external_transaction_id");
      if (insertTxError) throw insertTxError;

      const itemsToInsert: Inserts<"transaction_items">[] = [];
      for (const tx of insertedTx ?? []) {
        const r = resolved.get(tx.external_transaction_id);
        if (!r) continue;
        for (const item of r.group.items) {
          itemsToInsert.push({
            transaction_id: tx.id,
            organization_id: organizationId,
            location_id: r.locationId,
            employee_id: r.employeeId,
            item_name: item.itemName,
            category: item.category,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
            modifier_names: [],
            refunded: item.refunded,
            voided: item.voided,
          });
        }
      }

      const BATCH_SIZE = 500;
      for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
        const { error: itemsError } = await supabase
          .from("transaction_items")
          .insert(itemsToInsert.slice(i, i + BATCH_SIZE));
        if (itemsError) throw itemsError;
      }

      const recalcResult = await recalculateMetricSnapshots(organizationId);
      snapshotsWritten = recalcResult.snapshotsWritten;

      // spec §19 step 8: CSV import triggers leak detection too.
      const detectionResult = await detectRevenueLeaks(organizationId);
      leaksCreated = detectionResult.leaksCreated;
      leaksUpdated = detectionResult.leaksUpdated;
      leaksResolved = detectionResult.leaksResolved;
    }

    const timestamps = [...resolved.values()].map((r) => r.group.timestamp);
    const dateStart = timestamps.length > 0 ? timestamps.reduce((a, b) => (b < a ? b : a)).slice(0, 10) : null;
    const dateEnd = timestamps.length > 0 ? timestamps.reduce((a, b) => (b > a ? b : a)).slice(0, 10) : null;

    await supabase
      .from("pos_imports")
      .update({
        status: transactionsToInsert.length > 0 ? "completed" : "failed",
        error_count: rowErrors.length,
        date_start: dateStart,
        date_end: dateEnd,
      })
      .eq("id", posImport.id);

    if (input.saveMapping) {
      await saveColumnMappingInternal(supabase, organizationId, input.mapping);
    }

    revalidatePath("/manager/settings/data-sources");
    revalidatePath("/manager");
    revalidatePath("/manager/leaks");

    return {
      result: {
        posImportId: posImport.id,
        totalRows: input.rows.length,
        importedTransactionCount: transactionsToInsert.length,
        skippedDuplicateCount,
        errorCount: rowErrors.length,
        errors: rowErrors.slice(0, MAX_ERRORS_RETURNED),
        errorsTruncated: rowErrors.length > MAX_ERRORS_RETURNED,
        snapshotsWritten,
        leaksCreated,
        leaksUpdated,
        leaksResolved,
      },
    };
  } catch (err) {
    await supabase.from("pos_imports").update({ status: "failed" }).eq("id", posImport.id);
    const message = err instanceof Error ? err.message : "Import failed unexpectedly.";
    return { error: message };
  }
}

export async function saveColumnMapping(mapping: ColumnMapping): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile?.organization_id || !isManagerRole(profile.role)) {
    return { error: "You don't have permission to save this." };
  }

  const supabase = createServiceRoleClient();
  await saveColumnMappingInternal(supabase, profile.organization_id, mapping);
  revalidatePath("/manager/settings/data-sources");
  return {};
}

async function saveColumnMappingInternal(
  supabase: ReturnType<typeof createServiceRoleClient>,
  organizationId: string,
  mapping: ColumnMapping,
) {
  const { data: existing } = await supabase
    .from("pos_column_mappings")
    .select("id")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existing) {
    await supabase.from("pos_column_mappings").update({ mapping }).eq("id", existing.id);
  } else {
    await supabase.from("pos_column_mappings").insert({ organization_id: organizationId, mapping });
  }
}
