exports.up = async function (knex) {
  // 1. Add data_map_set_id to rules (rule-level set reference)
  await knex.schema.alterTable('data_map_rules', (t) => {
    t.uuid('data_map_set_id')
      .nullable()
      .references('id')
      .inTable('data_map_sets')
      .onDelete('SET NULL');
  });

  // 2. Add expression column to targets
  await knex.schema.alterTable('data_map_rule_targets', (t) => {
    t.text('expression').nullable();
  });

  // 3. Backfill rules.data_map_set_id from first lookup's set_id
  await knex.raw(`
    UPDATE data_map_rules r
    SET data_map_set_id = (
      SELECT l.data_map_set_id
      FROM data_map_rule_lookups l
      WHERE l.rule_id = r.id
      LIMIT 1
    )
  `);

  // 4. Fallback: rules with no lookups, try targets
  await knex.raw(`
    UPDATE data_map_rules r
    SET data_map_set_id = (
      SELECT t.data_map_set_id
      FROM data_map_rule_targets t
      WHERE t.rule_id = r.id
      LIMIT 1
    )
    WHERE r.data_map_set_id IS NULL
  `);

  // 5. Backfill targets.expression from mode/map_set_column/calculation_expression
  await knex.raw(`
    UPDATE data_map_rule_targets
    SET expression = CASE
      WHEN mode = 'calculation' AND calculation_expression IS NOT NULL
        THEN REPLACE(calculation_expression, 'mapset', map_set_column)
      ELSE map_set_column
    END
  `);

  // 6. Drop data_map_set_id from lookups
  await knex.schema.alterTable('data_map_rule_lookups', (t) => {
    t.dropColumn('data_map_set_id');
  });

  // 7. Drop old columns from targets
  await knex.schema.alterTable('data_map_rule_targets', (t) => {
    t.dropColumn('data_map_set_id');
    t.dropColumn('map_set_column');
    t.dropColumn('mode');
    t.dropColumn('calculation_expression');
  });
};

exports.down = async function (knex) {
  // 1. Re-add columns to targets
  await knex.schema.alterTable('data_map_rule_targets', (t) => {
    t.text('map_set_column').nullable();
    t.text('mode').defaultTo('map');
    t.text('calculation_expression').nullable();
    t.uuid('data_map_set_id')
      .nullable()
      .references('id')
      .inTable('data_map_sets')
      .onDelete('SET NULL');
  });

  // 2. Re-add data_map_set_id to lookups
  await knex.schema.alterTable('data_map_rule_lookups', (t) => {
    t.uuid('data_map_set_id')
      .nullable()
      .references('id')
      .inTable('data_map_sets')
      .onDelete('RESTRICT');
  });

  // 3. Backfill targets from expression: simple column name → map, otherwise → calculation
  await knex.raw(`
    UPDATE data_map_rule_targets t
    SET
      mode = CASE
        WHEN expression ~ '[+\\-*/()]' THEN 'calculation'
        ELSE 'map'
      END,
      map_set_column = CASE
        WHEN expression ~ '[+\\-*/()]' THEN 'value'
        ELSE expression
      END,
      calculation_expression = CASE
        WHEN expression ~ '[+\\-*/()]' THEN expression
        ELSE NULL
      END
  `);

  // 4. Backfill targets.data_map_set_id from rule
  await knex.raw(`
    UPDATE data_map_rule_targets t
    SET data_map_set_id = (
      SELECT r.data_map_set_id
      FROM data_map_rules r
      WHERE r.id = t.rule_id
    )
  `);

  // 5. Backfill lookups.data_map_set_id from rule
  await knex.raw(`
    UPDATE data_map_rule_lookups l
    SET data_map_set_id = (
      SELECT r.data_map_set_id
      FROM data_map_rules r
      WHERE r.id = l.rule_id
    )
  `);

  // 6. Drop expression from targets
  await knex.schema.alterTable('data_map_rule_targets', (t) => {
    t.dropColumn('expression');
  });

  // 7. Drop data_map_set_id from rules
  await knex.schema.alterTable('data_map_rules', (t) => {
    t.dropColumn('data_map_set_id');
  });
};
