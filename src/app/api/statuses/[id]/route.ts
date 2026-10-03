import { deleteStatus, updateStatus } from "@/lib/database";
import { errorResponse, localRequestError, readJson } from "@/lib/http";
import { statusPatchSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const denied = localRequestError(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const status = updateStatus(
      id,
      statusPatchSchema.parse(await readJson(request)),
    );
    return status
      ? Response.json({ status })
      : Response.json({ error: "Status not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  const denied = localRequestError(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const deleted = deleteStatus(id);
    return deleted
      ? new Response(null, { status: 204 })
      : Response.json({ error: "Status not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
