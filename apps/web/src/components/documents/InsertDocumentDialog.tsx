import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  documentFromFields,
  fieldsFromSample,
  jsonTemplateFromSample,
  type FormField,
} from '@/lib/insert-template';

type Mode = 'form' | 'json';

interface InsertDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  /** Sample document to base the form on (e.g. most recent). */
  templateDoc: Record<string, unknown> | null;
  templateLoading?: boolean;
  onInsert: (document: unknown) => void;
  pending?: boolean;
}

export function InsertDocumentDialog({
  open,
  onClose,
  templateDoc,
  templateLoading,
  onInsert,
  pending,
}: InsertDocumentDialogProps) {
  const hasTemplate = !!(templateDoc && Object.keys(templateDoc).some((k) => k !== '_id'));
  const [mode, setMode] = useState<Mode>(hasTemplate ? 'form' : 'json');
  const [fields, setFields] = useState<FormField[]>([]);
  const [jsonText, setJsonText] = useState('{\n  \n}');
  const [error, setError] = useState<string | null>(null);

  // Reset when opened / template changes
  useEffect(() => {
    if (!open) return;
    setError(null);
    const nextFields = fieldsFromSample(templateDoc ?? undefined);
    setFields(nextFields);
    setJsonText(jsonTemplateFromSample(templateDoc ?? undefined));
    setMode(nextFields.length > 0 ? 'form' : 'json');
  }, [open, templateDoc]);

  const formPreview = useMemo(() => {
    try {
      return documentFromFields(fields);
    } catch {
      return null;
    }
  }, [fields]);

  function submit() {
    setError(null);
    try {
      if (mode === 'json') {
        const doc = JSON.parse(jsonText || '{}') as unknown;
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
          throw new Error('Document must be a JSON object');
        }
        onInsert(doc);
        return;
      }
      const doc = documentFromFields(fields);
      onInsert(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid document');
    }
  }

  function syncFormToJson() {
    try {
      setJsonText(JSON.stringify(documentFromFields(fields), null, 2));
      setMode('json');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid form');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Insert document" className="max-w-xl">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[var(--color-border)] p-0.5">
            <button
              type="button"
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium',
                mode === 'form'
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]',
              )}
              onClick={() => setMode('form')}
              disabled={!hasTemplate && fields.length === 0}
            >
              Form
            </button>
            <button
              type="button"
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium',
                mode === 'json'
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]',
              )}
              onClick={() => {
                if (mode === 'form') syncFormToJson();
                else setMode('json');
              }}
            >
              JSON
            </button>
          </div>
          {templateLoading && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-muted)]">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading template…
            </span>
          )}
          {!templateLoading && hasTemplate && (
            <span className="text-[11px] text-[var(--color-muted-fg)]">
              Form matches the most recent document’s fields
            </span>
          )}
          {!templateLoading && !hasTemplate && (
            <span className="text-[11px] text-[var(--color-muted-fg)]">
              No sample doc — use JSON (or insert one to unlock the form)
            </span>
          )}
        </div>

        {mode === 'form' ? (
          fields.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-muted)]">
              No field template. Switch to <strong>JSON</strong> to insert freely.
            </p>
          ) : (
            <div className="max-h-[50vh] space-y-2.5 overflow-y-auto overscroll-contain pr-1">
              {fields.map((f) => (
                <label key={f.key} className="block space-y-1">
                  <span className="flex items-center gap-2 font-mono text-[11px] text-[var(--color-muted)]">
                    {f.key}
                    <span className="rounded bg-[var(--color-input)] px-1 text-[9px] uppercase tracking-wide text-[var(--color-muted-fg)]">
                      {f.kind}
                    </span>
                  </span>
                  {f.kind === 'boolean' ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!f.boolValue}
                        onChange={(e) =>
                          setFields((prev) =>
                            prev.map((x) =>
                              x.key === f.key ? { ...x, boolValue: e.target.checked } : x,
                            ),
                          )
                        }
                      />
                      {f.boolValue ? 'true' : 'false'}
                    </label>
                  ) : f.kind === 'json' ? (
                    <textarea
                      className="min-h-[56px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] p-2 font-mono text-xs"
                      value={f.value}
                      spellCheck={false}
                      onChange={(e) =>
                        setFields((prev) =>
                          prev.map((x) => (x.key === f.key ? { ...x, value: e.target.value } : x)),
                        )
                      }
                    />
                  ) : f.kind === 'null' ? (
                    <span className="text-xs text-[var(--color-muted-fg)]">null</span>
                  ) : (
                    <Input
                      className="font-mono text-xs"
                      value={f.value}
                      placeholder={f.kind === 'objectId' ? '24-char hex ObjectId' : undefined}
                      onChange={(e) =>
                        setFields((prev) =>
                          prev.map((x) => (x.key === f.key ? { ...x, value: e.target.value } : x)),
                        )
                      }
                    />
                  )}
                </label>
              ))}
              {formPreview && (
                <details className="text-[11px] text-[var(--color-muted-fg)]">
                  <summary className="cursor-pointer hover:text-[var(--color-muted)]">
                    Preview JSON
                  </summary>
                  <pre className="mt-1 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-2 font-mono text-[10px]">
                    {JSON.stringify(formPreview, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )
        ) : (
          <textarea
            className="min-h-[220px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] p-3 font-mono text-xs"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
            aria-label="Document JSON"
          />
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Insert
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
