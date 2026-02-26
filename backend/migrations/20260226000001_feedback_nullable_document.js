exports.up = (knex) =>
  knex.schema.alterTable('extractor_training_feedback', (t) => {
    t.uuid('document_id').nullable().alter();
  });

exports.down = (knex) =>
  knex.schema.alterTable('extractor_training_feedback', (t) => {
    t.uuid('document_id').notNullable().alter();
  });
