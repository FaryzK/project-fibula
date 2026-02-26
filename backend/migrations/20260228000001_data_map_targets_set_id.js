exports.up = async function (knex) {
  await knex.schema.table('data_map_rule_targets', (t) => {
    t.uuid('data_map_set_id').nullable().references('id').inTable('data_map_sets').onDelete('SET NULL');
  });
};

exports.down = async function (knex) {
  await knex.schema.table('data_map_rule_targets', (t) => {
    t.dropColumn('data_map_set_id');
  });
};
