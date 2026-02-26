exports.up = async (knex) => {
  // 1. auto_send_out on rules
  await knex.schema.table('reconciliation_rules', (t) => {
    t.boolean('auto_send_out').notNullable().defaultTo(false);
  });

  // 2. Remove variation_order (variations are now parallel, not waterfall)
  await knex.schema.table('reconciliation_variations', (t) => {
    t.dropColumn('variation_order');
  });

  // 3. Add variation_id to matching_sets (one set per anchor × variation)
  await knex.schema.table('reconciliation_matching_sets', (t) => {
    t.uuid('variation_id')
      .nullable()
      .references('id')
      .inTable('reconciliation_variations')
      .onDelete('CASCADE');
  });

  // 4. reconciliation_held_documents — tracks every doc entering a recon node with source info
  await knex.schema.createTable('reconciliation_held_documents', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('document_execution_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('document_executions')
      .onDelete('CASCADE');
    t.uuid('extractor_id').notNullable().references('id').inTable('extractors').onDelete('CASCADE');
    t.uuid('workflow_id').nullable().references('id').inTable('workflows').onDelete('SET NULL');
    t.uuid('node_id').nullable(); // no FK — nodes can be deleted independently
    t.string('slot_id').nullable();    // e.g. 'slot_1708000000000'
    t.string('slot_label').nullable(); // e.g. 'Purchase Order'
    t.string('status').notNullable().defaultTo('held'); // held | reconciled | rejected
    t.timestamp('held_at').notNullable().defaultTo(knex.fn.now());
  });

  // 5. reconciliation_comparison_results — per-comparison outcomes per matching set
  await knex.schema.createTable('reconciliation_comparison_results', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('matching_set_id')
      .notNullable()
      .references('id')
      .inTable('reconciliation_matching_sets')
      .onDelete('CASCADE');
    t.uuid('comparison_rule_id')
      .notNullable()
      .references('id')
      .inTable('reconciliation_comparison_rules')
      .onDelete('CASCADE');
    t.string('status').notNullable().defaultTo('pending'); // pending | auto | force | rejected
    t.timestamp('resolved_at').nullable();
    t.text('note').nullable();
    t.unique(['matching_set_id', 'comparison_rule_id']);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('reconciliation_comparison_results');
  await knex.schema.dropTableIfExists('reconciliation_held_documents');
  await knex.schema.table('reconciliation_matching_sets', (t) => {
    t.dropColumn('variation_id');
  });
  await knex.schema.table('reconciliation_variations', (t) => {
    t.integer('variation_order').notNullable().defaultTo(1);
  });
  await knex.schema.table('reconciliation_rules', (t) => {
    t.dropColumn('auto_send_out');
  });
};
