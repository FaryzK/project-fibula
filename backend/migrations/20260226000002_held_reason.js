exports.up = (knex) =>
  knex.schema.alterTable('extractor_held_documents', (t) => {
    t.string('held_reason').nullable(); // 'hold_all' | 'missing_mandatory'
  });

exports.down = (knex) =>
  knex.schema.alterTable('extractor_held_documents', (t) => {
    t.dropColumn('held_reason');
  });
