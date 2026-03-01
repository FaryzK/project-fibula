import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dataMapperService from '../../services/dataMapperService';

const DATA_TYPES = ['string', 'number', 'boolean', 'date', 'currency'];
const PAGE_SIZES = [25, 50, 100];

const typeBadgeCls = {
  string: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  number: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  boolean: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  date: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  currency: 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300',
};

function DataMapSetEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  // ── New-set upload flow state ──
  const [step, setStep] = useState(1); // 1=upload, 2=configure types
  const [uploadFile, setUploadFile] = useState(null);
  const [parsedHeaders, setParsedHeaders] = useState([]); // [{name, data_type}]
  const [parsedPreview, setParsedPreview] = useState([]); // first N rows for preview
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // ── Existing-set state ──
  const [set, setSet] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('view'); // 'view' | 'edit'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState({});
  const [editingCell, setEditingCell] = useState(null); // {recordId, column}
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameEdit, setNameEdit] = useState('');
  const [usage, setUsage] = useState([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterColumn, setFilterColumn] = useState('');
  const [filterMode, setFilterMode] = useState('exact');
  const bulkFileRef = useRef(null);
  const filterRef = useRef(null);

  // ── Parse headers from uploaded file (client-side preview) ──
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        const isJson = file.type === 'application/json' || file.name.endsWith('.json');

        if (isJson) {
          const data = JSON.parse(text);
          if (!Array.isArray(data) || data.length === 0) throw new Error('JSON must be a non-empty array');
          const headers = Object.keys(data[0]).map((n) => ({ name: n, data_type: 'string' }));
          setParsedHeaders(headers);
          setParsedPreview(data.slice(0, 5));
        } else {
          // CSV: split first 6 lines (header + 5 preview rows)
          const lines = text.split('\n').filter((l) => l.trim());
          if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');
          const headerNames = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
          setParsedHeaders(headerNames.map((n) => ({ name: n, data_type: 'string' })));
          const preview = [];
          for (let i = 1; i < Math.min(lines.length, 6); i++) {
            const vals = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
            const row = {};
            headerNames.forEach((h, j) => { row[h] = vals[j] || ''; });
            preview.push(row);
          }
          setParsedPreview(preview);
        }
        setStep(2);
      } catch (err) {
        setUploadError(err.message);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleTypeChange = useCallback((idx, newType) => {
    setParsedHeaders((prev) => prev.map((h, i) => i === idx ? { ...h, data_type: newType } : h));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!name.trim()) { setUploadError('Name is required'); return; }
    setCreating(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('name', name);
      formData.append('headers', JSON.stringify(parsedHeaders));
      const result = await dataMapperService.createSetFromUpload(formData);
      navigate(`/app/data-map-sets/${result.id}`);
    } catch (err) {
      setUploadError(err.response?.data?.error || err.message);
    } finally {
      setCreating(false);
    }
  }, [name, uploadFile, parsedHeaders, navigate]);

  // ── Load existing set ──
  const loadSet = useCallback(async () => {
    try {
      const data = await dataMapperService.getSet(id, { page, pageSize, filters });
      setSet(data);
      setNameEdit(data.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, page, pageSize, filters]);

  useEffect(() => {
    if (!isNew) loadSet();
  }, [isNew, loadSet]);

  useEffect(() => {
    if (!isNew && id) {
      dataMapperService.getSetUsage(id).then(setUsage).catch(() => {});
    }
  }, [isNew, id]);

  // ── Click-outside to close filter panel ──
  useEffect(() => {
    function handler(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Helpers ──
  const headers = set
    ? (typeof set.headers === 'string' ? JSON.parse(set.headers) : set.headers || [])
    : [];
  const headerNames = headers.map((h) => typeof h === 'object' ? h.name : h);

  const getHeaderType = (colName) => {
    const h = headers.find((hdr) => (typeof hdr === 'object' ? hdr.name : hdr) === colName);
    return typeof h === 'object' ? h.data_type : 'string';
  };

  const parseRecordValues = (rec) => {
    if (!rec) return {};
    return typeof rec.values === 'string' ? JSON.parse(rec.values) : rec.values || rec;
  };

  // ── Cell editing ──
  const startEdit = (recordId, column, currentValue) => {
    setEditingCell({ recordId, column });
    setEditValue(currentValue ?? '');
  };

  const saveEdit = async () => {
    if (!editingCell) return;
    setSaving(true);
    try {
      const rec = set.records.find((r) => r.id === editingCell.recordId);
      const vals = parseRecordValues(rec);
      vals[editingCell.column] = editValue;
      await dataMapperService.updateRecord(id, editingCell.recordId, vals);
      setEditingCell(null);
      loadSet();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => { setEditingCell(null); };

  // ── Row operations ──
  const addRow = async () => {
    const empty = {};
    headerNames.forEach((h) => { empty[h] = ''; });
    try {
      await dataMapperService.addRecordsJson(id, [empty]);
      loadSet();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const deleteRow = async (recordId) => {
    try {
      await dataMapperService.removeRecord(id, recordId);
      loadSet();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await dataMapperService.addRecords(id, formData);
      setError(null);
      if (result.validationErrors?.length > 0) {
        setError(`${result.added} rows added, ${result.validationErrors.length} errors, ${result.duplicatesRemoved} duplicates removed`);
      }
      loadSet();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    e.target.value = '';
  };

  const handleDownload = () => {
    const safeName = (set?.name || 'data-map-set').replace(/[^a-zA-Z0-9_-]/g, '_') + '.csv';
    dataMapperService.downloadSet(id, safeName);
  };

  const handleSaveName = async () => {
    if (nameEdit === set.name) return;
    setSaving(true);
    try {
      await dataMapperService.updateSet(id, { name: nameEdit });
      loadSet();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this data map set?')) return;
    try {
      await dataMapperService.removeSet(id);
      navigate('/app?tab=data-mapper');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  // ── Filter update ──
  const updateFilter = (col, key, value) => {
    setFilters((prev) => {
      const updated = { ...prev };
      if (!updated[col]) updated[col] = {};
      if (value === '' || value === undefined || value === null) {
        delete updated[col][key];
        if (Object.keys(updated[col]).length === 0) delete updated[col];
      } else {
        updated[col][key] = value;
      }
      return updated;
    });
    setPage(1);
  };

  // ── Filter helpers ──
  const clearColumnFilter = (col) => {
    setFilters((prev) => {
      const updated = { ...prev };
      delete updated[col];
      return updated;
    });
    setPage(1);
  };

  const toggleFilterPanel = () => {
    setFilterOpen((v) => {
      if (!v) {
        const unfiltered = headerNames.find((h) => !filters[h]);
        const col = unfiltered || headerNames[0] || '';
        setFilterColumn(col);
        // Sync filterMode to existing filter shape
        syncFilterMode(col);
      }
      return !v;
    });
  };

  const syncFilterMode = (col) => {
    if (!col) { setFilterMode('exact'); return; }
    const dt = getHeaderType(col);
    const existing = filters[col];
    if (!existing) { setFilterMode('exact'); return; }
    if (dt === 'number') {
      setFilterMode(existing.min !== undefined && existing.max !== undefined && existing.min !== existing.max ? 'range' : 'exact');
    } else if (dt === 'date') {
      setFilterMode(existing.from && existing.to && existing.from !== existing.to ? 'range' : 'exact');
    } else {
      setFilterMode('exact');
    }
  };

  const describeFilter = (col, type, filterObj) => {
    if (type === 'string' || type === 'currency') return `${col}: "${filterObj.search}"`;
    if (type === 'boolean') return `${col}: ${filterObj.value}`;
    if (type === 'number') {
      if (filterObj.min !== undefined && filterObj.max !== undefined && filterObj.min === filterObj.max) return `${col} = ${filterObj.min}`;
      const parts = [];
      if (filterObj.min !== undefined) parts.push(`\u2265 ${filterObj.min}`);
      if (filterObj.max !== undefined) parts.push(`\u2264 ${filterObj.max}`);
      return `${col}: ${parts.join(' & ')}`;
    }
    if (type === 'date') {
      if (filterObj.from && filterObj.to && filterObj.from === filterObj.to) return `${col} = ${filterObj.from}`;
      const parts = [];
      if (filterObj.from) parts.push(`from ${filterObj.from}`);
      if (filterObj.to) parts.push(`to ${filterObj.to}`);
      return `${col}: ${parts.join(' ')}`;
    }
    return col;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — NEW SET FLOW
  // ═══════════════════════════════════════════════════════════════════════════
  if (isNew) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate('/app?tab=data-mapper')} className="text-sm text-indigo-600 hover:underline mb-6 block">
            &larr; Back to Data Mapper
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">New Data Map Set</h1>

          {/* Step 1: Upload file */}
          {step === 1 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Upload a CSV or JSON file to create a new data map set.</p>
              <input
                type="file"
                accept=".csv,.json,text/csv,application/json"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 dark:file:bg-indigo-900/40 file:text-indigo-700 dark:file:text-indigo-300 hover:file:bg-indigo-100"
              />
              {uploadError && <p className="text-red-500 text-xs">{uploadError}</p>}
            </div>
          )}

          {/* Step 2: Configure types + name */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Set Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Vendor Master Data"
                  required
                />
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Column Types</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Assign a data type to each column detected from your file.</p>
                <div className="space-y-2">
                  {parsedHeaders.map((h, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300 w-40 truncate">{h.name}</span>
                      <select
                        value={h.data_type}
                        onChange={(e) => handleTypeChange(i, e.target.value)}
                        className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {parsedPreview.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Preview (first {parsedPreview.length} rows)</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-600">
                          {parsedHeaders.map((h) => (
                            <th key={h.name} className="text-left px-2 py-1 font-medium text-gray-500 dark:text-gray-400">{h.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedPreview.map((row, ri) => (
                          <tr key={ri} className="border-b border-gray-100 dark:border-gray-700">
                            {parsedHeaders.map((h) => (
                              <td key={h.name} className="px-2 py-1 text-gray-700 dark:text-gray-300">{String(row[h.name] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {uploadError && <p className="text-red-500 text-xs">{uploadError}</p>}

              <div className="flex gap-3">
                <button onClick={() => { setStep(1); setUploadFile(null); setParsedHeaders([]); setParsedPreview([]); }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:underline">
                  &larr; Back
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Set'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER — EXISTING SET (VIEW / EDIT)
  // ═══════════════════════════════════════════════════════════════════════════
  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading...</div>;
  if (!set) return <div className="p-8 text-red-500 text-sm">Set not found</div>;

  const totalPages = pageSize > 0 ? Math.ceil((set.total || 0) / pageSize) : 1;
  const isReferenced = usage && usage.length > 0;
  const activeFilters = Object.entries(filters).map(([col, f]) => ({ col, type: getHeaderType(col), filterObj: f }));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <button onClick={() => navigate('/app?tab=data-mapper')} className="text-sm text-indigo-600 hover:underline mb-6 block">
          &larr; Back to Data Mapper
        </button>

        {/* Header bar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            {mode === 'edit' ? (
              <input
                value={nameEdit}
                onChange={(e) => setNameEdit(e.target.value)}
                onBlur={handleSaveName}
                className="text-xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-gray-300 dark:border-gray-600 focus:outline-none focus:border-indigo-500 px-1"
              />
            ) : (
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{set.name}</h1>
            )}
            <div className="flex flex-wrap gap-1.5 mt-1">
              {headers.map((h) => {
                const hName = typeof h === 'object' ? h.name : h;
                const hType = typeof h === 'object' ? h.data_type : 'string';
                return (
                  <span key={hName} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${typeBadgeCls[hType] || typeBadgeCls.string}`}>
                    {hName} <span className="opacity-60">{hType}</span>
                  </span>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                mode === 'edit'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
              }`}
            >
              {mode === 'edit' ? 'Editing' : 'Edit'}
            </button>
            <button onClick={handleDownload} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-indigo-400 transition">
              Download CSV
            </button>
            <div className="relative group">
              <button
                onClick={isReferenced ? undefined : handleDelete}
                disabled={isReferenced}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
              {isReferenced && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 hidden group-hover:block z-10">
                  Referenced by: {usage.map((u) => u.rule_name).join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <p className="text-red-500 text-xs mb-4">{error}</p>}

        {/* Data table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            {/* Toolbar row: edit actions + filter */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {mode === 'edit' && (
                <>
                  <button onClick={addRow} className="text-xs text-indigo-600 hover:underline">+ Add row</button>
                  <button onClick={() => bulkFileRef.current?.click()} className="text-xs text-indigo-600 hover:underline">+ Bulk add (CSV/JSON)</button>
                  <input ref={bulkFileRef} type="file" accept=".csv,.json" onChange={handleBulkUpload} className="hidden" />
                  <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />
                </>
              )}

              {/* Filter button + dropdown */}
              {headerNames.length > 0 && (
                <div className="relative" ref={filterRef}>
                  <button
                    onClick={toggleFilterPanel}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                      activeFilters.length > 0
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-600'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    Filter
                    {activeFilters.length > 0 && (
                      <span className="ml-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {activeFilters.length}
                      </span>
                    )}
                  </button>

                  {/* Filter dropdown panel */}
                  {filterOpen && (
                    <div className="absolute z-20 left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 min-w-[280px]">
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Column</label>
                      <select
                        value={filterColumn}
                        onChange={(e) => { setFilterColumn(e.target.value); syncFilterMode(e.target.value); }}
                        className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-3"
                      >
                        {headerNames.map((h) => (
                          <option key={h} value={h}>{h} ({getHeaderType(h)})</option>
                        ))}
                      </select>

                      {/* String / Currency */}
                      {filterColumn && (getHeaderType(filterColumn) === 'string' || getHeaderType(filterColumn) === 'currency') && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Search</label>
                          <input
                            type="text"
                            placeholder="Search..."
                            value={filters[filterColumn]?.search || ''}
                            onChange={(e) => updateFilter(filterColumn, 'search', e.target.value)}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            autoFocus
                          />
                        </div>
                      )}

                      {/* Boolean */}
                      {filterColumn && getHeaderType(filterColumn) === 'boolean' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Value</label>
                          <select
                            value={filters[filterColumn]?.value ?? ''}
                            onChange={(e) => updateFilter(filterColumn, 'value', e.target.value === '' ? undefined : e.target.value)}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="">All</option>
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        </div>
                      )}

                      {/* Number */}
                      {filterColumn && getHeaderType(filterColumn) === 'number' && (
                        <div>
                          <div className="flex gap-1 mb-2">
                            <button
                              onClick={() => { setFilterMode('exact'); updateFilter(filterColumn, 'min', undefined); updateFilter(filterColumn, 'max', undefined); }}
                              className={`text-xs px-2 py-1 rounded ${filterMode === 'exact' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                              Value
                            </button>
                            <button
                              onClick={() => { setFilterMode('range'); updateFilter(filterColumn, 'min', undefined); updateFilter(filterColumn, 'max', undefined); }}
                              className={`text-xs px-2 py-1 rounded ${filterMode === 'range' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                              Range
                            </button>
                          </div>
                          {filterMode === 'exact' ? (
                            <input
                              type="number"
                              placeholder="Value"
                              value={filters[filterColumn]?.min ?? ''}
                              onChange={(e) => { const v = e.target.value ? Number(e.target.value) : undefined; updateFilter(filterColumn, 'min', v); updateFilter(filterColumn, 'max', v); }}
                              className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              autoFocus
                            />
                          ) : (
                            <div className="flex gap-2">
                              <input
                                type="number"
                                placeholder="Min"
                                value={filters[filterColumn]?.min ?? ''}
                                onChange={(e) => updateFilter(filterColumn, 'min', e.target.value ? Number(e.target.value) : undefined)}
                                className="w-1/2 border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                              <input
                                type="number"
                                placeholder="Max"
                                value={filters[filterColumn]?.max ?? ''}
                                onChange={(e) => updateFilter(filterColumn, 'max', e.target.value ? Number(e.target.value) : undefined)}
                                className="w-1/2 border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Date */}
                      {filterColumn && getHeaderType(filterColumn) === 'date' && (
                        <div>
                          <div className="flex gap-1 mb-2">
                            <button
                              onClick={() => { setFilterMode('exact'); updateFilter(filterColumn, 'from', undefined); updateFilter(filterColumn, 'to', undefined); }}
                              className={`text-xs px-2 py-1 rounded ${filterMode === 'exact' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                              Value
                            </button>
                            <button
                              onClick={() => { setFilterMode('range'); updateFilter(filterColumn, 'from', undefined); updateFilter(filterColumn, 'to', undefined); }}
                              className={`text-xs px-2 py-1 rounded ${filterMode === 'range' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                              Range
                            </button>
                          </div>
                          {filterMode === 'exact' ? (
                            <input
                              type="date"
                              value={filters[filterColumn]?.from || ''}
                              onChange={(e) => { const v = e.target.value || undefined; updateFilter(filterColumn, 'from', v); updateFilter(filterColumn, 'to', v); }}
                              className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          ) : (
                            <div className="flex gap-2">
                              <input
                                type="date"
                                value={filters[filterColumn]?.from || ''}
                                onChange={(e) => updateFilter(filterColumn, 'from', e.target.value || undefined)}
                                className="w-1/2 border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                              <input
                                type="date"
                                value={filters[filterColumn]?.to || ''}
                                onChange={(e) => updateFilter(filterColumn, 'to', e.target.value || undefined)}
                                className="w-1/2 border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Active filter chips */}
              {activeFilters.map(({ col, type, filterObj }) => (
                <span
                  key={col}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700"
                >
                  {describeFilter(col, type, filterObj)}
                  <button onClick={() => clearColumnFilter(col)} className="ml-0.5 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200">&times;</button>
                </span>
              ))}

              {activeFilters.length >= 2 && (
                <button onClick={() => { setFilters({}); setPage(1); }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  Clear all
                </button>
              )}
            </div>

            {/* Data table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    {headerNames.map((h) => (
                      <th key={h} className="text-left px-2 py-1 font-medium text-gray-500 dark:text-gray-400">{h}</th>
                    ))}
                    {mode === 'edit' && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {(set.records || []).map((rec) => {
                    const vals = parseRecordValues(rec);
                    return (
                      <tr key={rec.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        {headerNames.map((h) => {
                          const isEditingThis = editingCell?.recordId === rec.id && editingCell?.column === h;
                          return (
                            <td key={h} className="px-2 py-1">
                              {mode === 'edit' && isEditingThis ? (
                                <input
                                  autoFocus
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={saveEdit}
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                                  className="w-full border border-indigo-400 rounded px-1.5 py-0.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                                />
                              ) : (
                                <span
                                  onClick={mode === 'edit' ? () => startEdit(rec.id, h, vals[h]) : undefined}
                                  className={`block truncate min-h-[1.5em] ${mode === 'edit' ? 'cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded px-1' : ''} text-gray-700 dark:text-gray-300`}
                                >
                                  {vals[h] !== null && vals[h] !== undefined && String(vals[h]) !== '' ? String(vals[h]) : (mode === 'edit' ? '\u00A0' : '')}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        {mode === 'edit' && (
                          <td className="px-1 text-center">
                            <button onClick={() => deleteRow(rec.id)} className="text-red-400 hover:text-red-600">&times;</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {(set.records || []).length === 0 && (
                    <tr><td colSpan={headerNames.length + (mode === 'edit' ? 1 : 0)} className="text-center py-4 text-gray-400 text-xs">No records</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{set.total || 0} records</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400 px-2">
                  {page} / {totalPages || 1}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}

export default DataMapSetEdit;
