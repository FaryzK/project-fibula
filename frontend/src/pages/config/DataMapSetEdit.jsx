import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dataMapperService from '../../services/dataMapperService';

function DataMapSetEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [headers, setHeaders] = useState(['']);
  const [records, setRecords] = useState([{}]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const set = await dataMapperService.getSet(id);
        setName(set.name);
        const hdrs = Array.isArray(set.headers)
          ? set.headers
          : typeof set.headers === 'string'
          ? JSON.parse(set.headers)
          : [];
        setHeaders(hdrs.length > 0 ? hdrs : ['']);
        const recs = (set.records || []).map((r) =>
          typeof r.values === 'string' ? JSON.parse(r.values) : r.values || r
        );
        setRecords(recs.length > 0 ? recs : [{}]);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  function handleHeaderChange(i, val) {
    const updated = [...headers];
    updated[i] = val;
    setHeaders(updated);
    // Sync records keys when header changes
    setRecords((prev) =>
      prev.map((rec) => {
        const newRec = {};
        updated.forEach((h) => { newRec[h] = rec[h] || ''; });
        return newRec;
      })
    );
  }

  function addHeader() {
    setHeaders((prev) => [...prev, '']);
  }

  function removeHeader(i) {
    const newHeaders = headers.filter((_, j) => j !== i);
    setHeaders(newHeaders);
    setRecords((prev) =>
      prev.map((rec) => {
        const newRec = {};
        newHeaders.forEach((h) => { newRec[h] = rec[h] || ''; });
        return newRec;
      })
    );
  }

  function addRecord() {
    const newRec = {};
    headers.forEach((h) => { newRec[h] = ''; });
    setRecords((prev) => [...prev, newRec]);
  }

  function updateCell(rowIdx, col, val) {
    setRecords((prev) => prev.map((r, i) => (i === rowIdx ? { ...r, [col]: val } : r)));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const cleanHeaders = headers.filter((h) => h.trim());
      const payload = { name, headers: cleanHeaders, records };
      if (isNew) {
        await dataMapperService.createSet(payload);
        navigate('/app?tab=dataMapper');
      } else {
        await dataMapperService.updateSet(id, payload);
        navigate('/app?tab=dataMapper');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this data map set?')) return;
    try {
      await dataMapperService.removeSet(id);
      navigate('/app?tab=dataMapper');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/app?tab=dataMapper')}
          className="text-sm text-indigo-600 hover:underline mb-6 block"
        >
          ← Back to Data Mapper
        </button>

        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
          {isNew ? 'New Data Map Set' : 'Edit Data Map Set'}
        </h1>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Vendor Master Data"
              required
            />
          </div>

          {/* Headers */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Column Headers</h2>
              <button type="button" onClick={addHeader} className="text-xs text-indigo-600 hover:underline">+ Add column</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    value={h}
                    onChange={(e) => handleHeaderChange(i, e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-32"
                    placeholder={`Column ${i + 1}`}
                  />
                  {headers.length > 1 && (
                    <button onClick={() => removeHeader(i)} className="text-red-400 hover:text-red-600 text-sm">×</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Records Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Records</h2>
              <button type="button" onClick={addRecord} className="text-xs text-indigo-600 hover:underline">+ Add row</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    {headers.filter((h) => h.trim()).map((h) => (
                      <th key={h} className="text-left px-2 py-1 font-medium text-gray-500 dark:text-gray-400">{h}</th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec, ri) => (
                    <tr key={ri} className="border-b border-gray-100 dark:border-gray-700">
                      {headers.filter((h) => h.trim()).map((h) => (
                        <td key={h} className="px-2 py-1">
                          <input
                            value={rec[h] || ''}
                            onChange={(e) => updateCell(ri, h, e.target.value)}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </td>
                      ))}
                      <td className="px-1 text-center">
                        <button
                          type="button"
                          onClick={() => setRecords((prev) => prev.filter((_, i) => i !== ri))}
                          className="text-red-400 hover:text-red-600"
                        >×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
      </div>
    </div>
  );
}

export default DataMapSetEdit;
