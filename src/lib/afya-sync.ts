// Bridges the AfyaTech front-end store with the external Supabase project.
// The UI/agent logic is unchanged — this layer only mirrors bookings into
// Supabase (patients + appointments) and hydrates the live queue from it.

import { APPOINTMENTS_TABLE, supabase, type DbDoctor, type DbPatient } from "./supabase";
import type { QueueEntry, QueueStatus, Severity } from "./afya-store";

function splitName(full: string): { first_name: string; last_name: string } {
  const parts = full.trim().split(/\s+/);
  return { first_name: parts[0] ?? full, last_name: parts.slice(1).join(" ") || "-" };
}

function toQueueStatus(status: string | null): QueueStatus {
  switch ((status ?? "").toLowerCase()) {
    case "in_consultation":
    case "in progress":
      return "in_consultation";
    case "done":
    case "completed":
      return "done";
    case "escalated":
      return "escalated";
    default:
      return "waiting";
  }
}

/** Fetch doctors (used to resolve a department/specialization to a doctor). */
export async function fetchDoctors(): Promise<DbDoctor[]> {
  const { data, error } = await supabase.from("doctors").select("*");
  if (error) {
    console.warn("[afya-sync] doctors fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as DbDoctor[];
}

/** Hydrate live queue entries from Supabase appointments. */
export async function fetchQueueFromSupabase(): Promise<QueueEntry[]> {
  const { data, error } = await supabase
    .from(APPOINTMENTS_TABLE)
    .select("id, patient_id, doctor_id, reason, status, appointment_time, created_at")
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[afya-sync] appointments fetch failed:", error.message);
    return [];
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const [{ data: patients }, doctors] = await Promise.all([
    supabase.from("patients").select("*"),
    fetchDoctors(),
  ]);
  const pById = new Map((patients ?? []).map((p) => [(p as DbPatient).id, p as DbPatient]));
  const dById = new Map(doctors.map((d) => [d.id, d]));

  return rows.map((r) => {
    const p = r.patient_id ? pById.get(r.patient_id) : undefined;
    const d = r.doctor_id ? dById.get(r.doctor_id) : undefined;
    const arrivedAt = new Date(r.appointment_time ?? r.created_at ?? Date.now()).getTime();
    const status = toQueueStatus(r.status);
    return {
      id: r.id,
      patientName: p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "Patient",
      phone: p?.phone ?? "",
      department: d?.specialization ?? "General Practice",
      severity: (status === "escalated" ? "critical" : "low") as Severity,
      reason: r.reason ?? "",
      arrivedAt: Number.isNaN(arrivedAt) ? Date.now() : arrivedAt,
      estimatedWaitMin: 15,
      status,
      needsHunterReview: status === "escalated",
      consentRelational: true,
    } satisfies QueueEntry;
  });
}

/** Find or create the patient record for a phone number. */
export async function upsertPatient(name: string, phone: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from("patients")
    .select("id")
    .eq("phone", phone)
    .limit(1);
  if (existing && existing.length > 0) return existing[0].id as string;

  const { data, error } = await supabase
    .from("patients")
    .insert({ ...splitName(name), phone })
    .select("id")
    .single();
  if (error) {
    console.warn("[afya-sync] patient insert failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/** Mirror a booking into Supabase. Failures are non-fatal for the UI. */
export async function pushAppointment(entry: QueueEntry): Promise<void> {
  try {
    const patientId = await upsertPatient(entry.patientName, entry.phone);
    if (!patientId) return;
    const doctors = await fetchDoctors();
    const doctor =
      doctors.find(
        (d) => (d.specialization ?? "").toLowerCase() === entry.department.toLowerCase(),
      ) ?? doctors[0];
    const { error } = await supabase.from(APPOINTMENTS_TABLE).insert({
      patient_id: patientId,
      doctor_id: doctor?.id ?? null,
      reason: entry.reason,
      status: entry.status,
      appointment_time: new Date(entry.arrivedAt).toISOString(),
    });
    if (error) console.warn("[afya-sync] appointment insert failed:", error.message);
  } catch (e) {
    console.warn("[afya-sync] push failed:", e);
  }
}

/** Mirror a queue status change. */
export async function pushStatus(id: string, status: QueueStatus): Promise<void> {
  const { error } = await supabase.from(APPOINTMENTS_TABLE).update({ status }).eq("id", id);
  if (error) console.warn("[afya-sync] status update failed:", error.message);
}
