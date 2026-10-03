import { createApplication, listApplications } from "@/lib/database";
import { errorResponse, localRequestError, readJson } from "@/lib/http";
import { applicationSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const denied = localRequestError(request);
  if (denied) return denied;
  return Response.json(
    { applications: listApplications() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const denied = localRequestError(request);
  if (denied) return denied;
  try {
    const input = applicationSchema.parse(await readJson(request));
    return Response.json(
      { application: createApplication(input) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
