import { hasPermission, type Permission } from "@/src/lib/auth/permissions";
import type { OrganizationRole } from "@/src/features/auth/types/app-session";

export type NavigationIcon =
  | "dashboard"
  | "customers"
  | "technicians"
  | "service-types"
  | "requests"
  | "jobs"
  | "schedule"
  | "quotations"
  | "invoices"
  | "payments"
  | "products"
  | "stock"
  | "organization"
  | "team"
  | "settings";
export interface NavigationItem {
  label: string;
  href: string;
  icon: NavigationIcon;
  permission: Permission;
  available: boolean;
}
export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

const NAVIGATION: NavigationGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: "dashboard",
        permission: "viewDashboard",
        available: true,
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Customers",
        href: "/customers",
        icon: "customers",
        permission: "manageCustomers",
        available: true,
      },
      {
        label: "Technicians",
        href: "/technicians",
        icon: "technicians",
        permission: "manageTechnicians",
        available: true,
      },
      {
        label: "Service types",
        href: "/service-types",
        icon: "service-types",
        permission: "manageServiceTypes",
        available: true,
      },
      {
        label: "Service requests",
        href: "/service-requests",
        icon: "requests",
        permission: "manageServiceRequests",
        available: true,
      },
      {
        label: "Jobs",
        href: "/jobs",
        icon: "jobs",
        permission: "dispatchJobs",
        available: true,
      },
      {
        label: "Schedule",
        href: "/schedule",
        icon: "schedule",
        permission: "dispatchJobs",
        available: true,
      },
    ],
  },
  {
    label: "Sales & billing",
    items: [
      {
        label: "Quotations",
        href: "/quotations",
        icon: "quotations",
        permission: "manageQuotations",
        available: true,
      },
      {
        label: "Invoices",
        href: "/invoices",
        icon: "invoices",
        permission: "manageInvoices",
        available: true,
      },
      {
        label: "Payments",
        href: "/payments",
        icon: "payments",
        permission: "recordPayments",
        available: true,
      },
    ],
  },
  {
    label: "Inventory",
    items: [
      {
        label: "Products",
        href: "/inventory/products",
        icon: "products",
        permission: "manageInventory",
        available: true,
      },
      {
        label: "Stock",
        href: "/inventory/stock",
        icon: "stock",
        permission: "manageInventory",
        available: true,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Organization",
        href: "/settings/organization",
        icon: "organization",
        permission: "manageOrganization",
        available: true,
      },
      {
        label: "Team",
        href: "/settings/team",
        icon: "team",
        permission: "manageUsers",
        available: true,
      },
      {
        label: "Settings",
        href: "/settings",
        icon: "settings",
        permission: "manageOrganization",
        available: true,
      },
    ],
  },
];

export function getNavigation(role: OrganizationRole): NavigationGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasPermission(role, item.permission)),
  })).filter((group) => group.items.length > 0);
}

export function isNavigationActive(pathname: string, href: string): boolean {
  const publicPath = pathname.replace(/^\/protected(?=\/|$)/, "");
  return publicPath === href || publicPath.startsWith(`${href}/`);
}
