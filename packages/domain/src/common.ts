export interface BaseEntity {
  id: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SoftDeletable {
  deletedAt?: Date | null;
}

export type EntityStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
