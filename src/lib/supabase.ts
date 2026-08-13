// AfyaTech ↔ Supabase (external / bring-your-own project).
// Only the publishable (anon) key is used here — it is safe for the browser.
// Row Level Security on the Supabase side is the real access boundary.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  import.meta.env["VITE_SUPABASE_URL"] ?? "https://lcdiqtwaxgxkovtvmmbc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  "sb_publishable_puguaoL6lcmyvrSB3sJjAA_lknqNfDJ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// NOTE: the appointments table in this project is named `appoitments` (as created).
export const APPOINTMENTS_TABLE = "appoitments";

export interface DbPatient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  created_at: string | null;
}

export interface DbDoctor {
  id: string;
  first_name: string | null;
  last_name: string | null;
  specialization: string | null;
  phone: string | null;
  email: string | null;
  created_at: string | null;
}

export interface DbAppointment {
  id: string;
  patient_id: string | null;
  doctor_id: string | null;
  reason: string | null;
  status: string | null;
  appointment_time: string | null;
  created_at: string | null;
}
