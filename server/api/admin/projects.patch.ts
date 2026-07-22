import { eq } from "drizzle-orm";

const STATUSES = [
  "awaiting_payment",
  "payment_received",
  "brief_received",
  "design",
  "build",
  "review",
  "launch",
  "live",
  "paused",
  "canceled",
] as const;

interface Payload {
  id?: string;
  status?: (typeof STATUSES)[number];
  progress?: number;
  estimatedLaunchAt?: string | null;
  latestUpdate?: string;
}

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await readBody<Payload>(event);
  if (!body?.id || !body.status || !STATUSES.includes(body.status)) {
    throw createError({
      statusCode: 422,
      statusMessage: "Project and valid status are required.",
    });
  }
  // Reject non-numeric progress before it becomes NaN in the DB. Absent is fine
  // (left unchanged); a present-but-wrong type is a client bug worth surfacing.
  if (body.progress !== undefined && typeof body.progress !== "number") {
    throw createError({
      statusCode: 422,
      statusMessage: "Progress must be a number.",
    });
  }

  const status = body.status;
  const latestUpdate = body.latestUpdate?.trim() || null;

  // PATCH semantics: only touch fields present in the body — an omitted field
  // must keep its stored value, not be reset to a default.
  const changes: Partial<typeof schema.projects.$inferInsert> = {
    status,
    updatedAt: new Date(),
  };
  if (body.progress !== undefined) {
    changes.progress = Math.max(0, Math.min(100, Math.round(body.progress)));
  }
  if (body.estimatedLaunchAt !== undefined) {
    changes.estimatedLaunchAt = body.estimatedLaunchAt || null;
  }
  if (body.latestUpdate !== undefined) {
    changes.latestUpdate = latestUpdate;
  }

  // Status change and its activity record are written together so the audit
  // timeline can never miss a transition (or record one that didn't commit).
  const project = await useDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.projects)
      .set(changes)
      .where(eq(schema.projects.id, body.id!))
      .returning();
    if (!updated) {
      throw createError({
        statusCode: 404,
        statusMessage: "Project not found.",
      });
    }
    await tx.insert(schema.projectActivity).values({
      projectId: updated.id,
      type: "update",
      title: `Project moved to ${status.replaceAll("_", " ")}`,
      details: latestUpdate,
    });
    return updated;
  });

  await writeAudit(admin.email, "project.update", project.id);
  return { project };
});
