import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm",
    "font-condensed text-xs font-bold uppercase tracking-wider",
    "transition-colors duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
    "disabled:pointer-events-none disabled:opacity-30",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-fg text-bg-base hover:bg-fg/90",
        secondary:
          "border border-border text-fg/80 hover:border-border-strong hover:text-fg",
        gold:
          "border border-gold-dim text-gold hover:bg-gold/[0.08] hover:border-gold",
        danger:
          "border border-status-error/40 text-status-error hover:bg-status-error/[0.08]",
        ghost: "text-fg/70 hover:bg-bg-raised hover:text-fg",
      },
      size: {
        sm: "h-7 px-3 text-[10px]",
        md: "h-9 px-5",
        lg: "h-12 px-7 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
