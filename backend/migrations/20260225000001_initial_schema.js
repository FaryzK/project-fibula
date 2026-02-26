exports.up = async function (knex) {
  // Enable pgvector extension (must be enabled in Supabase dashboard too)
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');

  // users
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.text('supabase_auth_id').unique().notNullable();
    t.text('email').unique().notNullable();
    t.text('first_name');
    t.text('last_name');
    t.text('profile_icon_url');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // workflows
  await knex.schema.createTable('workflows', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('name').notNullable();
    t.boolean('is_published').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // nodes
  await knex.schema.createTable('nodes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('workflow_id').notNullable().references('id').inTable('workflows').onDelete('CASCADE');
    t.text('node_type').notNullable();
    t.text('name').notNullable();
    t.float('position_x').defaultTo(0);
    t.float('position_y').defaultTo(0);
    t.jsonb('config').defaultTo('{}');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // edges
  await knex.schema.createTable('edges', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('workflow_id').notNullable().references('id').inTable('workflows').onDelete('CASCADE');
    t.uuid('source_node_id').notNullable().references('id').inTable('nodes').onDelete('CASCADE');
    t.text('source_port').notNullable().defaultTo('default');
    t.uuid('target_node_id').notNullable().references('id').inTable('nodes').onDelete('CASCADE');
    t.text('target_port').notNullable().defaultTo('default');
  });

  // documents
  await knex.schema.createTable('documents', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('file_name').notNullable();
    t.text('file_url').notNullable();
    t.text('file_type').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // workflow_runs
  await knex.schema.createTable('workflow_runs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('workflow_id').notNullable().references('id').inTable('workflows').onDelete('CASCADE');
    t.text('triggered_by').notNullable(); // MANUAL, WEBHOOK
    t.text('status').notNullable().defaultTo('running'); // running, completed, failed
    t.timestamp('started_at').defaultTo(knex.fn.now());
    t.timestamp('completed_at');
  });

  // document_executions
  await knex.schema.createTable('document_executions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('workflow_run_id').notNullable().references('id').inTable('workflow_runs').onDelete('CASCADE');
    t.uuid('document_id').nullable().references('id').inTable('documents').onDelete('CASCADE');
    t.uuid('current_node_id').references('id').inTable('nodes').onDelete('SET NULL');
    t.text('status').notNullable().defaultTo('pending'); // pending, processing, completed, held, failed
    t.jsonb('metadata').defaultTo('{}');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // node_execution_logs
  await knex.schema.createTable('node_execution_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('document_execution_id').notNullable().references('id').inTable('document_executions').onDelete('CASCADE');
    t.uuid('node_id').notNullable().references('id').inTable('nodes').onDelete('CASCADE');
    t.text('status').notNullable(); // processing, completed, failed, held
    t.jsonb('input_metadata').defaultTo('{}');
    t.jsonb('output_metadata').defaultTo('{}');
    t.timestamp('started_at').defaultTo(knex.fn.now());
    t.timestamp('completed_at');
    t.text('error');
  });

  // splitting_instructions
  await knex.schema.createTable('splitting_instructions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('name').notNullable();
    t.text('instructions').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // categorisation_prompts
  await knex.schema.createTable('categorisation_prompts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('name').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // categorisation_labels
  await knex.schema.createTable('categorisation_labels', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('prompt_id').notNullable().references('id').inTable('categorisation_prompts').onDelete('CASCADE');
    t.text('label').notNullable();
    t.text('description').notNullable();
    t.integer('sort_order').defaultTo(0);
  });

  // extractors
  await knex.schema.createTable('extractors', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('name').notNullable();
    t.boolean('hold_all').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // extractor_header_fields
  await knex.schema.createTable('extractor_header_fields', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('extractor_id').notNullable().references('id').inTable('extractors').onDelete('CASCADE');
    t.text('field_name').notNullable();
    t.text('field_description');
    t.boolean('is_mandatory').defaultTo(false);
    t.integer('sort_order').defaultTo(0);
  });

  // extractor_table_types
  await knex.schema.createTable('extractor_table_types', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('extractor_id').notNullable().references('id').inTable('extractors').onDelete('CASCADE');
    t.text('type_name').notNullable();
    t.text('type_description');
  });

  // extractor_table_columns
  await knex.schema.createTable('extractor_table_columns', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('table_type_id').notNullable().references('id').inTable('extractor_table_types').onDelete('CASCADE');
    t.text('column_name').notNullable();
    t.text('column_description');
    t.boolean('is_mandatory').defaultTo(false);
    t.integer('sort_order').defaultTo(0);
  });

  // extractor_training_feedback
  await knex.schema.createTable('extractor_training_feedback', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('extractor_id').notNullable().references('id').inTable('extractors').onDelete('CASCADE');
    t.uuid('document_id').notNullable().references('id').inTable('documents').onDelete('CASCADE');
    t.text('target_type').notNullable(); // header_field or table_column
    t.uuid('target_id').notNullable();
    t.text('feedback_text').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
  // image_embedding column added separately as raw (pgvector type not native to Knex)
  await knex.raw('ALTER TABLE extractor_training_feedback ADD COLUMN image_embedding vector(1536)');

  // extractor_held_documents
  await knex.schema.createTable('extractor_held_documents', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('extractor_id').notNullable().references('id').inTable('extractors').onDelete('CASCADE');
    t.uuid('document_execution_id').notNullable().references('id').inTable('document_executions').onDelete('CASCADE');
    t.text('status').notNullable().defaultTo('held'); // held, sent_out
    t.timestamp('held_at').defaultTo(knex.fn.now());
  });

  // data_map_sets
  await knex.schema.createTable('data_map_sets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('name').notNullable();
    t.jsonb('headers').defaultTo('[]');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // data_map_records
  await knex.schema.createTable('data_map_records', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('data_map_set_id').notNullable().references('id').inTable('data_map_sets').onDelete('CASCADE');
    t.jsonb('values').defaultTo('{}');
  });

  // data_map_rules
  await knex.schema.createTable('data_map_rules', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('name').notNullable();
    t.uuid('extractor_id').notNullable().references('id').inTable('extractors').onDelete('RESTRICT');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // data_map_rule_lookups
  await knex.schema.createTable('data_map_rule_lookups', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('rule_id').notNullable().references('id').inTable('data_map_rules').onDelete('CASCADE');
    t.uuid('data_map_set_id').notNullable().references('id').inTable('data_map_sets').onDelete('RESTRICT');
    t.text('map_set_column').notNullable();
    t.text('schema_field').notNullable();
    t.text('match_type').notNullable().defaultTo('exact'); // exact or fuzzy
    t.float('match_threshold').defaultTo(0.8);
    t.integer('sort_order').defaultTo(0);
  });

  // data_map_rule_targets
  await knex.schema.createTable('data_map_rule_targets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('rule_id').notNullable().references('id').inTable('data_map_rules').onDelete('CASCADE');
    t.text('target_type').notNullable(); // header or table_column
    t.text('schema_field').notNullable();
    t.text('map_set_column').notNullable();
    t.text('mode').notNullable().defaultTo('map'); // map or calculation
    t.text('calculation_expression');
  });

  // reconciliation_rules
  await knex.schema.createTable('reconciliation_rules', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('name').notNullable();
    t.uuid('anchor_extractor_id').notNullable().references('id').inTable('extractors').onDelete('RESTRICT');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // reconciliation_target_extractors
  await knex.schema.createTable('reconciliation_target_extractors', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('rule_id').notNullable().references('id').inTable('reconciliation_rules').onDelete('CASCADE');
    t.uuid('extractor_id').notNullable().references('id').inTable('extractors').onDelete('RESTRICT');
  });

  // reconciliation_variations
  await knex.schema.createTable('reconciliation_variations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('rule_id').notNullable().references('id').inTable('reconciliation_rules').onDelete('CASCADE');
    t.integer('variation_order').notNullable();
  });

  // reconciliation_doc_matching_links
  await knex.schema.createTable('reconciliation_doc_matching_links', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('variation_id').notNullable().references('id').inTable('reconciliation_variations').onDelete('CASCADE');
    t.text('anchor_field').notNullable();
    t.uuid('target_extractor_id').notNullable().references('id').inTable('extractors').onDelete('RESTRICT');
    t.text('target_field').notNullable();
    t.text('match_type').notNullable().defaultTo('exact');
    t.float('match_threshold').defaultTo(0.8);
  });

  // reconciliation_table_matching_keys
  await knex.schema.createTable('reconciliation_table_matching_keys', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('variation_id').notNullable().references('id').inTable('reconciliation_variations').onDelete('CASCADE');
    t.uuid('anchor_table_type_id').notNullable().references('id').inTable('extractor_table_types').onDelete('RESTRICT');
    t.uuid('target_extractor_id').notNullable().references('id').inTable('extractors').onDelete('RESTRICT');
    t.uuid('target_table_type_id').notNullable().references('id').inTable('extractor_table_types').onDelete('RESTRICT');
    t.text('anchor_column').notNullable();
    t.text('target_column').notNullable();
  });

  // reconciliation_comparison_rules
  await knex.schema.createTable('reconciliation_comparison_rules', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('variation_id').notNullable().references('id').inTable('reconciliation_variations').onDelete('CASCADE');
    t.text('level').notNullable(); // header or table
    t.text('formula').notNullable();
    t.text('tolerance_type'); // absolute or percentage
    t.float('tolerance_value');
  });

  // reconciliation_matching_sets
  await knex.schema.createTable('reconciliation_matching_sets', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('rule_id').notNullable().references('id').inTable('reconciliation_rules').onDelete('CASCADE');
    t.uuid('anchor_document_execution_id').notNullable().references('id').inTable('document_executions').onDelete('CASCADE');
    t.text('status').notNullable().defaultTo('pending'); // pending, reconciled, rejected, force_reconciled
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // reconciliation_matching_set_docs
  await knex.schema.createTable('reconciliation_matching_set_docs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('matching_set_id').notNullable().references('id').inTable('reconciliation_matching_sets').onDelete('CASCADE');
    t.uuid('document_execution_id').notNullable().references('id').inTable('document_executions').onDelete('CASCADE');
    t.uuid('extractor_id').notNullable().references('id').inTable('extractors').onDelete('RESTRICT');
  });

  // document_folder_instances
  await knex.schema.createTable('document_folder_instances', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('name').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // document_folder_held
  await knex.schema.createTable('document_folder_held', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('folder_instance_id').notNullable().references('id').inTable('document_folder_instances').onDelete('CASCADE');
    t.uuid('document_execution_id').notNullable().references('id').inTable('document_executions').onDelete('CASCADE');
    t.uuid('workflow_id').notNullable().references('id').inTable('workflows').onDelete('CASCADE');
    t.uuid('node_id').notNullable().references('id').inTable('nodes').onDelete('CASCADE');
    t.text('status').notNullable().defaultTo('held'); // held, sent_out
    t.timestamp('arrived_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  const tables = [
    'document_folder_held',
    'document_folder_instances',
    'reconciliation_matching_set_docs',
    'reconciliation_matching_sets',
    'reconciliation_comparison_rules',
    'reconciliation_table_matching_keys',
    'reconciliation_doc_matching_links',
    'reconciliation_variations',
    'reconciliation_target_extractors',
    'reconciliation_rules',
    'data_map_rule_targets',
    'data_map_rule_lookups',
    'data_map_rules',
    'data_map_records',
    'data_map_sets',
    'extractor_held_documents',
    'extractor_training_feedback',
    'extractor_table_columns',
    'extractor_table_types',
    'extractor_header_fields',
    'extractors',
    'categorisation_labels',
    'categorisation_prompts',
    'splitting_instructions',
    'node_execution_logs',
    'document_executions',
    'workflow_runs',
    'documents',
    'edges',
    'nodes',
    'workflows',
    'users',
  ];

  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
};
