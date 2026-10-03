import {
  deleteApplication,
  getApplication,
  updateApplication,
} from "@/lib/database";
import { errorResponse, localRequestError, readJson } from "@/lib/http";
import { applicationPatchSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const denied = localRequestError(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const application = getApplication(id);
    return application
      ? Response.json(
          { application },
          { headers: { "Cache-Control": "no-store" } },
        )
      : Response.json({ error: "Application not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  const denied = localRequestError(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const patch = applicationPatchSchema.parse(await readJson(request));
    const application = updateApplication(id, patch);
    return application
      ? Response.json(
          { application },
          { headers: { "Cache-Control": "no-store" } },
        )
      : Response.json({ error: "Application not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  const denied = localRequestError(request);
  if (denied) return denied;
  const { id } = await context.params;
  return deleteApplication(id)
    ? new Response(null, { status: 204 })
    : Response.json({ error: "Application not found." }, { status: 404 });
}
