import { createClient } from "@supabase/supabase-js";

const dashboardUrl = process.env.DASHBOARD_SUPABASE_URL;
const dashboardAnonKey = process.env.DASHBOARD_SUPABASE_ANON_KEY;

if (!dashboardUrl || !dashboardAnonKey) {
  console.warn(
    "DASHBOARD_SUPABASE_URL or DASHBOARD_SUPABASE_ANON_KEY is not defined in environment variables. Dashboard synchronization will be disabled."
  );
}

export const supabaseDashboard = createClient(
  dashboardUrl || "https://placeholder.supabase.co",
  dashboardAnonKey || "placeholder"
);
