import { and, eq } from "drizzle-orm";
import { isUuid, isValidHttpUrl } from "~~/shared/validation";

interface Payload {
  projectId?: string;
  name?: string;
  url?: string;
}

export default defineEventHandler(async (event) => {
  try {
    const identity = await requireCustomer(event);
    const customer = await resolveCustomer(identity);
    const body = await readBody<Payload>(event);
    const name = body?.name?.trim() ?? "";
    const url = body?.url?.trim() ?? "";
    if (
      !customer ||
      !body?.projectId ||
      !isUuid(body.projectId) ||
      name.length < 2 ||
      !isValidHttpUrl(url)
    ) {
      throw createError({
        statusCode: 422,
        statusMessage: "Project, file name, and a valid link are required.",
      });
    }
    const db = useDb();
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, body.projectId),
          eq(schema.projects.customerId, customer.id),
        ),
      )
      .limit(1);
    if (!project) {
      throw createError({
        statusCode: 404,
        statusMessage: "Project not found.",
      });
    }

    // File row + activity entry are written atomically so one can't exist
    // without the other.
    const file = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(schema.projectFiles)
        .values({ projectId: project.id, kind: "customer_upload", name, url })
        .returning();
      await tx.insert(schema.projectActivity).values({
        projectId: project.id,
        type: "file",
        title: `Customer added file: ${name}`,
      });
      return inserted;
    });

    return { file };
  } catch (err) {
    toSafeError(err, "account/project-files", "Could not save file.");
  }
});
