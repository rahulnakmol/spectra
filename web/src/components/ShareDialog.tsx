import { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogActions, DialogContent,
  Button, Field, Input, Textarea, Badge, MessageBar, MessageBarBody, Text,
  DialogTrigger,
} from '@fluentui/react-components';
import { LockClosed24Regular } from '@fluentui/react-icons';
import type { FileItem } from '@spectra/shared';
import { useShare } from '../api/hooks';
import { RecipientPicker, type Recipient } from './RecipientPicker';

interface Props {
  file: FileItem;
  open: boolean;
  onClose: () => void;
}

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

export function ShareDialog({ file, open, onClose }: Props): JSX.Element {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [message, setMessage] = useState('');
  const [expires, setExpires] = useState<string>(isoDaysFromNow(DEFAULT_DAYS));
  const [recipError, setRecipError] = useState<string | undefined>(undefined);
  const [expError, setExpError] = useState<string | undefined>(undefined);
  const triggerRef = useRef<HTMLElement | null>(null);
  const share = useShare();

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
    } else if (triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [open]);

  function reset(): void {
    setRecipients([]);
    setMessage('');
    setExpires(isoDaysFromNow(DEFAULT_DAYS));
    setRecipError(undefined);
    setExpError(undefined);
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  function validate(): boolean {
    let ok = true;
    if (recipients.length === 0) {
      setRecipError('At least one recipient is required.');
      ok = false;
    } else {
      setRecipError(undefined);
    }
    const expDate = new Date(`${expires}T23:59:59Z`);
    const max = new Date();
    max.setUTCDate(max.getUTCDate() + MAX_DAYS);
    if (Number.isNaN(expDate.getTime()) || expDate.getTime() <= Date.now()) {
      setExpError('Expiry must be in the future.');
      ok = false;
    } else if (expDate.getTime() > max.getTime()) {
      setExpError(`Expiry cannot exceed ${MAX_DAYS} days from now.`);
      ok = false;
    } else {
      setExpError(undefined);
    }
    return ok;
  }

  async function submit(): Promise<void> {
    if (!validate()) return;
    await share.mutateAsync({
      itemId: file.id,
      recipientUpns: recipients.map((r) => r.upn),
      ...(message.length > 0 ? { message } : {}),
      expiresAt: new Date(`${expires}T23:59:59Z`).toISOString(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(_e, data) => { if (!data.open) handleClose(); }} modalType="modal">
      <DialogSurface aria-describedby="share-desc">
        <DialogBody>
          <DialogTitle>Share &ldquo;{file.name}&rdquo;</DialogTitle>
          <DialogContent>
            <div id="share-desc" className="flex flex-col gap-4">
              <RecipientPicker value={recipients} onChange={setRecipients} {...(recipError ? { error: recipError } : {})} />
              <Field label="Message (optional)">
                <Textarea
                  value={message}
                  onChange={(_e, data) => setMessage(data.value)}
                  rows={3}
                  maxLength={2000}
                  aria-describedby="share-msg-hint"
                />
                <Text id="share-msg-hint" size={200}>Up to 2000 characters.</Text>
              </Field>
              <Field
                label="Expires on"
                required
                {...(expError ? { validationState: 'error' as const, validationMessage: expError } : {})}
              >
                <Input
                  type="date"
                  value={expires}
                  onChange={(_e, data) => setExpires(data.value)}
                  max={isoDaysFromNow(MAX_DAYS)}
                />
              </Field>
              <Badge appearance="filled" icon={<LockClosed24Regular />} aria-label="Prevent download is locked on">
                Prevent download (locked on)
              </Badge>
              {share.isError ? (
                <MessageBar intent="error" aria-live="polite">
                  <MessageBarBody>{(share.error as Error).message}</MessageBarBody>
                </MessageBar>
              ) : null}
              {share.isSuccess ? (
                <MessageBar intent="success" aria-live="polite">
                  <MessageBarBody>Share created. Recipients will receive an email shortly.</MessageBarBody>
                </MessageBar>
              ) : null}
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary" onClick={handleClose}>Cancel</Button>
            </DialogTrigger>
            <Button appearance="primary" disabled={share.isPending} onClick={() => void submit()}>
              {share.isPending ? 'Sharing\u2026' : 'Share'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
