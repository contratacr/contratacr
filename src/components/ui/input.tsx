import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftIcon, rightIcon, type, id, ...props }, ref) => {
    const inputId = id ?? (typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    // Password fields get an ALWAYS-visible show/hide eye automatically (from the
    // start, even when empty) — unless the caller supplies its own rightIcon. The icon
    // matches the field state: HIDDEN (dots) → EyeOff (slashed), VISIBLE (text) → Eye.
    const [reveal, setReveal] = React.useState(false);
    const isPassword = type === "password";
    const eyeToggle =
      isPassword && !rightIcon ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="text-[#9ca3af] hover:text-[#374151] transition-colors"
        >
          {reveal ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      ) : null;
    const resolvedRightIcon = rightIcon ?? eyeToggle;
    const effectiveType = isPassword && reveal ? "text" : type;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[#374151]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]">
              {leftIcon}
            </span>
          )}
          <input
            id={inputId}
            type={effectiveType}
            ref={ref}
            className={cn(
              "w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af]",
              "border-[#e5e7eb] transition-all duration-150 hover:border-[#cbd5e1]",
              "focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent",
              "disabled:bg-[#f3f4f6] disabled:cursor-not-allowed",
              error && "border-red-400 focus:ring-red-400",
              leftIcon && "pl-10",
              resolvedRightIcon && "pr-10",
              className
            )}
            {...props}
          />
          {resolvedRightIcon && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af]">
              {resolvedRightIcon}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p className="text-xs text-[#6b7280]">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
