exports.up = async function (knex) {
  // Add updated_at and updated_by to data_map_sets
  await knex.schema.alterTable('data_map_sets', (t) => {
    t.timestamp('updated_at');
    t.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
  });

  // Backfill: updated_at = created_at, updated_by = user_id
  await knex.raw(`
    UPDATE data_map_sets
    SET updated_at = created_at, updated_by = user_id
  `);

  // Add updated_at and updated_by to data_map_rules
  await knex.schema.alterTable('data_map_rules', (t) => {
    t.timestamp('updated_at');
    t.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
  });

  // Backfill
  await knex.raw(`
    UPDATE data_map_rules
    SET updated_at = created_at, updated_by = user_id
  `);
};

exports.down = async function (knex) {
  await knex.schema.alterTable('data_map_sets', (t) => {
    t.dropColumn('updated_at');
    t.dropColumn('updated_by');
  });
  await knex.schema.alterTable('data_map_rules', (t) => {
    t.dropColumn('updated_at');
    t.dropColumn('updated_by');
  });
};
