import { useState } from 'react';
import {
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, DialogTrigger,
  Button, Field, Input, Dropdown, Option, Textarea, MessageBar, MessageBarBody,
} from '@fluentui/react-components';
import type { WorkspaceConfig, WorkspaceTemplate } from '@spectra/shared';
import { useCreateWorkspace } from '../../api/hooks';

interface Props { open: boolean; onClose: () => void; }

const TEMPLATES: ReadonlyArray<{ id: WorkspaceTemplate; label: string }> = [
  { id: 'invoices', label: 'Invoices' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'hr-docs', label: 'HR docs' },
  { id: 'blank', label: 'Blank' },
];

export function CreateWorkspaceDialog({ open, onClose }: Props): JSX.Element {
  const [id, setId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [template, setTemplate] = useState<WorkspaceTemplate>('invoices');
  const [schemaJson, setSchemaJson] = useState('[]');
  const [parseError, setParseError] = useState<string | null>(null);
  const create = useCreateWorkspace();

  function reset(): void {
    setId(''); setDisplayName(''); setTemplate('invoices'); setSchemaJson('[]'); setParseError(null);
  }
  function close(): void { reset(); onClose(); }

  async function submit(): Promise<void> {
    let metadataSchema: WorkspaceConfig['metadataSchema'];
    try {
      metadataSchema = JSON.parse(schemaJson) as WorkspaceConfig['metadataSchema'];
      if (!Array.isArray(metadataSchema)) throw new Error('Schema must be a JSON array.');
      setParseError(null);
    } catch (e) {
      setParseError((e as Error).message);
      return;
    }
    await create.mutateAsync({ id, displayName, template, metadataSchema, archived: false });
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(_e, data) => { if (!data.open) close(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogContent>
            <div className="flex flex-col gap-3">
              <Field label="ID (lowercase-kebab)" required>
                <Input value={id} onChange={(_e, d) => setId(d.value)} />
              </Field>
              <Field label="Display name" required>
                <Input value={displayName} onChange={(_e, d) => setDisplayName(d.value)} />
              </Field>
              <Field label="Template" required>
                <Dropdown
                  value={TEMPLATES.find((t) => t.id === template)?.label ?? ''}
                  onOptionSelect={(_e, d) => setTemplate(d.optionValue as WorkspaceTemplate)}
                >
                  {TEMPLATES.map((t) => <Option key={t.id} value={t.id}>{t.label}</Option>)}
                </Dropdown>
              </Field>
              <Field
                label="Metadata schema (JSON array)"
                {...(parseError ? { validationState: 'error' as const, validationMessage: parseError } : {})}
                hint='Example: [{"name":"Vendor","type":"string","required":true,"indexed":true}]'
              >
                <Textarea rows={6} value={schemaJson} onChange={(_e, d) => setSchemaJson(d.value)} />
              </Field>
              {create.isError ? (
                <MessageBar intent="error" aria-live="polite">
                  <MessageBarBody>{(create.error as Error).message}</MessageBarBody>
                </MessageBar>
              ) : null}
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button onClick={close}>Cancel</Button>
            </DialogTrigger>
            <Button appearance="primary" disabled={create.isPending} onClick={() => void submit()}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
