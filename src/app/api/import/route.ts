import { getDatabase } from "@/lib/database";
import {
  errorResponse,
  HttpError,
  localRequestError,
  readJson,
} from "@/lib/http";
import { importBackup, importCsv, parseCsv, type Backup } from "@/lib/transfer";
import { backupSchema } from "@/lib/validation";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const importRequest = z.discriminatedUnion("format", [
  z.object({ format: z.literal("json"), payload: backupSchema }),
  z.object({ format: z.literal("csv"), contents: z.string().max(10_000_000) }),
]);

export async function POST(request: Request) {
  const denied = localRequestError(request);
  if (denied) return denied;
  try {
    const raw = await readJson(request, 10_500_000);
    const input = importRequest.parse(raw);
    const result =
      input.format === "csv"
        ? importCsv(parseCsv(input.contents), getDatabase())
        : importBackup(input.payload as Backup, getDatabase());
    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    if (
      error instanceof Error &&
      /csv|backup|status|import|application/i.test(error.message)
    )
      return Response.json({ error: error.message }, { status: 400 });
    return errorResponse(error);
  }
}
