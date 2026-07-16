import {
  Armchair,
  Briefcase,
  CalendarDays,
  Car,
  Dumbbell,
  Heart,
  Laptop,
  Leaf,
  Map as MapIcon,
  Palette,
  PawPrint,
  Shield,
  Shirt,
  Sparkles,
  Star,
  Tag,
  Truck,
  Utensils,
  Wheat,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

export type CategoryGroupVisual = {
  iconKey: string;
  from: string;
  to: string;
  Icon: LucideIcon;
};

export const CATEGORY_GROUP_VISUALS: Record<string, CategoryGroupVisual> = {
  hogar: { iconKey: "armchair", from: "#1e3a8a", to: "#2563eb", Icon: Armchair },
  jardin: { iconKey: "leaf", from: "#166534", to: "#16a34a", Icon: Leaf },
  limpieza: { iconKey: "sparkles", from: "#0369a1", to: "#0ea5e9", Icon: Sparkles },
  tecnologia: { iconKey: "laptop", from: "#13294a", to: "#0f4c81", Icon: Laptop },
  profesional: { iconKey: "briefcase", from: "#1e293b", to: "#334155", Icon: Briefcase },
  salud: { iconKey: "heart", from: "#0e7490", to: "#06b6d4", Icon: Heart },
  bienestar: { iconKey: "dumbbell", from: "#047857", to: "#10b981", Icon: Dumbbell },
  creatividad: { iconKey: "palette", from: "#6d28d9", to: "#a855f7", Icon: Palette },
  mascotas: { iconKey: "paw-print", from: "#92400e", to: "#f59e0b", Icon: PawPrint },
  belleza: { iconKey: "star", from: "#9d174d", to: "#db2777", Icon: Star },
  moda_y_cuidado_personal: { iconKey: "shirt", from: "#7c2d12", to: "#ea580c", Icon: Shirt },
  educacion: { iconKey: "book-open", from: "#9a3412", to: "#ea580c", Icon: BookOpen },
  transporte: { iconKey: "truck", from: "#3730a3", to: "#4f46e5", Icon: Truck },
  eventos: { iconKey: "calendar-days", from: "#7e22ce", to: "#a855f7", Icon: CalendarDays },
  seguridad: { iconKey: "shield", from: "#1e293b", to: "#475569", Icon: Shield },
  automotriz: { iconKey: "car", from: "#7f1d1d", to: "#dc2626", Icon: Car },
  turismo: { iconKey: "map", from: "#0f766e", to: "#14b8a6", Icon: MapIcon },
  restaurantes: { iconKey: "utensils", from: "#9a3412", to: "#ea580c", Icon: Utensils },
  agricultura: { iconKey: "wheat", from: "#3f6212", to: "#84cc16", Icon: Wheat },
  otras: { iconKey: "tag", from: "#0f4c81", to: "#009FD9", Icon: Tag },
};

const ICON_KEY_VISUALS = Object.values(CATEGORY_GROUP_VISUALS).reduce<Record<string, CategoryGroupVisual>>((acc, visual) => {
  acc[visual.iconKey] = visual;
  return acc;
}, {});

export const DEFAULT_CATEGORY_GROUP_VISUAL: CategoryGroupVisual = {
  iconKey: "tag",
  from: "#0f4c81",
  to: "#009FD9",
  Icon: Tag,
};

export function getCategoryGroupVisual(groupId?: string | null, iconKey?: string | null): CategoryGroupVisual {
  return CATEGORY_GROUP_VISUALS[groupId ?? ""] ?? ICON_KEY_VISUALS[iconKey ?? ""] ?? DEFAULT_CATEGORY_GROUP_VISUAL;
}

export function getCategoryGroupIcon(groupId?: string | null, iconKey?: string | null): LucideIcon {
  return getCategoryGroupVisual(groupId, iconKey).Icon;
}
