exports.up = async (knex) => {
  await knex.schema.table('node_execution_logs', (t) => {
    t.text('output_port').nullable();
  });
};

exports.down = async (knex) => {
  await knex.schema.table('node_execution_logs', (t) => {
    t.dropColumn('output_port');
  });
};
