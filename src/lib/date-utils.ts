/**
 * Safely format a date string (e.g. YYYY-MM-DD or MM/DD/YYYY) into MM/DD/YYYY format
 * WITHOUT triggering timezone offset conversion (which causes dates like 1993-02-21
 * to shift backwards by one day to 02/20/1993 in negative UTC offset timezones like Hawaii).
 */
export function formatDateString(dateStr?: string | null): string {
  if (!dateStr) return "";
  const cleaned = String(dateStr).trim();
  if (!cleaned) return "";

  // Handle MM/DD/YYYY or M/D/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
    const [m, d, y] = cleaned.split("/");
    return `${m.padStart(2, "0")}/${d.padStart(2, "0")}/${y}`;
  }

  // Handle YYYY-MM-DD (e.g. 1993-02-21 or 1993-02-21T00:00:00.000Z)
  if (cleaned.includes("-")) {
    const dateOnly = cleaned.split("T")[0];
    const parts = dateOnly.split("-");
    if (parts.length === 3) {
      const [y, m, d] = parts;
      if (y.length === 4) {
        return `${m.padStart(2, "0")}/${d.padStart(2, "0")}/${y}`;
      }
    }
  }

  return cleaned;
}
