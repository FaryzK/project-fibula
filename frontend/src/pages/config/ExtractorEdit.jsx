import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import extractorService from '../../services/extractorService';
import PdfPageViewer from '../../components/PdfPageViewer';

// ── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 mt-0.5 w-10 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${checked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
        />
      </button>
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
        {description && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

// ── Drag handle icon ─────────────────────────────────────────────────────────
function GripHandle(props) {
  return (
    <button
      type="button"
      {...props}
      className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 shrink-0 p-0.5 rounded touch-none"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <circle cx="4" cy="3" r="1.2" /><circle cx="10" cy="3" r="1.2" />
        <circle cx="4" cy="7" r="1.2" /><circle cx="10" cy="7" r="1.2" />
        <circle cx="4" cy="11" r="1.2" /><circle cx="10" cy="11" r="1.2" />
      </svg>
    </button>
  );
}

// ── Sortable wrapper used inside DndContext ───────────────────────────────────
function SortableFieldRow({ id, field, onChange, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      <FieldRow field={field} onChange={onChange} onRemove={onRemove} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ── Field row (edit mode) ────────────────────────────────────────────────────
function FieldRow({ field, onChange, onRemove, dragHandleProps }) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
      {dragHandleProps && <GripHandle {...dragHandleProps} />}
      <div className="flex-1 grid grid-cols-2 gap-2">
        <input
          value={field.field_name}
          onChange={(e) => onChange({ ...field, field_name: e.target.value })}
          placeholder="Field name"
          className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
        <input
          value={field.field_description}
          onChange={(e) => onChange({ ...field, field_description: e.target.value })}
          placeholder="Description"
          className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          role="switch"
          aria-checked={field.is_mandatory}
          onClick={() => onChange({ ...field, is_mandatory: !field.is_mandatory })}
          className={`relative w-8 h-4 rounded-full transition-colors focus:outline-none ${field.is_mandatory ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${field.is_mandatory ? 'translate-x-4' : ''}`} />
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">Required</span>
      </div>
      <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-lg leading-none ml-1">×</button>
    </div>
  );
}

// ── Table type section (edit mode) ───────────────────────────────────────────
function TableTypeSection({ tt, onChange, onRemove, sensors }) {
  function addColumn() {
    onChange({ ...tt, columns: [...(tt.columns || []), { column_name: '', column_description: '', is_mandatory: false, _dndId: `col-${Date.now()}` }] });
  }
  function updateCol(idx, col) {
    const cols = [...(tt.columns || [])];
    cols[idx] = col;
    onChange({ ...tt, columns: cols });
  }
  function removeCol(idx) {
    onChange({ ...tt, columns: (tt.columns || []).filter((_, i) => i !== idx) });
  }
  function handleColDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const cols = tt.columns || [];
    const from = cols.findIndex((c) => c._dndId === active.id);
    const to = cols.findIndex((c) => c._dndId === over.id);
    if (from !== -1 && to !== -1) onChange({ ...tt, columns: arrayMove(cols, from, to) });
  }

  const cols = tt.columns || [];
  const colIds = cols.map((c) => c._dndId).filter(Boolean);

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-2">
      <div className="flex gap-2">
        <input
          value={tt.type_name}
          onChange={(e) => onChange({ ...tt, type_name: e.target.value })}
          placeholder="Table type name"
          className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
        <input
          value={tt.type_description}
          onChange={(e) => onChange({ ...tt, type_description: e.target.value })}
          placeholder="Description"
          className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
        <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
      </div>
      <div className="ml-4 space-y-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd}>
          <SortableContext items={colIds} strategy={verticalListSortingStrategy}>
            {cols.map((col, i) => (
              col._dndId ? (
                <SortableFieldRow
                  key={col._dndId}
                  id={col._dndId}
                  field={{ field_name: col.column_name, field_description: col.column_description, is_mandatory: col.is_mandatory, _dndId: col._dndId }}
                  onChange={(upd) => updateCol(i, { column_name: upd.field_name, column_description: upd.field_description, is_mandatory: upd.is_mandatory, _dndId: col._dndId })}
                  onRemove={() => removeCol(i)}
                />
              ) : (
                <FieldRow
                  key={i}
                  field={{ field_name: col.column_name, field_description: col.column_description, is_mandatory: col.is_mandatory }}
                  onChange={(upd) => updateCol(i, { column_name: upd.field_name, column_description: upd.field_description, is_mandatory: upd.is_mandatory })}
                  onRemove={() => removeCol(i)}
                />
              )
            ))}
          </SortableContext>
        </DndContext>
        <button type="button" onClick={addColumn} className="text-xs text-indigo-600 hover:underline">
          + Add column
        </button>
      </div>
    </div>
  );
}

// ── Inline feedback form ─────────────────────────────────────────────────────
function FeedbackInlineForm({ label, onSave, onCancel, saving }) {
  const [text, setText] = useState('');
  return (
    <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
      <p className="text-xs font-medium text-yellow-800 dark:text-yellow-300 mb-1">
        Give feedback for: <span className="font-bold">{label}</span>
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe the correct value or correction (e.g. 'Invoice Number should be INV-2024-001, not INV001')"
        rows={2}
        className="w-full border border-yellow-300 dark:border-yellow-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400"
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => onSave(text)}
          disabled={saving || !text.trim()}
          className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white text-xs rounded transition disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save feedback'}
        </button>
        <button onClick={onCancel} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Held reason badge ────────────────────────────────────────────────────────
function HeldReasonBadge({ reason }) {
  if (reason === 'hold_all') {
    return <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Hold All</span>;
  }
  if (reason === 'missing_mandatory') {
    return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Missing fields</span>;
  }
  return null;
}

// ── Main component ───────────────────────────────────────────────────────────
function ExtractorEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Drag-to-reorder sensors (5px distance threshold prevents accidental drags)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Schema state
  const [name, setName] = useState('');
  const [holdAll, setHoldAll] = useState(false);
  const [headerFields, setHeaderFields] = useState([]);
  const [tableTypes, setTableTypes] = useState([]);
  const [editingSchema, setEditingSchema] = useState(isNew);
  const [schemaSnapshot, setSchemaSnapshot] = useState(null);

  // Data state
  const [usage, setUsage] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [held, setHeld] = useState([]);

  // UI state
  const [activeTab, setActiveTab] = useState('schema');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savingHoldAll, setSavingHoldAll] = useState(false);
  const [error, setError] = useState(null);

  // Test extraction state
  const [testFile, setTestFile] = useState(null);
  const [testFileUrl, setTestFileUrl] = useState(null);
  const [testResult, setTestResult] = useState(null);       // includes document_id, document_file_url
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState(null);
  const [feedbackTarget, setFeedbackTarget] = useState(null);
  const [savingFeedback, setSavingFeedback] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const { extractor, usage: u } = await extractorService.getOne(id);
        setName(extractor.name);
        setHoldAll(extractor.hold_all || false);
        setHeaderFields(extractor.header_fields || []);
        setTableTypes((extractor.table_types || []).map((tt) => ({ ...tt, columns: tt.columns || [] })));
        setUsage(u);
        const [fb, heldDocs] = await Promise.all([
          extractorService.listFeedback(id),
          extractorService.listHeld(id),
        ]);
        setFeedback(fb);
        setHeld(heldDocs);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  // Clean up object URL when test file changes
  useEffect(() => {
    if (!testFile) { setTestFileUrl(null); return; }
    const url = URL.createObjectURL(testFile);
    setTestFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [testFile]);

  function enterEditMode() {
    setSchemaSnapshot({ name, headerFields: JSON.parse(JSON.stringify(headerFields)), tableTypes: JSON.parse(JSON.stringify(tableTypes)) });
    // Assign stable drag IDs so DnD can track items
    let c = 0;
    setHeaderFields((prev) => prev.map((f) => ({ ...f, _dndId: `f-${c++}` })));
    setTableTypes((prev) => prev.map((tt) => ({ ...tt, columns: (tt.columns || []).map((col) => ({ ...col, _dndId: `c-${c++}` })) })));
    setEditingSchema(true);
  }

  function cancelEditMode() {
    if (schemaSnapshot) {
      setName(schemaSnapshot.name);
      setHeaderFields(schemaSnapshot.headerFields);
      setTableTypes(schemaSnapshot.tableTypes);
    }
    setEditingSchema(false);
  }

  function handleFieldDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    setHeaderFields((prev) => {
      const from = prev.findIndex((f) => f._dndId === active.id);
      const to = prev.findIndex((f) => f._dndId === over.id);
      return from !== -1 && to !== -1 ? arrayMove(prev, from, to) : prev;
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Strip internal drag IDs before sending to the API
      const stripDndId = (arr) => arr.map(({ _dndId, ...rest }) => rest);
      const payload = {
        name,
        hold_all: holdAll,
        header_fields: stripDndId(headerFields),
        table_types: tableTypes.map((tt) => ({ ...tt, columns: stripDndId(tt.columns || []) })),
      };
      if (isNew) {
        await extractorService.create(payload);
        navigate('/app?tab=extractors');
      } else {
        await extractorService.update(id, payload);
        setEditingSchema(false);
        setSchemaSnapshot(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleHoldAllToggle(value) {
    setHoldAll(value);
    if (!isNew) {
      setSavingHoldAll(true);
      try {
        await extractorService.update(id, { hold_all: value });
      } catch (err) {
        setHoldAll(!value); // revert on error
        setError(err.message);
      } finally {
        setSavingHoldAll(false);
      }
    }
  }

  async function handleSendOut(heldId) {
    try {
      await extractorService.sendOut(id, heldId);
      setHeld((prev) => prev.filter((d) => d.id !== heldId));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this extractor?')) return;
    try {
      await extractorService.remove(id);
      navigate('/app?tab=extractors');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  async function handleTestExtract() {
    if (!testFile) return;
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    setFeedbackTarget(null);
    try {
      const result = await extractorService.testExtract(id, testFile);
      setTestResult(result);
    } catch (err) {
      setTestError(err.response?.data?.error || err.message);
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveFeedback(targetType, targetId, label, feedbackText) {
    if (!feedbackText.trim()) return;
    setSavingFeedback(true);
    try {
      const payload = {
        target_type: targetType,
        target_id: targetId,
        feedback_text: feedbackText,
        document_description: testResult?.document_description || null,
        document_id: testResult?.document_id || null,
      };
      const newFb = await extractorService.createFeedback(id, payload);
      // Attach document info so the feedback list can show it without a refetch
      if (testResult?.document_file_url) {
        newFb.document_file_url = testResult.document_file_url;
        newFb.document_file_name = testResult.document_file_name;
      }
      setFeedback((prev) => [newFb, ...prev]);
      setFeedbackTarget(null);
    } catch (err) {
      setTestError(err.response?.data?.error || err.message);
    } finally {
      setSavingFeedback(false);
    }
  }

  async function handleDeleteFeedback(feedbackId) {
    try {
      await extractorService.deleteFeedback(id, feedbackId);
      setFeedback((prev) => prev.filter((fb) => fb.id !== feedbackId));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>;

  const tabs = isNew ? [] : [
    { key: 'schema', label: 'Schema' },
    { key: 'training', label: 'Training' },
    { key: 'held', label: `Held Documents${held.length > 0 ? ` (${held.length})` : ''}` },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Back */}
        <button
          onClick={() => navigate('/app?tab=extractors')}
          className="text-sm text-indigo-600 hover:underline mb-6 block"
        >
          ← Back to Extractors
        </button>

        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
          {isNew ? 'New Extractor' : name || 'Extractor'}
        </h1>

        {/* Tabs (only for existing extractors) */}
        {!isNew && (
          <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium transition rounded-t-lg border-b-2 -mb-px ${
                  activeTab === tab.key
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* ── TAB 1: Schema ──────────────────────────────────────────────── */}
        {(isNew || activeTab === 'schema') && (
          <>
          <form onSubmit={handleSave} className="space-y-4">
            {/* Edit schema button (view mode, top-right) */}
            {!isNew && !editingSchema && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={enterEditMode}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-800 dark:hover:bg-indigo-900/20 rounded-lg transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                  Edit schema
                </button>
              </div>
            )}

            {/* Name — shown as input only when editing (existing) or always for new */}
            {(isNew || editingSchema) && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Invoice Extractor"
                  required
                />
              </div>
            )}

            {/* Header Fields */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Header Fields</h2>
                {editingSchema && (
                  <button type="button" onClick={() => setHeaderFields((prev) => [...prev, { field_name: '', field_description: '', is_mandatory: false, _dndId: `f-new-${Date.now()}` }])} className="text-xs text-indigo-600 hover:underline">
                    + Add field
                  </button>
                )}
              </div>

              {editingSchema ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd}>
                  <SortableContext items={headerFields.map((f) => f._dndId).filter(Boolean)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {headerFields.map((f, i) => (
                        f._dndId ? (
                          <SortableFieldRow
                            key={f._dndId}
                            id={f._dndId}
                            field={f}
                            onChange={(upd) => setHeaderFields((prev) => prev.map((x, j) => (j === i ? upd : x)))}
                            onRemove={() => setHeaderFields((prev) => prev.filter((_, j) => j !== i))}
                          />
                        ) : (
                          <FieldRow
                            key={i}
                            field={f}
                            onChange={(upd) => setHeaderFields((prev) => prev.map((x, j) => (j === i ? upd : x)))}
                            onRemove={() => setHeaderFields((prev) => prev.filter((_, j) => j !== i))}
                          />
                        )
                      ))}
                      {headerFields.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">No header fields yet.</p>}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="space-y-2">
                  {headerFields.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">No header fields defined.</p>
                  ) : (
                    headerFields.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <span className="font-medium text-gray-800 dark:text-gray-200 w-40 shrink-0">{f.field_name}</span>
                        <span className="text-gray-500 dark:text-gray-400 flex-1 text-xs">{f.field_description}</span>
                        {f.is_mandatory && (
                          <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded">Required</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Table Types */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Table Types</h2>
                {editingSchema && (
                  <button type="button" onClick={() => setTableTypes((prev) => [...prev, { type_name: '', type_description: '', columns: [] }])} className="text-xs text-indigo-600 hover:underline">
                    + Add table type
                  </button>
                )}
              </div>

              {editingSchema ? (
                <div className="space-y-3">
                  {tableTypes.map((tt, i) => (
                    <TableTypeSection
                      key={i}
                      tt={tt}
                      onChange={(upd) => setTableTypes((prev) => prev.map((x, j) => (j === i ? upd : x)))}
                      onRemove={() => setTableTypes((prev) => prev.filter((_, j) => j !== i))}
                      sensors={sensors}
                    />
                  ))}
                  {tableTypes.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">No table types yet.</p>}
                </div>
              ) : (
                <div className="space-y-3">
                  {tableTypes.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">No table types defined.</p>
                  ) : (
                    tableTypes.map((tt, i) => (
                      <div key={i} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{tt.type_name}</span>
                          {tt.type_description && <span className="text-xs text-gray-400 dark:text-gray-500">— {tt.type_description}</span>}
                        </div>
                        {(tt.columns || []).length > 0 && (
                          <div className="ml-3 space-y-1">
                            {tt.columns.map((col, j) => (
                              <div key={j} className="flex items-center gap-3 text-xs py-1">
                                <span className="font-medium text-gray-700 dark:text-gray-300 w-32 shrink-0">{col.column_name}</span>
                                <span className="text-gray-500 dark:text-gray-400 flex-1">{col.column_description}</span>
                                {col.is_mandatory && (
                                  <span className="px-1.5 py-0.5 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded">Required</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Save/Cancel (edit mode) or Create (new) */}
            {(isNew || editingSchema) && (
              <div className="flex gap-3">
                <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50">
                  {saving ? (isNew ? 'Creating…' : 'Saving…') : (isNew ? 'Create extractor' : 'Save schema')}
                </button>
                {!isNew && (
                  <button type="button" onClick={cancelEditMode} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
                    Cancel
                  </button>
                )}
              </div>
            )}
          </form>

          {/* Delete — below the schema, only for existing extractors */}
          {!isNew && (
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:underline transition"
              >
                Delete extractor
              </button>
            </div>
          )}
          </>
        )}

        {/* ── TAB 2: Training ────────────────────────────────────────────── */}
        {!isNew && activeTab === 'training' && (
          <div className="space-y-6">
            {/* Test extraction panel */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Test Extraction</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Upload a document to test how this extractor performs. Click on any extracted field to give a correction.
              </p>

              <div className="flex items-center gap-3 mb-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    setTestFile(e.target.files[0] || null);
                    setTestResult(null);
                    setFeedbackTarget(null);
                    setTestError(null);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  {testFile ? testFile.name : 'Choose file…'}
                </button>
                <button
                  type="button"
                  onClick={handleTestExtract}
                  disabled={!testFile || testing}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                >
                  {testing ? 'Extracting…' : 'Run Extraction'}
                </button>
                {testFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setTestFile(null);
                      setTestResult(null);
                      setFeedbackTarget(null);
                      setTestError(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Clear
                  </button>
                )}
              </div>

              {testError && <p className="text-red-500 text-xs mb-3">{testError}</p>}

              {/* Split layout: document preview + results */}
              {testFile && testFileUrl && (
                <div className={`${testResult ? 'grid grid-cols-2 gap-4' : ''}`}>
                  {/* Document preview */}
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-700">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 px-3 py-2 border-b border-gray-200 dark:border-gray-600">Document</p>
                    {testFile.type === 'application/pdf' ? (
                      <PdfPageViewer file={testFile} />
                    ) : (
                      <img
                        src={testFileUrl}
                        alt="Document preview"
                        className="w-full object-contain max-h-[600px]"
                      />
                    )}
                  </div>

                  {/* Extraction results */}
                  {testResult && (
                    <div className="space-y-4 min-w-0">
                      {testResult.feedback_used && testResult.feedback_used.length > 0 && (
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3">
                          <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">
                            Training feedback applied ({testResult.feedback_used.length}):
                          </p>
                          <ul className="space-y-1.5">
                            {testResult.feedback_used.map((fb, i) => {
                              const text = typeof fb === 'string' ? fb : fb.feedback_text;
                              const docUrl = typeof fb === 'object' ? fb.document_file_url : null;
                              const docName = typeof fb === 'object' ? fb.document_file_name : null;
                              return (
                                <li key={i} className="text-xs text-green-700 dark:text-green-400 flex items-start gap-1.5">
                                  <span className="shrink-0 mt-0.5">•</span>
                                  <span className="flex-1">{text}</span>
                                  {docUrl && (
                                    <a href={docUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-green-600 dark:text-green-500 hover:underline whitespace-nowrap">
                                      [{docName || 'doc'} ↗]
                                    </a>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}

                      {headerFields.length > 0 && (
                        <div>
                          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Header Fields</h3>
                          <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                  <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300 w-1/3">Field</th>
                                  <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Value</th>
                                  <th className="px-3 py-2 w-24"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {headerFields.map((hf) => {
                                  const value = testResult.header[hf.field_name];
                                  const targetId = hf.id || hf.field_name;
                                  const isActive = feedbackTarget?.targetId === targetId && feedbackTarget?.targetType === 'header_field';
                                  return (
                                    <tr key={hf.field_name} className="border-t border-gray-100 dark:border-gray-700">
                                      <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                                        {hf.field_name}
                                        {hf.is_mandatory && <span className="ml-1 text-red-400">*</span>}
                                      </td>
                                      <td className="px-3 py-2 text-gray-900 dark:text-white">
                                        {value === null || value === undefined || value === ''
                                          ? <span className="text-gray-400 italic">—</span>
                                          : String(value)}
                                        {isActive && (
                                          <FeedbackInlineForm
                                            label={hf.field_name}
                                            saving={savingFeedback}
                                            onSave={(text) => handleSaveFeedback('header_field', targetId, hf.field_name, text)}
                                            onCancel={() => setFeedbackTarget(null)}
                                          />
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <button
                                          onClick={() => setFeedbackTarget(isActive ? null : { targetType: 'header_field', targetId, label: hf.field_name })}
                                          className="text-xs text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-200"
                                        >
                                          {isActive ? 'Cancel' : 'Feedback'}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {headerFields.length === 0 && tableTypes.length === 0 && (
                        <p className="text-xs text-gray-400 italic">No fields defined in the schema.</p>
                      )}

                      {tableTypes.map((tt) => {
                        const tableName = tt.type_name;
                        const rows = testResult.tables[tableName] || [];
                        const columns = tt.columns.length > 0
                          ? tt.columns.map((c) => c.column_name)
                          : (rows.length > 0 ? Object.keys(rows[0]) : []);
                        return (
                          <div key={tableName}>
                            <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">{tableName}</h3>
                            {rows.length === 0 ? (
                              <p className="text-xs text-gray-400 italic">No rows extracted.</p>
                            ) : (
                              <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                      {columns.map((col) => (
                                        <th key={col} className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">{col}</th>
                                      ))}
                                      <th className="px-3 py-2 w-20"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row, rowIdx) => {
                                      const isActive = feedbackTarget?.targetId === `row-${tableName}-${rowIdx}` && feedbackTarget?.targetType === 'table_column';
                                      return (
                                        <tr key={rowIdx} className="border-t border-gray-100 dark:border-gray-700">
                                          {columns.map((col) => (
                                            <td key={col} className="px-3 py-2 text-gray-900 dark:text-white whitespace-nowrap">
                                              {row[col] === null || row[col] === undefined
                                                ? <span className="text-gray-400 italic">—</span>
                                                : String(row[col])}
                                            </td>
                                          ))}
                                          <td className="px-3 py-2 text-right">
                                            <button
                                              onClick={() => setFeedbackTarget(isActive ? null : { targetType: 'table_column', targetId: `row-${tableName}-${rowIdx}`, label: `${tableName} row ${rowIdx + 1}` })}
                                              className="text-xs text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-200 whitespace-nowrap"
                                            >
                                              {isActive ? 'Cancel' : 'Feedback'}
                                            </button>
                                            {isActive && (
                                              <FeedbackInlineForm
                                                label={`${tableName} row ${rowIdx + 1}`}
                                                saving={savingFeedback}
                                                onSave={(text) => handleSaveFeedback('table_column', `row-${tableName}-${rowIdx}`, `${tableName} row ${rowIdx + 1}`, text)}
                                                onCancel={() => setFeedbackTarget(null)}
                                              />
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Training feedback history — grouped by document */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Training Feedback {feedback.length > 0 && `(${feedback.length})`}
              </h2>
              {feedback.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  No training feedback yet. Run a test extraction and click &ldquo;Feedback&rdquo; on any field.
                </p>
              ) : (() => {
                // Group feedback by document_id (null = no document)
                const groups = [];
                const seen = new Map();
                for (const fb of feedback) {
                  const key = fb.document_id || '__none__';
                  if (!seen.has(key)) {
                    seen.set(key, { document_id: fb.document_id, document_file_url: fb.document_file_url, document_file_name: fb.document_file_name, items: [] });
                    groups.push(seen.get(key));
                  }
                  seen.get(key).items.push(fb);
                }
                return (
                  <div className="space-y-5">
                    {groups.map((group) => (
                      <div key={group.document_id || '__none__'}>
                        {/* Document header */}
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                          {group.document_file_url ? (
                            <>
                              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{group.document_file_name || 'Document'}</span>
                              <a href={group.document_file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400 shrink-0">
                                View ↗
                              </a>
                            </>
                          ) : (
                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 italic">No document</span>
                          )}
                          <span className="ml-auto text-xs text-gray-400">{group.items.length} {group.items.length === 1 ? 'correction' : 'corrections'}</span>
                        </div>
                        {/* Feedback items for this document */}
                        <ul className="space-y-2">
                          {group.items.map((fb) => (
                            <li key={fb.id} className="flex items-start gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                                    fb.image_embedding
                                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                      : 'bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-400'
                                  }`}>
                                    {fb.image_embedding ? 'embedded' : 'no embedding'}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{fb.target_type}</span>
                                </div>
                                <p className="text-xs text-gray-700 dark:text-gray-300">{fb.feedback_text}</p>
                              </div>
                              <button
                                onClick={() => handleDeleteFeedback(fb.id)}
                                className="shrink-0 text-gray-400 hover:text-red-500 dark:hover:text-red-400 text-lg leading-none ml-1"
                                title="Delete feedback"
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── TAB 3: Held Documents ──────────────────────────────────────── */}
        {!isNew && activeTab === 'held' && (
          <div className="space-y-6">
            {/* Hold All toggle */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Settings</h2>
              <Toggle
                checked={holdAll}
                onChange={handleHoldAllToggle}
                label="Hold all documents for manual review"
                description="When enabled, every document processed by this extractor will be held for manual review before continuing through the workflow."
              />
              {savingHoldAll && <p className="text-xs text-gray-400 mt-2">Saving…</p>}
            </div>

            {/* Held documents list */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Held Documents {held.length > 0 && `(${held.length})`}
              </h2>
              {held.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">No documents are currently held.</p>
              ) : (
                <ul className="space-y-3">
                  {held.map((doc) => (
                    <li key={doc.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{doc.file_name}</p>
                          <HeldReasonBadge reason={doc.held_reason} />
                        </div>
                        <button
                          onClick={() => handleSendOut(doc.id)}
                          className="shrink-0 text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition ml-3"
                        >
                          Send out
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                        Held at {new Date(doc.held_at).toLocaleString()}
                      </p>
                      {doc.metadata && (
                        <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
                          {doc.metadata.header && Object.keys(doc.metadata.header).length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Extracted header:</p>
                              <div className="grid grid-cols-2 gap-1">
                                {Object.entries(doc.metadata.header).map(([k, v]) => (
                                  <div key={k} className="text-xs">
                                    <span className="text-gray-500 dark:text-gray-400">{k}: </span>
                                    <span className="text-gray-800 dark:text-gray-200">{v === null || v === undefined ? '—' : String(v)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {doc.metadata.tables && Object.keys(doc.metadata.tables).length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Extracted tables:</p>
                              {Object.entries(doc.metadata.tables).map(([tName, rows]) => (
                                <p key={tName} className="text-xs text-gray-500 dark:text-gray-400 italic">
                                  {tName} ({Array.isArray(rows) ? rows.length : 0} rows)
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Usage */}
            {usage.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Used in workflows</h2>
                <ul className="space-y-1">
                  {usage.map((u) => (
                    <li key={u.node_id} className="text-xs">
                      <button
                        onClick={() => navigate(`/app/workflow/${u.workflow_id}?node=${u.node_id}`)}
                        className="text-indigo-600 hover:underline"
                      >
                        {u.workflow_name} → {u.node_name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ExtractorEdit;
