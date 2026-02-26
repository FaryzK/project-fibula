/**
 * Replace anchor/target column naming in reconciliation link tables with
 * left/right so any extractor can be linked to any other extractor.
 *
 * reconciliation_doc_matching_links:
 *   anchor_field, target_extractor_id, target_field
 *   → left_extractor_id, left_field, right_extractor_id, right_field
 *
 * reconciliation_table_matching_keys:
 *   anchor_table_type_id (UUID FK), target_extractor_id (UUID FK),
 *   target_table_type_id (UUID FK), anchor_column, target_column
 *   → left_extractor_id, left_table_type (text), left_column,
 *     right_extractor_id, right_table_type (text), right_column
 */

exports.up = async (knex) => {
  // ── doc_matching_links ────────────────────────────────────────────────────
  await knex.schema.alterTable('reconciliation_doc_matching_links', (t) => {
    t.uuid('left_extractor_id').nullable().references('id').inTable('extractors').onDelete('RESTRICT');
    t.text('left_field').nullable();
    t.uuid('right_extractor_id').nullable().references('id').inTable('extractors').onDelete('RESTRICT');
    t.text('right_field').nullable();
  });
  await knex.schema.alterTable('reconciliation_doc_matching_links', (t) => {
    t.dropColumn('anchor_field');
    t.dropColumn('target_extractor_id');
    t.dropColumn('target_field');
  });

  // ── table_matching_keys ───────────────────────────────────────────────────
  await knex.schema.alterTable('reconciliation_table_matching_keys', (t) => {
    t.uuid('left_extractor_id').nullable().references('id').inTable('extractors').onDelete('RESTRICT');
    t.text('left_table_type').nullable();
    t.text('left_column').nullable();
    t.uuid('right_extractor_id').nullable().references('id').inTable('extractors').onDelete('RESTRICT');
    t.text('right_table_type').nullable();
    t.text('right_column').nullable();
  });
  await knex.schema.alterTable('reconciliation_table_matching_keys', (t) => {
    t.dropColumn('anchor_table_type_id');
    t.dropColumn('target_extractor_id');
    t.dropColumn('target_table_type_id');
    t.dropColumn('anchor_column');
    t.dropColumn('target_column');
  });
};

exports.down = async (knex) => {
  // ── doc_matching_links ────────────────────────────────────────────────────
  await knex.schema.alterTable('reconciliation_doc_matching_links', (t) => {
    t.text('anchor_field').nullable();
    t.uuid('target_extractor_id').nullable().references('id').inTable('extractors').onDelete('RESTRICT');
    t.text('target_field').nullable();
  });
  await knex.schema.alterTable('reconciliation_doc_matching_links', (t) => {
    t.dropColumn('left_extractor_id');
    t.dropColumn('left_field');
    t.dropColumn('right_extractor_id');
    t.dropColumn('right_field');
  });

  // ── table_matching_keys ───────────────────────────────────────────────────
  await knex.schema.alterTable('reconciliation_table_matching_keys', (t) => {
    t.uuid('anchor_table_type_id').nullable().references('id').inTable('extractor_table_types').onDelete('RESTRICT');
    t.uuid('target_extractor_id').nullable().references('id').inTable('extractors').onDelete('RESTRICT');
    t.uuid('target_table_type_id').nullable().references('id').inTable('extractor_table_types').onDelete('RESTRICT');
    t.text('anchor_column').nullable();
    t.text('target_column').nullable();
  });
  await knex.schema.alterTable('reconciliation_table_matching_keys', (t) => {
    t.dropColumn('left_extractor_id');
    t.dropColumn('left_table_type');
    t.dropColumn('left_column');
    t.dropColumn('right_extractor_id');
    t.dropColumn('right_table_type');
    t.dropColumn('right_column');
  });
};
