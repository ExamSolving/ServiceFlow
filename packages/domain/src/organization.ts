export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
  ownerUserId: string;
  createdAt: Date;
  updatedAt: Date;
}
