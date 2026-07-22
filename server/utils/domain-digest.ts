/**
 * Domain-expiry digest logic (pure — shared by the weekly task and tests).
 * Buckets managed domains by how urgently their renewal needs attention.
 */

export interface DigestDomain {
  fqdn: string;
  customerName: string;
  expiresAt: string | Date | null;
  autoRenew: boolean;
}

export interface DigestEntry {
  fqdn: string;
  customerName: string;
  expiresAt: Date;
  daysLeft: number;
  autoRenew: boolean;
}

export interface DomainDigest {
  /** Already past their expiry date. */
  expired: DigestEntry[];
  /** Expiring within 7 days. */
  urgent: DigestEntry[];
  /** Expiring within 8–30 days. */
  upcoming: DigestEntry[];
  total: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bucket domains needing attention in the next 30 days (or already expired). */
export function buildDomainDigest(
  domains: DigestDomain[],
  now: Date = new Date(),
): DomainDigest {
  const expired: DigestEntry[] = [];
  const urgent: DigestEntry[] = [];
  const upcoming: DigestEntry[] = [];

  for (const domain of domains) {
    if (!domain.expiresAt) continue;
    const expiresAt = new Date(domain.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) continue;

    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
    if (daysLeft > 30) continue;

    const entry: DigestEntry = {
      fqdn: domain.fqdn,
      customerName: domain.customerName,
      expiresAt,
      daysLeft,
      autoRenew: domain.autoRenew,
    };
    if (daysLeft < 0) expired.push(entry);
    else if (daysLeft <= 7) urgent.push(entry);
    else upcoming.push(entry);
  }

  const byDate = (a: DigestEntry, b: DigestEntry) =>
    a.expiresAt.getTime() - b.expiresAt.getTime();
  expired.sort(byDate);
  urgent.sort(byDate);
  upcoming.sort(byDate);

  return {
    expired,
    urgent,
    upcoming,
    total: expired.length + urgent.length + upcoming.length,
  };
}
