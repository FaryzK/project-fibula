exports.up = async (knex) => {
  await knex.schema.table('extractor_header_fields', (t) => {
    t.text('data_type').notNullable().defaultTo('string');
    t.text('array_item_type').nullable();
  });
  await knex.schema.table('extractor_table_columns', (t) => {
    t.text('data_type').notNullable().defaultTo('string');
  });
};

exports.down = async (knex) => {
  await knex.schema.table('extractor_header_fields', (t) => {
    t.dropColumn('data_type');
    t.dropColumn('array_item_type');
  });
  await knex.schema.table('extractor_table_columns', (t) => {
    t.dropColumn('data_type');
  });
};
