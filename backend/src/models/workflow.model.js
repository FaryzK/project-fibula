const { db } = require('../config/db');

async function findByUserId(userId) {
  return db('workflows').where({ user_id: userId }).orderBy('created_at', 'desc');
}

async function findById(id) {
  return db('workflows').where({ id }).first();
}

async function create({ userId, name }) {
  const [row] = await db('workflows')
    .insert({ user_id: userId, name })
    .returning('*');
  return row;
}

async function update(id, fields) {
  const [row] = await db('workflows')
    .where({ id })
    .update({ ...fields, updated_at: db.fn.now() })
    .returning('*');
  return row;
}

async function remove(id) {
  await db('workflows').where({ id }).delete();
}

async function setPublished(id, isPublished) {
  const [row] = await db('workflows')
    .where({ id })
    .update({ is_published: isPublished, updated_at: db.fn.now() })
    .returning('*');
  return row;
}

module.exports = { findByUserId, findById, create, update, remove, setPublished };
