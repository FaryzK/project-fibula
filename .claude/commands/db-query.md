Query the project's Supabase Postgres database for debugging. The user's argument describes what they want to look up (e.g. a workflow run, document execution, reconciliation rule, etc.).

## Instructions

1. Read the user's argument: $ARGUMENTS
2. Based on what they want to look up, construct the appropriate SQL query. Use your knowledge of the project schema (see table reference below).
3. Run the query using the backend's Knex instance via a one-liner Node script:

```
cd /Users/faryz/Desktop/Codes/project_fibula/backend && node -e "
  require('dotenv').config();
  const db = require('knex')(require('./knexfile').development);
  db.raw('YOUR SQL HERE')
    .then(r => { console.log(JSON.stringify(r.rows, null, 2)); return db.destroy(); })
    .catch(e => { console.error(e.message); return db.destroy(); });
"
```

4. Present the results in a clear, readable format. If the data contains JSON columns (like `metadata` or `config`), format them nicely.
5. If the user asks a follow-up or the first query doesn't find what they need, refine and run again.

## Key Tables

| Table | Key Columns | Notes |
|---|---|---|
| `workflows` | id, user_id, name, is_published | User's workflow definitions |
| `nodes` | id, workflow_id, node_type, name, config (JSONB) | Canvas nodes; node_type = MANUAL_UPLOAD, EXTRACTOR, RECONCILIATION, etc. |
| `edges` | id, workflow_id, source_node_id, target_node_id, source_port, target_port | Node connections |
| `documents` | id, user_id, file_name, file_url, file_type | Uploaded files |
| `workflow_runs` | id, workflow_id, status, trigger_type, started_at, completed_at | Execution runs |
| `document_executions` | id, workflow_run_id, document_id, status, current_node_id, metadata (JSONB), unrouted_port | Per-doc execution state; status = pending/processing/completed/held/failed/unrouted |
| `node_execution_logs` | id, document_execution_id, node_id, status, input_metadata, output_metadata, output_port, started_at | Per-node log for each doc |
| `extractors` | id, user_id, name, system_prompt | VLM extractor configs |
| `extractor_header_fields` | id, extractor_id, name, data_type, is_mandatory, position | Extractor schema fields |
| `extractor_table_types` | id, extractor_id, name | Extractor table definitions |
| `extractor_table_columns` | id, table_type_id, name, data_type, position | Table columns |
| `extractor_held_documents` | id, extractor_id, document_execution_id, held_reason, status | Docs held by extractor |
| `reconciliation_rules` | id, user_id, name, anchor_extractor_id, auto_send_out | Recon rules |
| `reconciliation_target_extractors` | id, rule_id, extractor_id | Target extractors for a rule |
| `reconciliation_variations` | id, rule_id, name | Rule variations |
| `reconciliation_held_documents` | id, user_id, document_execution_id, extractor_id, workflow_id, node_id, slot_id, slot_label, status | Docs held at recon node; status = held/reconciled/rejected |
| `reconciliation_matching_sets` | id, rule_id, variation_id, anchor_document_execution_id, status | Matching sets; status = pending/reconciled |
| `reconciliation_matching_set_docs` | id, matching_set_id, document_execution_id, extractor_id | Docs in a matching set |
| `reconciliation_comparison_results` | id, matching_set_id, comparison_rule_id, status | Comparison outcomes; status = auto/pending/force |
| `splitting_instructions` | id, user_id, name, instruction | Splitting config |
| `categorisation_prompts` | id, user_id, name, labels (JSONB) | Categorisation config |
| `data_map_sets` | id, user_id, name | Data map set |
| `data_map_rules` | id, user_id, name, extractor_id, rules (JSONB) | Data map rules |
| `document_folders` | id, user_id, name | Document folder instances |
| `document_folder_held_documents` | id, folder_id, document_execution_id, status | Docs in folder |

## Common Query Patterns

- **Workflow run status**: `SELECT * FROM workflow_runs WHERE id = '...'`
- **All doc execs for a run**: `SELECT de.*, d.file_name FROM document_executions de JOIN documents d ON d.id = de.document_id WHERE de.workflow_run_id = '...' ORDER BY de.created_at`
- **Node logs for a doc exec**: `SELECT nel.*, n.node_type, n.name as label FROM node_execution_logs nel JOIN nodes n ON n.id = nel.node_id WHERE nel.document_execution_id = '...' ORDER BY nel.started_at`
- **Recon held docs**: `SELECT rhd.*, d.file_name, e.name as extractor_name FROM reconciliation_held_documents rhd JOIN document_executions de ON de.id = rhd.document_execution_id JOIN documents d ON d.id = de.document_id JOIN extractors e ON e.id = rhd.extractor_id WHERE rhd.user_id = '...'`
- **Matching sets for a rule**: `SELECT ms.*, (SELECT count(*) FROM reconciliation_matching_set_docs WHERE matching_set_id = ms.id) as doc_count FROM reconciliation_matching_sets ms WHERE ms.rule_id = '...'`
- **Node execution flow for a run**: `SELECT nel.status, nel.output_port, n.node_type, n.name as label, d.file_name FROM node_execution_logs nel JOIN nodes n ON n.id = nel.node_id JOIN document_executions de ON de.id = nel.document_execution_id JOIN documents d ON d.id = de.document_id WHERE de.workflow_run_id = '...' ORDER BY nel.started_at`
