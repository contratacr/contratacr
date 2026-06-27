// Shared shape for a professional card. No seed/fake data lives here anymore —
// listings are populated exclusively from real Supabase records.
export type ProfessionalCardData = {
  id: string;
  /** Owner's auth user id — used to detect "this is my own profile". */
  profileId?: string;
  slug: string;
  fullName: string;
  avatarUrl?: string;
  categoryId: string;
  categoryIcon: string;
  /** All of the pro's categories (drives e.g. the health/DOB rule). */
  professions?: string[];
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
  videoconsulta?: boolean;
  /** Opt-in: the pro exposes phone-call contact (Disponibilidad). */
  allowPhoneCall?: boolean;
  /** Optional separate call number (else the WhatsApp number is used for calls). */
  callPhone?: string;
};
