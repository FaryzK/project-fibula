import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import extractorService from '../../services/extractorService';

function FieldRow({ field, onChange, onRemove }) {
  return (
    <div className="flex items-start gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
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
      <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1 shrink-0">
        <input
          type="checkbox"
          checked={field.is_mandatory}
          onChange={(e) => onChange({ ...field, is_mandatory: e.target.checked })}
        />
        Mandatory
      </label>
      <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-lg leading-none ml-1">×</button>
    </div>
  );
}

function TableTypeSection({ tt, onChange, onRemove }) {
  function addColumn() {
    onChange({ ...tt, columns: [...(tt.columns || []), { column_name: '', column_description: '', is_mandatory: false }] });
  }
  function updateCol(idx, col) {
    const cols = [...(tt.columns || [])];
    cols[idx] = col;
    onChange({ ...tt, columns: cols });
  }
  function removeCol(idx) {
    onChange({ ...tt, columns: (tt.columns || []).filter((_, i) => i !== idx) });
  }

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
        {(tt.columns || []).map((col, i) => (
          <FieldRow
            key={i}
            field={{ field_name: col.column_name, field_description: col.column_description, is_mandatory: col.is_mandatory }}
            onChange={(upd) => updateCol(i, { column_name: upd.field_name, column_description: upd.field_description, is_mandatory: upd.is_mandatory })}
            onRemove={() => removeCol(i)}
          />
        ))}
        <button
          type="button"
          onClick={addColumn}
          className="text-xs text-indigo-600 hover:underline"
        >
          + Add column
        </button>
      </div>
    </div>
  );
}

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
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ExtractorEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [name, setName] = useState('');
  const [holdAll, setHoldAll] = useState(false);
  const [headerFields, setHeaderFields] = useState([]);
  const [tableTypes, setTableTypes] = useState([]);
  const [usage, setUsage] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [held, setHeld] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Test extraction state
  const [testFile, setTestFile] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState(null);
  const [feedbackTarget, setFeedbackTarget] = useState(null); // { type, targetId, label }
  const [savingFeedback, setSavingFeedback] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const { extractor, usage: u } = await extractorService.getOne(id);
        setName(extractor.name);
        setHoldAll(extractor.hold_all || false);
        setHeaderFields(extractor.header_fields || []);
        setTableTypes((extractor.table_types || []).map((tt) => ({
          ...tt,
          columns: tt.columns || [],
        })));
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

  function addHeaderField() {
    setHeaderFields((prev) => [...prev, { field_name: '', field_description: '', is_mandatory: false }]);
  }

  function addTableType() {
    setTableTypes((prev) => [...prev, { type_name: '', type_description: '', columns: [] }]);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        hold_all: holdAll,
        header_fields: headerFields,
        table_types: tableTypes,
      };
      if (isNew) {
        await extractorService.create(payload);
        navigate('/app?tab=extractors');
      } else {
        await extractorService.update(id, payload);
        navigate('/app?tab=extractors');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
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
      };
      const newFb = await extractorService.createFeedback(id, payload);
      setFeedback((prev) => [newFb, ...prev]);
      setFeedbackTarget(null);
    } catch (err) {
      setTestError(err.response?.data?.error || err.message);
    } finally {
      setSavingFeedback(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/app?tab=extractors')}
          className="text-sm text-indigo-600 hover:underline mb-6 block"
        >
          ← Back to Extractors
        </button>

        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
          {isNew ? 'New Extractor' : 'Edit Extractor'}
        </h1>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Name + Hold All */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Invoice Extractor"
              required
            />
            <label className="flex items-center gap-2 mt-3 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={holdAll} onChange={(e) => setHoldAll(e.target.checked)} />
              Hold all documents for manual review
            </label>
          </div>

          {/* Header Fields */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Header Fields</h2>
              <button type="button" onClick={addHeaderField} className="text-xs text-indigo-600 hover:underline">
                + Add field
              </button>
            </div>
            <div className="space-y-2">
              {headerFields.map((f, i) => (
                <FieldRow
                  key={i}
                  field={f}
                  onChange={(upd) => setHeaderFields((prev) => prev.map((x, j) => (j === i ? upd : x)))}
                  onRemove={() => setHeaderFields((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
              {headerFields.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">No header fields yet.</p>
              )}
            </div>
          </div>

          {/* Table Types */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Table Types</h2>
              <button type="button" onClick={addTableType} className="text-xs text-indigo-600 hover:underline">
                + Add table type
              </button>
            </div>
            <div className="space-y-3">
              {tableTypes.map((tt, i) => (
                <TableTypeSection
                  key={i}
                  tt={tt}
                  onChange={(upd) => setTableTypes((prev) => prev.map((x, j) => (j === i ? upd : x)))}
                  onRemove={() => setTableTypes((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
              {tableTypes.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">No table types yet.</p>
              )}
            </div>
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {!isNew && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg border border-red-200 transition"
              >
                Delete
              </button>
            )}
          </div>
        </form>

        {/* Test Extraction */}
        {!isNew && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mt-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Test Extraction</h2>
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
                  onClick={() => { setTestFile(null); setTestResult(null); setFeedbackTarget(null); setTestError(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear
                </button>
              )}
            </div>

            {testError && (
              <p className="text-red-500 text-xs mb-3">{testError}</p>
            )}

            {testResult && (
              <div className="space-y-4">
                {/* Feedback applied */}
                {testResult.feedback_used && testResult.feedback_used.length > 0 && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3">
                    <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-1">
                      Training feedback applied ({testResult.feedback_used.length}):
                    </p>
                    <ul className="space-y-1">
                      {testResult.feedback_used.map((fb, i) => (
                        <li key={i} className="text-xs text-green-700 dark:text-green-400">• {fb}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Header fields results — always show if schema has fields */}
                {headerFields.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Header Fields</h3>
                    <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300 w-1/3">Field</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Extracted value</th>
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
                                  {value === null || value === undefined || value === '' ? (
                                    <span className="text-gray-400 italic">—</span>
                                  ) : String(value)}
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
                                    {isActive ? 'Cancel' : 'Give feedback'}
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

                {/* No schema defined */}
                {headerFields.length === 0 && tableTypes.length === 0 && (
                  <p className="text-xs text-gray-400 italic">
                    No fields defined in the schema. Add header fields or table types above, then save before testing.
                  </p>
                )}

                {/* Table results */}
                {/* Table results — iterate schema table types so we always show defined tables */}
                {tableTypes.map((tt) => {
                  const tableName = tt.type_name;
                  const rows = testResult.tables[tableName] || [];
                  const columns = tt.columns.length > 0 ? tt.columns.map((c) => c.column_name) : (rows.length > 0 ? Object.keys(rows[0]) : []);
                  return (
                    <div key={tableName}>
                      <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                        {tableName}
                      </h3>
                      {rows.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No rows extracted.</p>
                      ) : (
                        <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                              <tr>
                                {columns.map((col) => (
                                  <th key={col} className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                    {col}
                                  </th>
                                ))}
                                <th className="px-3 py-2 w-20"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, rowIdx) => {
                                const ttCol = tt?.columns?.[0];
                                const targetId = ttCol?.id || `${tableName}-${rowIdx}`;
                                const isActive = feedbackTarget?.targetId === `row-${tableName}-${rowIdx}` && feedbackTarget?.targetType === 'table_column';
                                return (
                                  <tr key={rowIdx} className="border-t border-gray-100 dark:border-gray-700">
                                    {columns.map((col) => (
                                      <td key={col} className="px-3 py-2 text-gray-900 dark:text-white whitespace-nowrap">
                                        {row[col] === null || row[col] === undefined ? (
                                          <span className="text-gray-400 italic">—</span>
                                        ) : String(row[col])}
                                      </td>
                                    ))}
                                    <td className="px-3 py-2 text-right">
                                      <button
                                        onClick={() => setFeedbackTarget(isActive ? null : { targetType: 'table_column', targetId: `row-${tableName}-${rowIdx}`, label: `${tableName} row ${rowIdx + 1}` })}
                                        className="text-xs text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-200 whitespace-nowrap"
                                      >
                                        {isActive ? 'Cancel' : 'Give feedback'}
                                      </button>
                                      {isActive && (
                                        <div className="absolute">
                                          <FeedbackInlineForm
                                            label={`${tableName} row ${rowIdx + 1}`}
                                            saving={savingFeedback}
                                            onSave={(text) => handleSaveFeedback('table_column', targetId, `${tableName} row ${rowIdx + 1}`, text)}
                                            onCancel={() => setFeedbackTarget(null)}
                                          />
                                        </div>
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

        {/* Usage */}
        {!isNew && usage.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mt-6">
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

        {/* Training Feedback */}
        {!isNew && feedback.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mt-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Training Feedback ({feedback.length})
            </h2>
            <ul className="space-y-2">
              {feedback.map((fb) => (
                <li key={fb.id} className="text-xs bg-gray-50 dark:bg-gray-700 rounded p-2 flex items-start gap-2">
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${fb.image_embedding ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-200 text-gray-500 dark:bg-gray-600 dark:text-gray-400'}`}>
                    {fb.image_embedding ? 'embedded' : 'no embedding'}
                  </span>
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{fb.target_type}</span>
                    {' — '}
                    <span className="text-gray-500 dark:text-gray-400">{fb.feedback_text}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Held Documents */}
        {!isNew && held.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mt-6">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Held Documents ({held.length})
            </h2>
            <ul className="space-y-3">
              {held.map((doc) => (
                <li key={doc.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{doc.file_name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Held at {new Date(doc.held_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleSendOut(doc.id)}
                      className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
                    >
                      Send out
                    </button>
                  </div>
                  {/* Extracted metadata */}
                  {doc.metadata && (
                    <div className="mt-2 border-t border-gray-200 dark:border-gray-600 pt-2">
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
                            <div key={tName} className="mb-1">
                              <p className="text-xs text-gray-500 dark:text-gray-400 italic">{tName} ({Array.isArray(rows) ? rows.length : 0} rows)</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExtractorEdit;
