/**
 * Canonical site content + types.
 * Imported by the Vue app (via `~~/shared/site`) and the Nitro
 * server API routes (via relative path), so the data stays in one place.
 */

export type ProjectCategory =
  | "SaaS"
  | "E-commerce"
  | "Agency"
  | "Portfolio"
  | "Web App"
  | "Landing";

export type ProjectStatus = "Available" | "Sold" | "Featured";

export interface Project {
  id: string;
  name: string;
  category: ProjectCategory;
  blurb: string;
  /** Headline proof metric, e.g. "+212% signups". */
  metric: string;
  metricLabel: string;
  price: number;
  status: ProjectStatus;
  year: number;
  tags: string[];
  /** Tailwind-friendly gradient stops for the generated cover. */
  gradient: [string, string];
  /** Live site URL (external opens in a new tab; internal routes navigate). */
  url?: string;
  /** Path to a cover screenshot under /public (falls back to the gradient). */
  image?: string;
}

export interface PricingTier {
  id: string;
  name: string;
  tagline: string;
  price: number;
  /** false when it's a custom/quote tier. */
  fixed: boolean;
  period: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
  /** Billing catalogue key (shared/billing.ts) so the card can start checkout. */
  planKey?: string;
}

/** A recurring hosting plan (monthly price, USD). */
export interface RecurringPlan {
  id: string;
  name: string;
  tagline: string;
  /** Monthly price in USD. `from` true when it's a starting price. */
  price: number;
  from?: boolean;
  features: string[];
  highlighted?: boolean;
}

/** A simple priced add-on tier (e.g. database sizing). */
export interface AddOnTier {
  id: string;
  name: string;
  price: number;
  period: string;
  detail: string;
  /** Managed-cloud monthly price (self-hosted + handling), when offered. */
  managedPrice?: number;
}

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  company: string;
  initials: string;
}

export interface ProcessStep {
  step: string;
  title: string;
  description: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface Stat {
  value: string;
  label: string;
}

/* ---------------------------------------------------------------- */

/** Public support / contact email, shown sitewide. */
export const supportEmail = "support@pixelatedindustries.com";

export const projects: Project[] = [
  {
    id: "nimbus-analytics",
    name: "YourWebsiteComments",
    category: "SaaS",
    blurb:
      "A real-time product analytics dashboard with live charts, cohort retention, and a self-serve onboarding flow.",
    metric: "+212%",
    metricLabel: "trial signups",
    price: 7400,
    status: "Featured",
    year: 2025,
    tags: ["Dashboard", "Charts", "Auth", "Billing"],
    gradient: ["#d6d6d6", "#8f8f8f"],
    url: "https://yourwebsitecomments.com/",
    image: "/work/yourwebsitecomments.jpg",
  },
  {
    id: "verdant-market",
    name: "EbieForShort",
    category: "E-commerce",
    blurb:
      "A headless storefront for an organic grocer — instant search, one-tap checkout, and a subscription box flow.",
    metric: "+38%",
    metricLabel: "conversion rate",
    price: 9200,
    status: "Sold",
    year: 2025,
    tags: ["Headless", "Stripe", "Search", "PWA"],
    gradient: ["#e0e0e0", "#5f5f5f"],
    url: "https://ebievfx.pixelateddevs.com/",
    image: "/work/ebieforshort.jpg",
  },
  {
    id: "harbor-legal",
    name: "TheWebsiteForge",
    category: "Agency",
    blurb:
      "A trust-forward marketing site for a boutique law firm, with case studies, intake forms, and CMS-driven articles.",
    metric: "4.2×",
    metricLabel: "qualified leads",
    price: 5600,
    status: "Sold",
    year: 2024,
    tags: ["CMS", "Forms", "SEO", "Blog"],
    gradient: ["#bdbdbd", "#6b6b6b"],
    url: "/",
    image: "/work/thewebsiteforge.jpg",
  },
  {
    id: "pulse-fit",
    name: "Assu-Med",
    category: "Web App",
    blurb:
      "A workout-tracking PWA with offline support, streaks, and a social leaderboard powered by edge functions.",
    metric: "61k",
    metricLabel: "monthly actives",
    price: 11800,
    status: "Available",
    year: 2025,
    tags: ["PWA", "Offline", "Realtime", "Edge"],
    gradient: ["#cccccc", "#999999"],
    url: "https://www.assumed.co.za/",
    image: "/work/assumed.jpg",
  },
  {
    id: "lumen-launch",
    name: "Lumen Launch",
    category: "Landing",
    blurb:
      "A high-velocity product launch page with a waitlist, animated feature reveals, and A/B-tested hero variants.",
    metric: "27%",
    metricLabel: "waitlist opt-in",
    price: 2900,
    status: "Available",
    year: 2026,
    tags: ["Waitlist", "A/B", "Analytics"],
    gradient: ["#ededed", "#8a8a8a"],
  },
  {
    id: "meridian-bank",
    name: "Meridian Neo",
    category: "SaaS",
    blurb:
      "A fintech onboarding experience with KYC steps, animated balance cards, and a fully themeable design system.",
    metric: "−43%",
    metricLabel: "drop-off rate",
    price: 13500,
    status: "Sold",
    year: 2024,
    tags: ["Fintech", "Design System", "KYC"],
    gradient: ["#a8a8a8", "#5c5c5c"],
  },
  {
    id: "evergreen-stay",
    name: "Evergreen Stay",
    category: "E-commerce",
    blurb:
      "A boutique-hotel booking site with availability calendar, map search, and a buttery multi-step reservation flow.",
    metric: "+54%",
    metricLabel: "direct bookings",
    price: 8100,
    status: "Available",
    year: 2025,
    tags: ["Booking", "Calendar", "Maps"],
    gradient: ["#dedede", "#a3a3a3"],
  },
  {
    id: "cobalt-crm",
    name: "Cobalt CRM",
    category: "SaaS",
    blurb:
      "A pipeline CRM with drag-and-drop deals, an activity timeline, and a command palette that power users love.",
    metric: "+176%",
    metricLabel: "seat activation",
    price: 10200,
    status: "Sold",
    year: 2025,
    tags: ["CRM", "Drag & Drop", "Command-K"],
    gradient: ["#c7c7c7", "#616161"],
  },
  {
    id: "northwind-freight",
    name: "Northwind Freight",
    category: "Web App",
    blurb:
      "A logistics tracking portal with live shipment maps, role-based access, and exportable customs paperwork.",
    metric: "−31%",
    metricLabel: "support tickets",
    price: 12400,
    status: "Available",
    year: 2024,
    tags: ["Maps", "RBAC", "Exports", "Realtime"],
    gradient: ["#9e9e9e", "#4f4f4f"],
  },
  {
    id: "saffron-table",
    name: "Saffron Table",
    category: "E-commerce",
    blurb:
      "A restaurant-group ordering platform with menu builder, table QR ordering, and Stripe-powered payouts.",
    metric: "+63%",
    metricLabel: "online orders",
    price: 6800,
    status: "Sold",
    year: 2025,
    tags: ["Ordering", "QR", "Stripe", "Menu CMS"],
    gradient: ["#eaeaea", "#666666"],
  },
  {
    id: "orbit-docs",
    name: "Orbit Docs",
    category: "SaaS",
    blurb:
      "A developer docs + knowledge base with instant search, versioned content, and interactive API playgrounds.",
    metric: "2.8×",
    metricLabel: "trial signups",
    price: 5900,
    status: "Available",
    year: 2026,
    tags: ["Docs", "Search", "Versioning", "MDX"],
    gradient: ["#d3d3d3", "#6e6e6e"],
  },
  {
    id: "bloom-studio",
    name: "Bloom Studio",
    category: "Agency",
    blurb:
      "An award-style site for a creative studio — WebGL hero, case-study scrollytelling, and a CMS-driven journal.",
    metric: "88",
    metricLabel: "Awwwards score",
    price: 4800,
    status: "Featured",
    year: 2025,
    tags: ["WebGL", "Scrollytelling", "CMS"],
    gradient: ["#dbdbdb", "#8c8c8c"],
  },
  {
    id: "vanta-wear",
    name: "Vanta Wear",
    category: "E-commerce",
    blurb:
      "A fashion storefront with 3D product spins, size-recommendation quiz, and an editorial lookbook builder.",
    metric: "+41%",
    metricLabel: "average order value",
    price: 9800,
    status: "Available",
    year: 2025,
    tags: ["3D", "Quiz", "Lookbook", "Headless"],
    gradient: ["#b5b5b5", "#787878"],
  },
  {
    id: "pinnacle-capital",
    name: "Pinnacle Capital",
    category: "Landing",
    blurb:
      "A venture fund site with an animated thesis section, portfolio grid, and a gated LP data room.",
    metric: "+120%",
    metricLabel: "demo requests",
    price: 3600,
    status: "Sold",
    year: 2026,
    tags: ["Finance", "Gated", "Animation"],
    gradient: ["#d3d3d3", "#6e6e6e"],
  },
];

export const pricingTiers: PricingTier[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "A clean, fast site to launch a new brand, offer, or service.",
    price: 249,
    fixed: true,
    period: "project",
    planKey: "build_starter",
    features: [
      "1–3 polished pages",
      "Mobile-friendly responsive build",
      "Custom colors, fonts, and layout",
      "Contact form setup",
      "Basic SEO and speed pass",
      "First month of managed hosting free",
      "1 revision round",
    ],
    cta: "Get started",
  },
  {
    id: "professional",
    name: "Professional",
    tagline: "A polished multi-page website for a growing business.",
    price: 399,
    fixed: true,
    period: "project",
    highlighted: true,
    planKey: "build_professional",
    features: [
      "Up to 6 core pages",
      "Services, about, contact, and portfolio sections",
      "Stronger visuals and page transitions",
      "Forms, analytics, and basic integrations",
      "SEO metadata, sitemap, and launch setup",
      "First month of managed hosting free",
      "3 revision rounds + handover",
    ],
    cta: "Get started",
  },
  {
    id: "business",
    name: "Business",
    tagline:
      "A complete business website with deeper content and integrations.",
    price: 699,
    fixed: true,
    period: "project",
    planKey: "build_business",
    features: [
      "Up to 12 pages or a small CMS",
      "Editable content / blog where needed",
      "Advanced animations and interactions",
      "Third-party + marketing integrations",
      "Technical SEO and performance tuning",
      "First month of managed hosting free",
      "4 revision rounds + handover",
    ],
    cta: "Get started",
  },
  {
    id: "custom",
    name: "Custom Quote",
    tagline: "A custom build scoped and priced around your exact requirements.",
    price: 0,
    fixed: false,
    period: "project",
    features: [
      "Web apps, dashboards, stores, or portals",
      "Auth, payments, database, or API work",
      "CMS / admin tooling where needed",
      "Deeper integrations and automation",
      "Performance and security hardening",
      "First month of managed hosting free",
      "Priority delivery + handover",
    ],
    cta: "Request a quote",
  },
];

/* ---------------------------------------------------------------- */
/* Recurring revenue: hosting, databases, care, and domains.        */
/* ---------------------------------------------------------------- */

export const hostingPlans: RecurringPlan[] = [
  {
    id: "static",
    name: "Static Hosting",
    tagline: "Landing pages and brochure sites that just need to be fast.",
    price: 15,
    from: true,
    features: [
      "Fast global edge delivery",
      "SSL certificate + domain connection",
      "Daily backups & uptime monitoring",
      "Small text & image changes included",
      "Email support",
    ],
  },
  {
    id: "dynamic",
    name: "Dynamic Hosting",
    tagline: "Business sites with a CMS, forms, logins, or a small database.",
    price: 45,
    from: true,
    highlighted: true,
    features: [
      "Everything in Static",
      "CMS / admin hosting",
      "Form handling with spam protection",
      "Staging environment for changes",
      "Priority on small content changes",
    ],
  },
  {
    id: "app",
    name: "App Hosting",
    tagline: "Web apps, dashboards, and stores with real workloads.",
    price: 120,
    from: true,
    features: [
      "Everything in Dynamic",
      "Dedicated app server resources",
      "Background jobs & API hosting",
      "Scaling headroom for traffic spikes",
      "Advanced monitoring & alerts",
    ],
  },
];

export const databaseTiers: AddOnTier[] = [
  {
    id: "db-small",
    name: "Small",
    price: 10,
    managedPrice: 15,
    period: "month",
    detail: "Up to ~1 GB. Forms, a small CMS, or a light member area.",
  },
  {
    id: "db-medium",
    name: "Medium",
    price: 25,
    managedPrice: 37.5,
    period: "month",
    detail: "Up to ~10 GB. Growing stores and membership sites.",
  },
  {
    id: "db-large",
    name: "Large",
    price: 60,
    managedPrice: 90,
    period: "month",
    detail: "Up to ~50 GB. High-traffic apps and large catalogues.",
  },
];

export const domainInfo = {
  tagline: "Domains at cost plus a small handling fee — no markup games.",
  points: [
    "We register and renew the domain on your behalf.",
    "You are the legal owner and registrant from day one.",
    "Transparent annual pricing, billed at cost + a small fee.",
    "Auto-renew keeps your domain from ever lapsing.",
  ],
};

export const testimonials: Testimonial[] = [
  {
    quote:
      "TheWebsiteForge shipped our SaaS marketing site in under two weeks and trial signups more than tripled. The motion work is unreal.",
    author: "Dana Reyes",
    role: "Head of Growth",
    company: "Nimbus",
    initials: "DR",
  },
  {
    quote:
      "We bought one of their available builds and relaunched in days. Conversion jumped 38% and the codebase is genuinely clean.",
    author: "Marcus Bell",
    role: "Founder",
    company: "Verdant Market",
    initials: "MB",
  },
  {
    quote:
      "The team treated our brand like their own. Qualified leads went up 4×, and clients keep complimenting the site.",
    author: "Priya Nair",
    role: "Managing Partner",
    company: "Harbor Legal",
    initials: "PN",
  },
  {
    quote:
      "Fast, communicative, and obsessive about detail. Our drop-off rate fell 43% after they reworked onboarding.",
    author: "Tomás Lind",
    role: "Product Lead",
    company: "Meridian",
    initials: "TL",
  },
  {
    quote:
      "Seat activation jumped 176% after launch. They turned a clunky internal tool into something our reps actually open.",
    author: "Sofia Alvarez",
    role: "VP Sales",
    company: "Cobalt",
    initials: "SA",
  },
  {
    quote:
      "Our customs portal used to generate a flood of tickets. TheWebsiteForge cut them by a third and ops finally went quiet.",
    author: "Jonas Weber",
    role: "Head of Operations",
    company: "Northwind",
    initials: "JW",
  },
  {
    quote:
      "The 3D product spins and size quiz lifted our average order value 41%. The site sells better than our store associates.",
    author: "Ivy Chen",
    role: "Ecommerce Director",
    company: "Vanta Wear",
    initials: "IC",
  },
  {
    quote:
      "We bought a ready-made build, rebranded it in a weekend, and demo requests doubled. Best money we've spent all year.",
    author: "Daniel Osei",
    role: "CEO",
    company: "Pinnacle",
    initials: "DO",
  },
];

export const processSteps: ProcessStep[] = [
  {
    step: "01",
    title: "Discover",
    description:
      "We dig into your goals, audience, and metrics, then map the fastest path to a site that performs.",
  },
  {
    step: "02",
    title: "Design",
    description:
      "Interactive prototypes with real motion — you approve the feel before a single production line ships.",
  },
  {
    step: "03",
    title: "Build",
    description:
      "Production code with a backend, CMS, and analytics. Accessible, fast, and ready to scale.",
  },
  {
    step: "04",
    title: "Launch & sell",
    description:
      "We deploy, hand over the keys, and — if you'd like — list the build for sale in our showcase.",
  },
];

export const faqs: Faq[] = [
  {
    q: "Why do you use credits?",
    a: "Credits let us respond and begin work faster. Bank charges, payment clearances, and transfer delays can slow down small requests; credits keep your balance ready so approvals turn into action without waiting on another transaction.",
  },
  {
    q: "Do you build custom sites or sell pre-made ones?",
    a: "Both. We craft bespoke sites for clients, and we also sell production-ready builds you can buy outright and relaunch under your brand.",
  },
  {
    q: "What's your typical turnaround?",
    a: "A Starter site goes live in about 3–5 days. Professional and Business builds take 1–4 weeks. Enterprise projects are scoped per milestone.",
  },
  {
    q: "What tech stack do you use?",
    a: "Modern, fast, and maintainable: Nuxt 4, Vue 3, Tailwind v4, edge-ready backends, and a CMS where it helps. Everything is yours after handover.",
  },
  {
    q: "Do I own the code?",
    a: "Yes. On final payment you receive the full repository, assets, and deployment — no lock-in, no licensing strings.",
  },
  {
    q: "Can you maintain the site after launch?",
    a: "Absolutely. Our hosting includes baseline upkeep — security updates, backups, monitoring, and small content tweaks. Bigger updates go through change requests from your account, quoted up front and paid from your prepaid wallet.",
  },
  {
    q: "I already have a website — can you host it?",
    a: "Yes. We take over hosting and upkeep for sites we didn't build. Tell us about your site via the contact form and we'll confirm the right hosting plan and handle the migration.",
  },
];

export const stats: Stat[] = [
  { value: "120+", label: "websites shipped" },
  { value: "98", label: "avg. Lighthouse score" },
  { value: "$24M+", label: "client revenue influenced" },
  { value: "14", label: "countries served" },
];

export const clientLogos: string[] = [
  "Nimbus",
  "Verdant",
  "Harbor",
  "Atlas",
  "Pulse",
  "Lumen",
  "Meridian",
  "Evergreen",
  "Northwind",
  "Cobalt",
  "Saffron",
  "Orbit",
  "Bloom",
  "Vanta",
  "Pinnacle",
];

export const projectCategories: ProjectCategory[] = [
  "SaaS",
  "E-commerce",
  "Agency",
  "Portfolio",
  "Web App",
  "Landing",
];
