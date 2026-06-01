export type UserRole = "client" | "professional";

export type Profile = {
  id: string;
  cedula: string;
  full_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
};

export type Professional = {
  id: string;
  profile_id: string;
  category_id: string;
  bio: string;
  whatsapp: string;
  hourly_rate?: number;
  provincia_id: string;
  canton_id: string;
  service_radius_km?: number;
  years_experience?: number;
  is_verified: boolean;
  is_featured: boolean;
  is_available: boolean;
  rating_avg: number;
  review_count: number;
  portfolio_urls: string[];
  created_at: string;
  profile?: Profile;
};

export type Review = {
  id: string;
  professional_id: string;
  client_id: string;
  rating: number;
  comment: string;
  created_at: string;
  client?: Profile;
};

export type Booking = {
  id: string;
  professional_id: string;
  client_id: string;
  service_description: string;
  preferred_date?: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  created_at: string;
};

export type SearchFilters = {
  query?: string;
  categoria?: string;
  provincia?: string;
  canton?: string;
  minRating?: number;
  sortBy?: "rating" | "reviews" | "price_asc" | "price_desc" | "newest";
};

export type ProfessionalCard = Professional & {
  profile: Profile;
  category_name: string;
  provincia_name: string;
  canton_name: string;
};
