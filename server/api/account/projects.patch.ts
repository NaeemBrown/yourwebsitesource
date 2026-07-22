import { and, eq } from "drizzle-orm";
import { isUuid } from "~~/shared/validation";

interface Payload {
  projectId?: string;
  customerNotes?: string;
  actionId?: string;
}

export default defineEventHandler(async (event) => {
  const identity = await requireCustomer(event);
  const customer = await resolveCustomer(identity);
  const body = await readBody<Payload>(event);
  if (!customer || !body?.projectId || !isUuid(body.projectId)) {
    throw createError({ statusCode: 422, statusMessage: "Project required." });
  }
  if (body.actionId && !isUuid(body.actionId)) {
    throw createError({ statusCode: 422, statusMessage: "Invalid action." });
  }

  const db = useDb();
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, body.projectId),
        eq(schema.projects.customerId, customer.id),
      ),
    )
    .limit(1);
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: "Project not found." });
  }

  if (typeof body.customerNotes === "string") {
    await db
      .update(schema.projects)
      .set({ customerNotes: body.customerNotes.trim(), updatedAt: new Date() })
      .where(eq(schema.projects.id, project.id));
  }

  if (body.actionId) {
    const actionId = body.actionId;
    // Mark the action complete and log the activity atomically so a completed
    // action always has its matching timeline entry.
    await db.transaction(async (tx) => {
      // Only transition open actions — a repeat call must not log a duplicate
      // "Completed:" activity entry for an already-completed action.
      const [action] = await tx
        .update(schema.projectActions)
        .set({ status: "completed", completedAt: new Date() })
        .where(
          and(
            eq(schema.projectActions.id, actionId),
            eq(schema.projectActions.projectId, project.id),
            eq(schema.projectActions.status, "open"),
          ),
        )
        .returning();
      if (action) {
        await tx.insert(schema.projectActivity).values({
          projectId: project.id,
          type: "action",
          title: `Completed: ${action.title}`,
        });
      }
    });
  }

  return { ok: true };
});
