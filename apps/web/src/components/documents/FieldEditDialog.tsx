import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { bsonTypeOf, formatCell } from '@/lib/api';

export type FieldEditType =
  | 'string'
  | 'int'
  | 'long'
  | 'double'
  | 'decimal'
  | 'bool'
  | 'date'
  | 'objectId'
  | 'null'
  | 'json';

const TYPES: FieldEditType[] = [
  'string',
  'int',
  'long',
  'double',
  'decimal',
  'bool',
  'date',
  'objectId',
  'null',
  'json',
];

export function inferUiFieldType(value: unknown): FieldEditType {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
  if (value && typeof value === 'object') {
    if ('$oid' in value) return 'objectId';
    if ('$date' in value) return 'date';
    if ('$numberLong' in value) return 'long';
    if ('$numberDecimal' in value) return 'decimal';
    if ('$numberInt' in value) return 'int';
    if ('$numberDouble' in value) return 'double';
    return 'json';
  }
  return 'string';
}

function valueToEditorInput(value: unknown, type: FieldEditType): string | boolean {
  if (type === 'null') return '';
  if (type === 'bool') return Boolean(value);
  if (type === 'objectId') {
    if (value && typeof value === 'object' && '$oid' in value) {
      return String((value as { $oid: string }).$oid);
    }
    return String(value ?? '');
  }
  if (type === 'date') {
    return dateToLocalInput(value);
  }
  if (type === 'long' || type === 'decimal' || type === 'int' || type === 'double') {
    if (value && typeof value === 'object') {
      if ('$numberLong' in value) return String((value as { $numberLong: string }).$numberLong);
      if ('$numberDecimal' in value)
        return String((value as { $numberDecimal: string }).$numberDecimal);
      if ('$numberInt' in value) return String((value as { $numberInt: string }).$numberInt);
      if ('$numberDouble' in value)
        return String((value as { $numberDouble: string }).$numberDouble);
    }
    return value === undefined || value === null ? '' : String(value);
  }
  if (type === 'json') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return value === undefined || value === null ? '' : String(value);
}

function dateToLocalInput(value: unknown): string {
  let d: Date | null = null;
  if (value instanceof Date) d = value;
  else if (value && typeof value === 'object' && '$date' in value) {
    const inner = (value as { $date: unknown }).$date;
    if (typeof inner === 'string') d = new Date(inner);
    else if (typeof inner === 'number') d = new Date(inner);
    else if (inner && typeof inner === 'object' && '$numberLong' in inner) {
      d = new Date(Number((inner as { $numberLong: string }).$numberLong));
    }
  } else if (typeof value === 'string' || typeof value === 'number') {
    d = new Date(value);
  }
  if (!d || Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface FieldEditPayload {
  path: string;
  type: FieldEditType;
  value: unknown;
}

export function FieldEditDialog({
  open,
  path,
  currentValue,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  path: string;
  currentValue: unknown;
  onClose: () => void;
  onSave: (payload: FieldEditPayload) => void;
  saving?: boolean;
}) {
  const inferred = useMemo(() => inferUiFieldType(currentValue), [currentValue]);
  const [type, setType] = useState<FieldEditType>(inferred);
  const [text, setText] = useState('');
  const [boolVal, setBoolVal] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = inferUiFieldType(currentValue);
    setType(t);
    const v = valueToEditorInput(currentValue, t);
    if (typeof v === 'boolean') {
      setBoolVal(v);
      setText('');
    } else {
      setText(v);
      setBoolVal(false);
    }
  }, [open, currentValue, path]);

  useEffect(() => {
    if (!open) return;
    // When type changes, reset editor from current value in new shape when possible
    const v = valueToEditorInput(currentValue, type);
    if (typeof v === 'boolean') setBoolVal(v);
    else if (type !== 'bool') setText(typeof v === 'string' ? v : String(v));
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    let value: unknown = text;
    if (type === 'bool') value = boolVal;
    if (type === 'null') value = null;
    onSave({ path, type, value });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Edit field" className="max-w-lg">
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-xs text-[var(--color-muted)]">Path</div>
          <code className="font-mono text-sm text-[var(--color-accent)]">{path}</code>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
          <span>Current:</span>
          <Badge className="font-mono">{bsonTypeOf(currentValue)}</Badge>
          <span className="max-w-full truncate font-mono">{formatCell(currentValue)}</span>
        </div>
        <label className="grid gap-1.5 text-sm">
          <span className="text-[var(--color-muted)]">Type</span>
          <select
            className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] px-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as FieldEditType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {type === 'bool' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={boolVal}
              onChange={(e) => setBoolVal(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--color-border)]"
            />
            Value is true
          </label>
        )}

        {type === 'null' && (
          <p className="text-sm text-[var(--color-muted)]">Field will be set to null.</p>
        )}

        {type === 'date' && (
          <label className="grid gap-1.5 text-sm">
            <span className="text-[var(--color-muted)]">Date</span>
            <Input
              type="datetime-local"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        )}

        {type === 'objectId' && (
          <label className="grid gap-1.5 text-sm">
            <span className="text-[var(--color-muted)]">ObjectId (24 hex)</span>
            <Input
              className="font-mono text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="626dd5775947fc3a08b2c6dc"
              spellCheck={false}
            />
          </label>
        )}

        {(type === 'string' ||
          type === 'int' ||
          type === 'long' ||
          type === 'double' ||
          type === 'decimal') && (
          <label className="grid gap-1.5 text-sm">
            <span className="text-[var(--color-muted)]">Value</span>
            <Input
              className={type === 'string' ? '' : 'font-mono text-xs'}
              type={type === 'int' || type === 'double' ? 'number' : 'text'}
              step={type === 'double' || type === 'decimal' ? 'any' : undefined}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
            {type === 'long' && (
              <span className="text-[11px] text-[var(--color-muted-fg)]">
                Use full integer string to preserve values beyond JS safe integer.
              </span>
            )}
          </label>
        )}

        {type === 'json' && (
          <label className="grid gap-1.5 text-sm">
            <span className="text-[var(--color-muted)]">JSON</span>
            <textarea
              className="min-h-[140px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] p-3 font-mono text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save field'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
