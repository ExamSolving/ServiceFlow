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
        permission: "dispatchJobs",
        available: false,
      },
      {
        label: "Jobs",
        href: "/jobs",
        icon: "jobs",
        permission: "dispatchJobs",
        available: false,
      },
      {
        label: "Schedule",
        href: "/schedule",
        icon: "schedule",
        permission: "dispatchJobs",
        available: false,
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
        permission: "viewFinancials",
        available: false,
      },
      {
        label: "Invoices",
        href: "/invoices",
        icon: "invoices",
        permission: "viewFinancials",
        available: false,
      },
      {
        label: "Payments",
        href: "/payments",
        icon: "payments",
        permission: "viewFinancials",
        available: false,
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
        available: false,
      },
      {
        label: "Stock",
        href: "/inventory/stock",
        icon: "stock",
        permission: "manageInventory",
        available: false,
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
        available: false,
      },
      {
        label: "Settings",
        href: "/settings",
        icon: "settings",
        permission: "manageOrganization",
        available: false,
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
