import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
  reviewCount?: number;
  className?: string;
}

const sizeMap = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function StarRating({
  rating,
  maxStars = 5,
  size = "md",
  showValue = false,
  reviewCount,
  className,
}: StarRatingProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: maxStars }).map((_, i) => {
          const filled = i < Math.floor(rating);
          const partial = !filled && i < rating;
          return (
            <span key={i} className="relative">
              <Star
                className={cn(
                  sizeMap[size],
                  "text-[#e5e7eb]",
                  filled && "text-[#ff9b32] fill-[#ff9b32]",
                  partial && "text-[#ff9b32]"
                )}
              />
              {partial && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: `${(rating % 1) * 100}%` }}
                >
                  <Star
                    className={cn(sizeMap[size], "text-[#ff9b32] fill-[#ff9b32]")}
                  />
                </span>
              )}
            </span>
          );
        })}
      </div>
      {/* Never show a numeric score for a pro with ZERO reviews — that 0.0 (or any
          aggregate) would be fake. Stars render empty/grey; only the count shows. */}
      {showValue && reviewCount !== 0 && (
        <span className="text-sm font-semibold text-[#111827]">{rating.toFixed(1)}</span>
      )}
      {reviewCount !== undefined && (
        <span className="text-xs text-[#6b7280]">({reviewCount})</span>
      )}
    </div>
  );
}
