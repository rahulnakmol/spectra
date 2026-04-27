import { useState } from 'react';
import {
  Combobox, Option, Tag, TagGroup, Field, Spinner,
} from '@fluentui/react-components';
import { useUserSearch, type UserHit } from '../api/hooks/useUserSearch';

export interface Recipient {
  upn: string;
  displayName: string;
}

interface Props {
  value: Recipient[];
  onChange: (next: Recipient[]) => void;
  error?: string;
}

export function RecipientPicker({ value, onChange, error }: Props): JSX.Element {
  const [q, setQ] = useState('');
  const search = useUserSearch(q);

  function add(hit: UserHit): void {
    if (value.some((r) => r.upn === hit.upn)) return;
    onChange([...value, { upn: hit.upn, displayName: hit.displayName }]);
    setQ('');
  }

  function remove(upn: string): void {
    onChange(value.filter((r) => r.upn !== upn));
  }

  return (
    <Field
      label="Recipients"
      required
      {...(error ? { validationState: 'error' as const, validationMessage: error } : {})}
      hint="Internal users only. Type at least 2 characters to search."
    >
      <Combobox
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onOptionSelect={(_e, data) => {
          const hit = (search.data ?? []).find((u) => u.upn === data.optionValue);
          if (hit) add(hit);
        }}
        aria-describedby="recipients-list"
        listbox={{ 'aria-label': 'Matching users' }}
        clearable
      >
        {search.isLoading ? <Option value="__loading__" text="Loading…" disabled><Spinner size="tiny" /></Option> : null}
        {(search.data ?? []).map((u) => (
          <Option key={u.oid} value={u.upn} text={u.displayName}>
            {u.displayName} <span aria-hidden="true">·</span> {u.upn}
          </Option>
        ))}
      </Combobox>
      <TagGroup
        id="recipients-list"
        aria-label="Selected recipients"
        onDismiss={(_e, data) => remove(data.value)}
      >
        {value.map((r) => (
          <Tag key={r.upn} value={r.upn} dismissible aria-label={`Remove ${r.displayName}`}>
            {r.displayName}
          </Tag>
        ))}
      </TagGroup>
    </Field>
  );
}
