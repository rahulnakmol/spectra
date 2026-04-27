import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Title2, Button, Field, Dropdown, Option, MessageBar, MessageBarBody,
  ProgressBar, Text, Card, CardHeader,
} from '@fluentui/react-components';
import { useTeams, useUpload, useWorkspaces } from '../api/hooks';
import { DropZone } from '../components/DropZone';
import { MetadataForm, validateMetadata, type MetadataValues } from '../components/MetadataForm';

type Step = 1 | 2 | 3;

export function UploadPage(): JSX.Element {
  const { ws = '' } = useParams();
  const nav = useNavigate();
  const teams = useTeams(ws);
  const workspaces = useWorkspaces();
  const upload = useUpload();

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [teamCode, setTeamCode] = useState('');
  const [year, setYear] = useState<number>(new Date().getUTCFullYear());
  const [month, setMonth] = useState<number>(new Date().getUTCMonth() + 1);
  const [metadata, setMetadata] = useState<MetadataValues>({});
  const [progress, setProgress] = useState(0);

  const wsConfig = workspaces.data?.find((w) => w.id === ws);
  const schema = wsConfig?.metadataSchema ?? [];
  const errors = useMemo(() => validateMetadata(schema, metadata), [schema, metadata]);

  const canNext1 = file !== null;
  const canNext2 = teamCode !== '' && Number.isFinite(year) && Number.isFinite(month);
  const canSubmit = Object.keys(errors).length === 0 && canNext2 && file !== null;

  async function handleSubmit(): Promise<void> {
    if (!file) return;
    const result = await upload.mutateAsync({
      file, workspaceId: ws, teamCode, year, month, metadata,
      onProgress: setProgress,
    });
    nav(`/w/${ws}/browse?selected=${encodeURIComponent(result.id)}`);
  }

  return (
    <section aria-labelledby="upload-title" className="flex flex-col gap-4 max-w-3xl">
      <Title2 as="h1" id="upload-title">Upload to {ws}</Title2>

      <ol role="list" aria-label="Upload steps" className="flex gap-2 list-none p-0">
        {([1, 2, 3] as Step[]).map((i) => (
          <li key={i} {...(step === i ? { 'aria-current': 'step' as const } : {})}>
            <Card>
              <CardHeader
                header={<Text weight={step === i ? 'semibold' : 'regular'}>Step {i}</Text>}
                description={i === 1 ? 'File' : i === 2 ? 'Categorize' : 'Details'}
              />
            </Card>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <>
          <DropZone onFile={(f) => setFile(f)} />
          {file ? <Text aria-live="polite">Selected: {file.name}</Text> : null}
          <div className="flex justify-end">
            <Button appearance="primary" disabled={!canNext1} onClick={() => setStep(2)}>Next</Button>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Field label="Team" required>
            <Dropdown
              value={teams.data?.find((t) => t.teamCode === teamCode)?.teamDisplayName ?? ''}
              onOptionSelect={(_e, data) => setTeamCode(data.optionValue ?? '')}
            >
              {(teams.data ?? []).map((t) => (
                <Option key={t.teamCode} value={t.teamCode}>{t.teamDisplayName}</Option>
              ))}
            </Dropdown>
          </Field>
          <Field label="Year" required>
            <Dropdown
              value={String(year)}
              onOptionSelect={(_e, data) => setYear(Number(data.optionValue))}
            >
              {[year, year - 1, year - 2].map((y) => <Option key={y} value={String(y)}>{String(y)}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Month" required>
            <Dropdown
              value={String(month).padStart(2, '0')}
              onOptionSelect={(_e, data) => setMonth(Number(data.optionValue))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <Option key={m} value={String(m)}>{String(m).padStart(2, '0')}</Option>
              ))}
            </Dropdown>
          </Field>
          <div className="flex justify-between">
            <Button onClick={() => setStep(1)}>Back</Button>
            <Button appearance="primary" disabled={!canNext2} onClick={() => setStep(3)}>Next</Button>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <MetadataForm schema={schema} values={metadata} onChange={setMetadata} errors={errors} />
          {upload.isError ? (
            <MessageBar intent="error" aria-live="polite">
              <MessageBarBody>{(upload.error as Error).message}</MessageBarBody>
            </MessageBar>
          ) : null}
          {upload.isPending ? (
            <div aria-live="polite" className="flex flex-col gap-1">
              <Text>Uploading…</Text>
              <ProgressBar value={progress / 100} aria-label="Upload progress" />
            </div>
          ) : null}
          <div className="flex justify-between">
            <Button onClick={() => setStep(2)} disabled={upload.isPending}>Back</Button>
            <Button appearance="primary" disabled={!canSubmit || upload.isPending} onClick={handleSubmit}>
              Upload
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
