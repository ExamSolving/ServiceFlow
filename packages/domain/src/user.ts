export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  photoUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
