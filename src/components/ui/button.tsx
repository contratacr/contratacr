"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[#009FD9] text-white shadow-sm hover:bg-[#0089bb] hover:shadow-[0_4px_16px_rgba(0,159,217,0.35)] focus-visible:ring-[#009FD9]",
        secondary:
          "bg-white text-[#009FD9] border-2 border-[#009FD9] hover:bg-[#EBF5FB] focus-visible:ring-[#009FD9]",
        accent:
          "bg-[#ff7c0a] text-white shadow-sm hover:bg-[#f05f00] focus-visible:ring-[#ff7c0a]",
        ghost:
          "text-[#374151] hover:bg-[#f3f4f6] focus-visible:ring-[#009FD9]",
        destructive:
          "bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500",
        outline:
          "border border-[#e5e7eb] bg-white hover:bg-[#f3f4f6] text-[#111827] focus-visible:ring-[#009FD9]",
        whatsapp:
          "bg-[#25d366] text-white hover:bg-[#1da851] focus-visible:ring-[#25d366]",
      },
      size: {
        sm: "h-9 px-3.5 text-[13px] rounded-lg",
        md: "h-10 px-5",
        lg: "h-12 px-7 text-base rounded-2xl",
        xl: "h-14 px-8 text-lg rounded-2xl",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
