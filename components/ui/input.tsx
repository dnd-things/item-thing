import { Input as InputPrimitive } from '@base-ui/react/input';
import type * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-4xl border border-input bg-input/20 px-3 py-1 text-base transition-all duration-200 outline-none hover:border-primary/25 hover:bg-input/30 file:inline-flex file:h-7 file:cursor-pointer file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:bg-input/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input disabled:hover:bg-input/20 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
