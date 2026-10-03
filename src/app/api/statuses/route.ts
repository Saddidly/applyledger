import { createStatus, listStatuses } from "@/lib/database";
import { errorResponse, localRequestError, readJson } from "@/lib/http";
import { statusSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = localRequestError(request);
  if (denied) return denied;
  return Response.json(
    { statuses: listStatuses() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const denied = localRequestError(request);
  if (denied) return denied;
  try {
    return Response.json(
      { status: createStatus(statusSchema.parse(await readJson(request))) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
