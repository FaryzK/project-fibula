exports.up = async (knex) => {
  await knex.schema.table('document_executions', (t) => {
    t.text('orphaned_node_name').nullable();
  });
};

exports.down = async (knex) => {
  await knex.schema.table('document_executions', (t) => {
    t.dropColumn('orphaned_node_name');
  });
};
