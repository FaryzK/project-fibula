import { useEffect, useState } from 'react';
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

function ExtractorEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

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
                <li key={fb.id} className="text-xs bg-gray-50 dark:bg-gray-700 rounded p-2">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{fb.target_type}</span>
                  {' — '}
                  <span className="text-gray-500 dark:text-gray-400">{fb.feedback_text}</span>
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
            <ul className="space-y-2">
              {held.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2"
                >
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
