exports.up = async function (knex) {
  await knex.schema.alterTable('data_map_rule_targets', (t) => {
    t.dropColumn('target_type');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('data_map_rule_targets', (t) => {
    t.text('target_type').notNullable().defaultTo('header');
  });
  // Backfill: dot in schema_field → table_column, else header
  await knex.raw(`
    UPDATE data_map_rule_targets
    SET target_type = CASE WHEN schema_field LIKE '%.%' THEN 'table_column' ELSE 'header' END
  `);
  // Remove default after backfill
  await knex.schema.alterTable('data_map_rule_targets', (t) => {
    t.text('target_type').notNullable().alter();
  });
};
