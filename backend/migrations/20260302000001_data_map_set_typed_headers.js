/**
 * Convert data_map_sets.headers from plain string arrays to typed objects.
 * Before: ["col1", "col2"]
 * After:  [{"name": "col1", "data_type": "string"}, {"name": "col2", "data_type": "string"}]
 */
exports.up = async function (knex) {
  const rows = await knex('data_map_sets').select('id', 'headers');
  for (const row of rows) {
    const headers = typeof row.headers === 'string' ? JSON.parse(row.headers) : row.headers || [];
    // Skip if already migrated (first element is an object)
    if (headers.length > 0 && typeof headers[0] === 'object') continue;
    const typed = headers.map((h) => ({ name: h, data_type: 'string' }));
    await knex('data_map_sets')
      .where({ id: row.id })
      .update({ headers: JSON.stringify(typed) });
  }
};

exports.down = async function (knex) {
  const rows = await knex('data_map_sets').select('id', 'headers');
  for (const row of rows) {
    const headers = typeof row.headers === 'string' ? JSON.parse(row.headers) : row.headers || [];
    if (headers.length > 0 && typeof headers[0] === 'string') continue;
    const plain = headers.map((h) => h.name);
    await knex('data_map_sets')
      .where({ id: row.id })
      .update({ headers: JSON.stringify(plain) });
  }
};
