import { addNote, getApplication } from "@/lib/database";
import { errorResponse, localRequestError, readJson } from "@/lib/http";
import { noteSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const denied = localRequestError(request);
  if (denied) return denied;
  const { id } = await context.params;
  const application = getApplication(id);
  return application
    ? Response.json(
        { events: application.events },
        { headers: { "Cache-Control": "no-store" } },
      )
    : Response.json({ error: "Application not found." }, { status: 404 });
}

export async function POST(request: Request, context: Context) {
  const denied = localRequestError(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const input = noteSchema.parse(await readJson(request));
    const event = addNote(id, input.message);
    return event
      ? Response.json(
          { event },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        )
      : Response.json({ error: "Application not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
