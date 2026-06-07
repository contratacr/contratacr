// Shared shape for a professional card. No seed/fake data lives here anymore —
// listings are populated exclusively from real Supabase records.
export type ProfessionalCardData = {
  id: string;
  slug: string;
  fullName: string;
  avatarUrl?: string;
  categoryId: string;
  categoryIcon: string;
  bio: string;
  whatsapp: string;
  provinceName: string;
  cantonName: string;
  ratingAvg: number;
  reviewCount: number;
  yearsExperience?: number;
  hourlyRate?: number;
  isVerified: boolean;
  isFeatured: boolean;
  isAvailable: boolean;
  workplaces?: { id?: string; name: string; address?: string; lat?: number; lng?: number }[];
};
