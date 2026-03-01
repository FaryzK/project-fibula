/**
 * Change expression column from text to jsonb on data_map_rule_targets.
 * Expressions are now stored as token arrays:
 *   [{ type: 'set'|'extractor'|'operator'|'literal', value: '...' }, ...]
 * No backfill needed — no legacy data exists.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('data_map_rule_targets', (t) => {
    t.dropColumn('expression');
  });
  await knex.schema.alterTable('data_map_rule_targets', (t) => {
    t.jsonb('expression').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('data_map_rule_targets', (t) => {
    t.dropColumn('expression');
  });
  await knex.schema.alterTable('data_map_rule_targets', (t) => {
    t.text('expression').nullable();
  });
};
