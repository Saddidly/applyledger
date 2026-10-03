import { exportCsv, exportBackup } from "@/lib/transfer";
import { getDatabase } from "@/lib/database";
import { localRequestError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = localRequestError(request);
  if (denied) return denied;
  const format = new URL(request.url).searchParams.get("format");
  if (format === "csv")
    return new Response(`\uFEFF${exportCsv(getDatabase())}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="applyledger-applications.csv"',
        "Cache-Control": "no-store",
      },
    });
  return new Response(JSON.stringify(exportBackup(getDatabase()), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="applyledger-backup.json"',
      "Cache-Control": "no-store",
    },
  });
}
