import { Chip as HeroChip, type ChipProps } from '@heroui/react';
import { forwardRef } from 'react';

/** App-wide Chip with uppercase text. */
export const Chip = forwardRef<HTMLDivElement, ChipProps>((props, ref) => (
  <HeroChip
    {...props}
    ref={ref}
    classNames={{
      ...props.classNames,
      content: `uppercase tracking-wide text-[0.65rem] ${props.classNames?.content ?? ''}`,
    }}
  />
));

Chip.displayName = 'Chip';
