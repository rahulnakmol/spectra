import type { FileItem } from '@spectra/shared';

interface Props {
  file: FileItem;
  open: boolean;
  onClose: () => void;
}

export function ShareDialog({ open }: Props): JSX.Element {
  if (!open) return <></>;
  return <div role="dialog" aria-label="Share file" aria-modal="true" />;
}
