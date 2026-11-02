import type { ComponentProps } from 'react';
import { Select as UpstreamSelect } from './components/ui/Select';
export type { SelectOption } from './components/ui/Select';
/** Keep Escape consumed by the dropdown from also reaching a containing Modal. */
export function Select(props: ComponentProps<typeof UpstreamSelect>) {
  return (
    <div
      className="cli-select-adapter"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && event.defaultPrevented) event.stopPropagation();
      }}
    >
      <UpstreamSelect {...props} />
    </div>
  );
}
