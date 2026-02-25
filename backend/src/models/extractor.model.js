const { db } = require('../config/db');

const EXTRACTORS = 'extractors';
const HEADER_FIELDS = 'extractor_header_fields';
const TABLE_TYPES = 'extractor_table_types';
const TABLE_COLUMNS = 'extractor_table_columns';
const FEEDBACK = 'extractor_training_feedback';
const HELD = 'extractor_held_documents';
const NODES = 'nodes';
const WORKFLOWS = 'workflows';
const DOC_EXECUTIONS = 'document_executions';
const DOCUMENTS = 'documents';

module.exports = {
  async findByUserId(userId) {
    return db(EXTRACTORS).where({ user_id: userId }).orderBy('created_at', 'desc');
  },

  async findById(id) {
    const extractor = await db(EXTRACTORS).where({ id }).first();
    if (!extractor) return null;
    const [headerFields, tableTypes] = await Promise.all([
      db(HEADER_FIELDS).where({ extractor_id: id }).orderBy('sort_order', 'asc'),
      db(TABLE_TYPES).where({ extractor_id: id }).orderBy('created_at', 'asc'),
    ]);
    const tableTypeIds = tableTypes.map((t) => t.id);
    const columns = tableTypeIds.length
      ? await db(TABLE_COLUMNS).whereIn('table_type_id', tableTypeIds).orderBy('sort_order', 'asc')
      : [];
    const typesWithCols = tableTypes.map((t) => ({
      ...t,
      columns: columns.filter((c) => c.table_type_id === t.id),
    }));
    return { ...extractor, header_fields: headerFields, table_types: typesWithCols };
  },

  async create({ userId, name, holdAll = false, headerFields = [], tableTypes = [] }) {
    const [extractor] = await db(EXTRACTORS)
      .insert({ user_id: userId, name, hold_all: holdAll })
      .returning('*');

    const headerRows = headerFields.length
      ? await db(HEADER_FIELDS)
          .insert(
            headerFields.map((f, i) => ({
              extractor_id: extractor.id,
              field_name: f.field_name,
              field_description: f.field_description || '',
              is_mandatory: f.is_mandatory || false,
              sort_order: i,
            }))
          )
          .returning('*')
      : [];

    const typeRows = [];
    for (const tt of tableTypes) {
      const [typeRow] = await db(TABLE_TYPES)
        .insert({
          extractor_id: extractor.id,
          type_name: tt.type_name,
          type_description: tt.type_description || '',
        })
        .returning('*');
      const colRows = tt.columns && tt.columns.length
        ? await db(TABLE_COLUMNS)
            .insert(
              tt.columns.map((c, i) => ({
                table_type_id: typeRow.id,
                column_name: c.column_name,
                column_description: c.column_description || '',
                is_mandatory: c.is_mandatory || false,
                sort_order: i,
              }))
            )
            .returning('*')
        : [];
      typeRows.push({ ...typeRow, columns: colRows });
    }

    return { ...extractor, header_fields: headerRows, table_types: typeRows };
  },

  async update(id, fields) {
    const allowed = {};
    if (fields.name !== undefined) allowed.name = fields.name;
    if (fields.hold_all !== undefined) allowed.hold_all = fields.hold_all;

    let extractor;
    if (Object.keys(allowed).length > 0) {
      const [row] = await db(EXTRACTORS).where({ id }).update(allowed).returning('*');
      extractor = row;
    } else {
      extractor = await db(EXTRACTORS).where({ id }).first();
    }

    // Replace header_fields if provided
    if (fields.header_fields !== undefined) {
      await db(HEADER_FIELDS).where({ extractor_id: id }).delete();
      if (fields.header_fields.length > 0) {
        await db(HEADER_FIELDS).insert(
          fields.header_fields.map((f, i) => ({
            extractor_id: id,
            field_name: f.field_name,
            field_description: f.field_description || '',
            is_mandatory: f.is_mandatory || false,
            sort_order: i,
          }))
        );
      }
    }

    // Replace table_types if provided
    if (fields.table_types !== undefined) {
      const existingTypes = await db(TABLE_TYPES).where({ extractor_id: id }).select('id');
      const typeIds = existingTypes.map((t) => t.id);
      if (typeIds.length > 0) await db(TABLE_COLUMNS).whereIn('table_type_id', typeIds).delete();
      await db(TABLE_TYPES).where({ extractor_id: id }).delete();

      for (const tt of fields.table_types) {
        const [typeRow] = await db(TABLE_TYPES)
          .insert({ extractor_id: id, type_name: tt.type_name, type_description: tt.type_description || '' })
          .returning('*');
        if (tt.columns && tt.columns.length > 0) {
          await db(TABLE_COLUMNS).insert(
            tt.columns.map((c, i) => ({
              table_type_id: typeRow.id,
              column_name: c.column_name,
              column_description: c.column_description || '',
              is_mandatory: c.is_mandatory || false,
              sort_order: i,
            }))
          );
        }
      }
    }

    return this.findById(id);
  },

  async remove(id) {
    const tableTypes = await db(TABLE_TYPES).where({ extractor_id: id }).select('id');
    const typeIds = tableTypes.map((t) => t.id);
    if (typeIds.length > 0) await db(TABLE_COLUMNS).whereIn('table_type_id', typeIds).delete();
    await db(TABLE_TYPES).where({ extractor_id: id }).delete();
    await db(HEADER_FIELDS).where({ extractor_id: id }).delete();
    await db(FEEDBACK).where({ extractor_id: id }).delete();
    await db(HELD).where({ extractor_id: id }).delete();
    return db(EXTRACTORS).where({ id }).delete();
  },

  async findHeld(extractorId) {
    return db(HELD)
      .join(DOC_EXECUTIONS, `${HELD}.document_execution_id`, `${DOC_EXECUTIONS}.id`)
      .join(DOCUMENTS, `${DOC_EXECUTIONS}.document_id`, `${DOCUMENTS}.id`)
      .where(`${HELD}.extractor_id`, extractorId)
      .where(`${HELD}.status`, 'held')
      .select(
        `${HELD}.id`,
        `${HELD}.extractor_id`,
        `${HELD}.document_execution_id`,
        `${HELD}.status`,
        `${HELD}.held_at`,
        `${DOCUMENTS}.file_name`,
        `${DOCUMENTS}.file_url`,
        `${DOC_EXECUTIONS}.metadata`,
        `${DOC_EXECUTIONS}.workflow_run_id`
      )
      .orderBy(`${HELD}.held_at`, 'desc');
  },

  async findHeldById(heldId) {
    return db(HELD).where({ id: heldId }).first();
  },

  async createHeld({ extractorId, documentExecutionId }) {
    const [row] = await db(HELD)
      .insert({
        extractor_id: extractorId,
        document_execution_id: documentExecutionId,
        status: 'held',
        held_at: new Date(),
      })
      .returning('*');
    return row;
  },

  async sendOut(heldId) {
    const [row] = await db(HELD).where({ id: heldId }).update({ status: 'sent_out' }).returning('*');
    return row;
  },

  async findFeedback(extractorId) {
    return db(FEEDBACK).where({ extractor_id: extractorId }).orderBy('created_at', 'desc');
  },

  async createFeedback({ extractorId, documentId, targetType, targetId, feedbackText, imageEmbedding }) {
    const [row] = await db(FEEDBACK)
      .insert({
        extractor_id: extractorId,
        document_id: documentId,
        target_type: targetType,
        target_id: targetId,
        feedback_text: feedbackText,
        image_embedding: imageEmbedding || null,
      })
      .returning('*');
    return row;
  },

  // Find top-k training feedback by image embedding similarity (pgvector)
  async findSimilarFeedback(extractorId, embedding, limit = 5) {
    if (!embedding) return db(FEEDBACK).where({ extractor_id: extractorId }).limit(limit);
    return db(FEEDBACK)
      .where({ extractor_id: extractorId })
      .whereNotNull('image_embedding')
      .orderByRaw('image_embedding <-> ?::vector', [JSON.stringify(embedding)])
      .limit(limit);
  },

  async findUsage(extractorId) {
    return db(NODES)
      .join(WORKFLOWS, `${NODES}.workflow_id`, `${WORKFLOWS}.id`)
      .where(`${NODES}.node_type`, 'EXTRACTOR')
      .whereRaw(`${NODES}.config->>'extractor_id' = ?`, [extractorId])
      .select(
        `${WORKFLOWS}.id as workflow_id`,
        `${WORKFLOWS}.name as workflow_name`,
        `${NODES}.id as node_id`,
        `${NODES}.name as node_name`
      );
  },
};
