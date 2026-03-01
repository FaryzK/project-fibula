exports.up = async (knex) => {
  await knex.schema.table('document_executions', (table) => {
    table.text('unrouted_port').nullable();
  });
};

exports.down = async (knex) => {
  await knex.schema.table('document_executions', (table) => {
    table.dropColumn('unrouted_port');
  });
};
