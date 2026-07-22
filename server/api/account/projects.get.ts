import { asc, desc, eq, inArray } from "drizzle-orm";

export default defineEventHandler(async (event) => {
  const identity = await requireCustomer(event);
  const customer = await resolveCustomer(identity);
  if (!customer) return { projects: [], requests: [], upcomingCosts: [] };

  const db = useDb();
  const projectRows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.customerId, customer.id))
    .orderBy(desc(schema.projects.createdAt));
  const ids = projectRows.map((project) => project.id);

  const [actions, files, activity, requests, domains, recurring] =
    await Promise.all([
      ids.length
        ? db
            .select()
            .from(schema.projectActions)
            .where(inArray(schema.projectActions.projectId, ids))
            .orderBy(asc(schema.projectActions.createdAt))
        : [],
      ids.length
        ? db
            .select()
            .from(schema.projectFiles)
            .where(inArray(schema.projectFiles.projectId, ids))
            .orderBy(desc(schema.projectFiles.createdAt))
        : [],
      ids.length
        ? db
            .select()
            .from(schema.projectActivity)
            .where(inArray(schema.projectActivity.projectId, ids))
            .orderBy(desc(schema.projectActivity.createdAt))
        : [],
      db
        .select()
        .from(schema.changeRequests)
        .where(eq(schema.changeRequests.customerId, customer.id))
        .orderBy(desc(schema.changeRequests.createdAt)),
      db
        .select()
        .from(schema.domains)
        .where(eq(schema.domains.customerId, customer.id))
        .orderBy(asc(schema.domains.expiresAt)),
      db
        .select()
        .from(schema.recurringCharges)
        .where(eq(schema.recurringCharges.customerId, customer.id))
        .orderBy(asc(schema.recurringCharges.nextChargeAt)),
    ]);

  const activeRecurring = recurring.filter(
    (charge) => charge.status === "active",
  );
  // Domains billed via an active recurring charge are already in that list —
  // adding a domain-derived entry too would double-count the renewal.
  const recurringDomainIds = new Set(
    activeRecurring
      .filter((charge) => charge.kind === "domain" && charge.domainId)
      .map((charge) => charge.domainId),
  );

  return {
    projects: projectRows.map((project) => ({
      ...project,
      actions: actions.filter((action) => action.projectId === project.id),
      files: files.filter((file) => file.projectId === project.id),
      activity: activity.filter((item) => item.projectId === project.id),
    })),
    requests,
    upcomingCosts: [
      ...activeRecurring.map((charge) => ({
        id: charge.id,
        label: charge.label,
        amountCents: charge.amountCents,
        dueAt: charge.nextChargeAt,
        kind: charge.kind,
      })),
      ...domains
        .filter(
          (domain) =>
            domain.expiresAt &&
            domain.annualCostCents &&
            !recurringDomainIds.has(domain.id),
        )
        .map((domain) => ({
          id: domain.id,
          label: `${domain.fqdn} renewal`,
          amountCents: domain.annualCostCents ?? 0,
          dueAt: domain.expiresAt,
          kind: "domain",
        })),
    ].sort(
      (a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime(),
    ),
  };
});
