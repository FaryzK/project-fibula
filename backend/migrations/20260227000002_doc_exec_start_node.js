exports.up = (knex) =>
  knex.schema.alterTable('document_executions', (t) => {
    t.uuid('start_node_id').nullable().references('id').inTable('nodes').onDelete('SET NULL');
  });

exports.down = (knex) =>
  knex.schema.alterTable('document_executions', (t) => {
    t.dropColumn('start_node_id');
  });
