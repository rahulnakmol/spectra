import { useState } from 'react';
import { Field, Input, Dropdown, Option } from '@fluentui/react-components';
import type { MetadataField } from '@spectra/shared';

export type MetadataValues = Record<string, string | number>;

interface Props {
  schema: MetadataField[];
  values: MetadataValues;
  onChange: (v: MetadataValues) => void;
  errors: Record<string, string>;
}

export function MetadataForm({ schema, values, onChange, errors }: Props): JSX.Element {
  return (
    <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
      <legend className="sr-only">File metadata</legend>
      {schema.map((f) => {
        const id = `meta-${f.name}`;
        const err = errors[f.name];
        return (
          <Field
            key={f.name}
            label={f.name}
            required={f.required}
            {...(err ? { validationState: 'error' as const, validationMessage: err } : {})}
            {...(f.description ? { hint: f.description } : {})}
          >
            {f.type === 'enum' && f.enumValues ? (
              <Dropdown
                id={id}
                value={String(values[f.name] ?? '')}
                onOptionSelect={(_e, data) => onChange({ ...values, [f.name]: data.optionValue ?? '' })}
              >
                {f.enumValues.map((v) => <Option key={v} value={v}>{v}</Option>)}
              </Dropdown>
            ) : f.type === 'number' ? (
              <Input
                id={id}
                type="number"
                value={String(values[f.name] ?? '')}
                onChange={(_e, data) => onChange({ ...values, [f.name]: data.value === '' ? '' : Number(data.value) })}
              />
            ) : f.type === 'date' ? (
              <Input
                id={id}
                type="date"
                value={String(values[f.name] ?? '')}
                onChange={(_e, data) => onChange({ ...values, [f.name]: data.value })}
              />
            ) : (
              <Input
                id={id}
                type="text"
                value={String(values[f.name] ?? '')}
                onChange={(_e, data) => onChange({ ...values, [f.name]: data.value })}
              />
            )}
          </Field>
        );
      })}
    </fieldset>
  );
}

export function validateMetadata(schema: MetadataField[], values: MetadataValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of schema) {
    const v = values[f.name];
    if (f.required && (v === undefined || v === '' || v === null)) {
      errors[f.name] = `${f.name} is required.`;
      continue;
    }
    if (f.type === 'number' && v !== '' && v !== undefined && Number.isNaN(Number(v))) {
      errors[f.name] = `${f.name} must be a number.`;
    }
    if (f.type === 'enum' && f.enumValues && v !== '' && v !== undefined && !f.enumValues.includes(String(v))) {
      errors[f.name] = `${f.name} must be one of ${f.enumValues.join(', ')}.`;
    }
  }
  return errors;
}

export function _UncontrolledMetadataForm(props: Omit<Props, 'values' | 'onChange' | 'errors'>): JSX.Element {
  const [values, setValues] = useState<MetadataValues>({});
  return <MetadataForm {...props} values={values} onChange={setValues} errors={{}} />;
}
