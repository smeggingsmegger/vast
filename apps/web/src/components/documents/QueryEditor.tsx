import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  Eye,
  Filter,
  HelpCircle,
  LayoutList,
  Loader2,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  BUILDER_OPS,
  QUERY_TEMPLATES,
  defaultFindScript,
  emptyBuilderState,
  findBuilderToScript,
  isPreviewable,
  isRunnable,
  isWriteOp,
  newCondition,
  parseQueryScript,
  scriptToBuilder,
  type FindBuilderState,
  type ParsedScript,
} from '@/lib/query-script';
import {
  deleteSavedScript,
  listSavedScripts,
  upsertSavedScript,
  type SavedScript,
} from '@/lib/saved-scripts';

export interface RunFindPayload {
  filter: unknown;
  projection?: Record<string, 0 | 1>;
  sort?: Record<string, 1 | -1>;
  skip?: number;
  limit?: number;
  kind: 'find' | 'findOne' | 'count';
}

export interface RunAggregatePayload {
  pipeline: unknown[];
  kind: 'aggregate';
}

export type RunScriptPayload = ParsedScript;

interface QueryEditorProps {
  cid: string;
  db: string;
  col: string;
  script: string;
  onScriptChange: (script: string) => void;
  onRunFind: (payload: RunFindPayload) => void;
  onRunAggregate?: (payload: RunAggregatePayload) => void;
  /** Unified run for all parsed ops (preferred). */
  onRunScript?: (parsed: RunScriptPayload) => void | Promise<void>;
  /** Dry-run: match count + sample without mutating. */
  onPreviewScript?: (parsed: RunScriptPayload) => void | Promise<void>;
  running?: boolean;
  previewing?: boolean;
  /** Suggested field names for the builder. */
  fieldSuggestions?: string[];
}

type EditorMode = 'script' | 'builder';

export function QueryEditor({
  cid,
  db,
  col,
  script,
  onScriptChange,
  onRunFind,
  onRunAggregate,
  onRunScript,
  onPreviewScript,
  running,
  previewing,
  fieldSuggestions = [],
}: QueryEditorProps) {
  const [mode, setMode] = useState<EditorMode>('script');
  const [builder, setBuilder] = useState<FindBuilderState>(() => emptyBuilderState());
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saved, setSaved] = useState<SavedScript[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  // Reset default script when collection changes if still empty-ish
  useEffect(() => {
    setShowTemplates(false);
    setShowSaved(false);
    const b = scriptToBuilder(script);
    if (b) setBuilder(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on col identity
  }, [cid, db, col]);

  function refreshSaved() {
    setSaved(listSavedScripts({ cid, db, col }));
  }

  useEffect(() => {
    refreshSaved();
  }, [cid, db, col]);

  const parsePreview = useMemo(() => {
    try {
      return { ok: true as const, parsed: parseQueryScript(script) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'Parse error' };
    }
  }, [script]);

  function applyTemplate(id: string) {
    const t = QUERY_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const next = t.build(col);
    onScriptChange(next);
    const b = scriptToBuilder(next);
    if (b) setBuilder(b);
    setShowTemplates(false);
    setMode('script');
    toast.message(`Loaded template: ${t.label}`);
  }

  function switchToBuilder() {
    const b = scriptToBuilder(script);
    if (b) {
      setBuilder(b);
      setMode('builder');
    } else {
      toast.message('Script is too complex for the builder — staying in Script mode');
      setMode('script');
    }
  }

  function applyBuilderToScript() {
    const next = findBuilderToScript(col, builder);
    onScriptChange(next);
  }

  function runFromBuilder() {
    applyBuilderToScript();
    const next = findBuilderToScript(col, builder);
    try {
      const parsed = parseQueryScript(next);
      runParsed(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid query');
    }
  }

  function runScript() {
    try {
      const parsed = parseQueryScript(script);
      runParsed(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid query');
    }
  }

  function runParsed(parsed: ParsedScript) {
    if (!isRunnable(parsed)) {
      toast.error('Could not understand this script. Check syntax or load an Example.');
      return;
    }
    if (onRunScript) {
      void onRunScript(parsed);
      return;
    }
    // Legacy fallbacks
    if (parsed.kind === 'aggregate') {
      if (!onRunAggregate) {
        toast.message('Open the Aggregate tab to run pipelines, or use a find() script here.');
        return;
      }
      onRunAggregate({ kind: 'aggregate', pipeline: parsed.pipeline });
      return;
    }
    if (parsed.kind === 'find' || parsed.kind === 'findOne' || parsed.kind === 'count') {
      onRunFind({
        kind: parsed.kind,
        filter: parsed.filter,
        projection: parsed.projection,
        sort: parsed.sort,
        skip: parsed.skip,
        limit: parsed.kind === 'findOne' ? 1 : parsed.limit,
      });
    }
  }

  function previewParsed(parsed: ParsedScript) {
    if (!isPreviewable(parsed)) {
      toast.message('Preview works for find / update / delete (ops with a filter).');
      return;
    }
    if (onPreviewScript) {
      void onPreviewScript(parsed);
      return;
    }
    toast.message('Preview is not wired for this view.');
  }

  function handlePreview() {
    try {
      const parsed =
        mode === 'builder'
          ? parseQueryScript(findBuilderToScript(col, builder))
          : parseQueryScript(script);
      if (mode === 'builder') onScriptChange(findBuilderToScript(col, builder));
      previewParsed(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid query');
    }
  }

  const canPreview =
    parsePreview.ok && isPreviewable(parsePreview.parsed);
  const writeOp =
    parsePreview.ok && isWriteOp(parsePreview.parsed.kind);

  function handleSave() {
    if (!saveName.trim()) {
      toast.error('Name your script');
      return;
    }
    upsertSavedScript({
      name: saveName.trim(),
      script,
      cid,
      db,
      col,
    });
    refreshSaved();
    setSaveOpen(false);
    setSaveName('');
    toast.success('Script saved');
  }

  function loadSaved(s: SavedScript) {
    onScriptChange(s.script);
    const b = scriptToBuilder(s.script);
    if (b) setBuilder(b);
    setShowSaved(false);
    setMode('script');
    toast.message(`Loaded “${s.name}”`);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex rounded-lg border border-[var(--color-border)] p-0.5">
          <button
            type="button"
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium',
              mode === 'script'
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]',
            )}
            onClick={() => setMode('script')}
          >
            <LayoutList className="h-3 w-3" />
            Script
          </button>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium',
              mode === 'builder'
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-foreground)]',
            )}
            onClick={switchToBuilder}
          >
            <Wand2 className="h-3 w-3" />
            Builder
          </button>
        </div>

        <div className="relative">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setShowTemplates((v) => !v);
              setShowSaved(false);
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Examples
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
          {showTemplates && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-20 cursor-default"
                aria-label="Close"
                onClick={() => setShowTemplates(false)}
              />
              <div className="absolute left-0 z-30 mt-1 max-h-80 w-72 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-2 shadow-xl">
                <p className="mb-1 px-1 text-[10px] font-medium tracking-wide text-[var(--color-muted-fg)] uppercase">
                  Read
                </p>
                {QUERY_TEMPLATES.filter((t) => t.group === 'read').map((t) => (
                  <TemplateRow key={t.id} t={t} onPick={() => applyTemplate(t.id)} />
                ))}
                <p className="mt-2 mb-1 px-1 text-[10px] font-medium tracking-wide text-[var(--color-muted-fg)] uppercase">
                  Pipeline
                </p>
                {QUERY_TEMPLATES.filter((t) => t.group === 'pipeline').map((t) => (
                  <TemplateRow key={t.id} t={t} onPick={() => applyTemplate(t.id)} />
                ))}
                <p className="mt-2 mb-1 px-1 text-[10px] font-medium tracking-wide text-[var(--color-muted-fg)] uppercase">
                  Write
                </p>
                {QUERY_TEMPLATES.filter((t) => t.group === 'write').map((t) => (
                  <TemplateRow key={t.id} t={t} onPick={() => applyTemplate(t.id)} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              refreshSaved();
              setShowSaved((v) => !v);
              setShowTemplates(false);
            }}
          >
            <Bookmark className="h-3.5 w-3.5" />
            Saved
            {saved.length > 0 && (
              <Badge tone="accent" className="ml-0.5">
                {saved.length}
              </Badge>
            )}
          </Button>
          {showSaved && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-20 cursor-default"
                aria-label="Close"
                onClick={() => setShowSaved(false)}
              />
              <div className="absolute left-0 z-30 mt-1 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-2 shadow-xl">
                {saved.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-[var(--color-muted)]">
                    No saved scripts yet. Write a query and click Save.
                  </p>
                ) : (
                  <ul className="max-h-56 space-y-0.5 overflow-auto">
                    {saved.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-[var(--color-card-hover)]"
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left text-xs"
                          onClick={() => loadSaved(s)}
                        >
                          <span className="font-medium">{s.name}</span>
                          {s.col && (
                            <span className="ml-1 font-mono text-[10px] text-[var(--color-muted-fg)]">
                              {s.col}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-[var(--color-muted-fg)] hover:text-red-400"
                          aria-label={`Delete ${s.name}`}
                          onClick={() => {
                            deleteSavedScript(s.id);
                            refreshSaved();
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        <Button size="sm" variant="ghost" onClick={() => setSaveOpen(true)}>
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>

        <Button
          size="sm"
          variant="ghost"
          className="px-2"
          title="Help"
          onClick={() => setShowHelp((v) => !v)}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </Button>

        <div className="flex-1" />

        <Button
          size="sm"
          variant="secondary"
          onClick={handlePreview}
          disabled={running || previewing || !canPreview}
          title="Count matching documents and show a sample (no writes)"
        >
          {previewing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          Preview
        </Button>

        <Button
          size="sm"
          onClick={mode === 'builder' ? runFromBuilder : runScript}
          disabled={running || previewing}
          title={writeOp ? 'Execute write (confirm if many matches)' : 'Run query'}
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {writeOp ? 'Execute' : 'Run'}
        </Button>
      </div>

      {showHelp && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-muted)]">
          <p className="mb-1 font-medium text-[var(--color-foreground)]">How queries work</p>
          <ul className="list-inside list-disc space-y-0.5">
            <li>
              <strong>Preview</strong> counts how many documents match and shows a sample — never
              writes.
            </li>
            <li>
              <strong>Run / Execute</strong> runs the op. Finds fill the grid; writes report
              matched / modified / deleted counts.
            </li>
            <li>
              Use <strong>Examples</strong> for find, updateMany, deleteMany, aggregate, etc.
            </li>
            <li>
              <strong>Builder</strong> is a point-and-click find for beginners.
            </li>
            <li>
              Save reusable scripts with <strong>Save</strong> (this browser only).
            </li>
          </ul>
        </div>
      )}

      {mode === 'script' ? (
        <div className="flex gap-2">
          <textarea
            className="min-h-[100px] flex-1 resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] p-2.5 font-mono text-xs leading-relaxed outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            value={script}
            onChange={(e) => onScriptChange(e.target.value)}
            spellCheck={false}
            aria-label="MongoDB query script"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                runScript();
              }
            }}
          />
        </div>
      ) : (
        <BuilderPanel
          builder={builder}
          setBuilder={setBuilder}
          fieldSuggestions={fieldSuggestions}
          onSyncScript={applyBuilderToScript}
        />
      )}

      <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted-fg)]">
        {parsePreview.ok ? (
          <>
            <Badge
              tone={
                isWriteOp(parsePreview.parsed.kind)
                  ? 'warning'
                  : isRunnable(parsePreview.parsed)
                    ? 'accent'
                    : 'default'
              }
            >
              {parsePreview.parsed.kind}
            </Badge>
            {isWriteOp(parsePreview.parsed.kind) ? (
              <span>Write op — Preview first, then Execute · ⌘/Ctrl+Enter runs</span>
            ) : isRunnable(parsePreview.parsed) ? (
              <span>Ready · Preview match count · Run · ⌘/Ctrl+Enter</span>
            ) : (
              <span>Unrecognized script</span>
            )}
          </>
        ) : (
          <span className="text-red-300">{parsePreview.error}</span>
        )}
      </div>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} title="Save script">
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-muted)]">
            Stored in this browser. Scoped to the current collection when possible.
          </p>
          <Input
            placeholder="e.g. Active accounts last week"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function TemplateRow({
  t,
  onPick,
}: {
  t: (typeof QUERY_TEMPLATES)[number];
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-[var(--color-card-hover)]"
      onClick={onPick}
    >
      <span className="flex items-center gap-1.5 font-mono text-xs">
        {t.label}
        {t.group === 'write' && (
          <span className="rounded bg-amber-500/15 px-1 text-[9px] text-amber-400">write</span>
        )}
      </span>
      <span className="text-[10px] text-[var(--color-muted-fg)]">{t.description}</span>
    </button>
  );
}

function BuilderPanel({
  builder,
  setBuilder,
  fieldSuggestions,
  onSyncScript,
}: {
  builder: FindBuilderState;
  setBuilder: React.Dispatch<React.SetStateAction<FindBuilderState>>;
  fieldSuggestions: string[];
  onSyncScript: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-muted)]">
        <Filter className="h-3.5 w-3.5" />
        Match documents where…
      </div>
      <div className="space-y-1.5">
        {builder.conditions.map((c, i) => (
          <div key={c.id} className="flex flex-wrap items-center gap-1.5">
            {i > 0 && (
              <span className="w-8 text-center text-[10px] font-medium text-[var(--color-muted-fg)]">
                AND
              </span>
            )}
            {i === 0 && <span className="w-8" />}
            <input
              list={`vast-fields-${c.id}`}
              className="h-8 w-[120px] rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-2 font-mono text-xs"
              placeholder="field"
              value={c.field}
              onChange={(e) =>
                setBuilder((b) => ({
                  ...b,
                  conditions: b.conditions.map((x) =>
                    x.id === c.id ? { ...x, field: e.target.value } : x,
                  ),
                }))
              }
            />
            <datalist id={`vast-fields-${c.id}`}>
              {fieldSuggestions.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <select
              className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-1.5 text-xs"
              value={c.op}
              onChange={(e) =>
                setBuilder((b) => ({
                  ...b,
                  conditions: b.conditions.map((x) =>
                    x.id === c.id ? { ...x, op: e.target.value as typeof c.op } : x,
                  ),
                }))
              }
            >
              {BUILDER_OPS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
            <input
              className="h-8 min-w-[100px] flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-2 font-mono text-xs"
              placeholder={c.op === 'in' ? 'a, b, c' : c.op === 'exists' ? 'true / false' : 'value'}
              value={c.value}
              onChange={(e) =>
                setBuilder((b) => ({
                  ...b,
                  conditions: b.conditions.map((x) =>
                    x.id === c.id ? { ...x, value: e.target.value } : x,
                  ),
                }))
              }
            />
            <button
              type="button"
              className="rounded p-1 text-[var(--color-muted-fg)] hover:text-red-400"
              aria-label="Remove condition"
              onClick={() =>
                setBuilder((b) => ({
                  ...b,
                  conditions:
                    b.conditions.length <= 1
                      ? [newCondition()]
                      : b.conditions.filter((x) => x.id !== c.id),
                }))
              }
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setBuilder((b) => ({ ...b, conditions: [...b.conditions, newCondition()] }))}
      >
        <Plus className="h-3.5 w-3.5" />
        Add condition
      </Button>

      <div className="flex flex-wrap items-end gap-3 border-t border-[var(--color-border)] pt-2">
        <label className="space-y-1 text-[11px] text-[var(--color-muted)]">
          Sort by
          <div className="flex gap-1">
            <input
              list="vast-sort-fields"
              className="h-8 w-[120px] rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-2 font-mono text-xs"
              value={builder.sortField}
              onChange={(e) => setBuilder((b) => ({ ...b, sortField: e.target.value }))}
            />
            <datalist id="vast-sort-fields">
              {fieldSuggestions.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <select
              className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-1.5 text-xs"
              value={builder.sortDir}
              onChange={(e) =>
                setBuilder((b) => ({ ...b, sortDir: Number(e.target.value) as 1 | -1 }))
              }
            >
              <option value={-1}>newest first (−1)</option>
              <option value={1}>oldest first (1)</option>
            </select>
          </div>
        </label>
        <label className="space-y-1 text-[11px] text-[var(--color-muted)]">
          Skip
          <input
            type="number"
            min={0}
            className="h-8 w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-2 font-mono text-xs"
            value={builder.skip}
            onChange={(e) =>
              setBuilder((b) => ({ ...b, skip: Math.max(0, Number(e.target.value) || 0) }))
            }
          />
        </label>
        <label className="space-y-1 text-[11px] text-[var(--color-muted)]">
          Limit
          <input
            type="number"
            min={1}
            max={1000}
            className="h-8 w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] px-2 font-mono text-xs"
            value={builder.limit}
            onChange={(e) =>
              setBuilder((b) => ({
                ...b,
                limit: Math.min(1000, Math.max(1, Number(e.target.value) || 50)),
              }))
            }
          />
        </label>
        <Button size="sm" variant="secondary" onClick={onSyncScript}>
          Update script
        </Button>
      </div>
    </div>
  );
}

/** Ensure a collection always has a sensible default script. */
export function ensureDefaultScript(col: string, current: string | undefined): string {
  if (current && current.trim()) return current;
  return defaultFindScript(col);
}
