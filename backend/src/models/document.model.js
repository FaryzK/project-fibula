const { db } = require('../config/db');

const TABLE = 'documents';

module.exports = {
  async create({ userId, fileName, fileUrl, fileType }) {
    const [row] = await db(TABLE)
      .insert({
        user_id: userId,
        file_name: fileName,
        file_url: fileUrl,
        file_type: fileType,
      })
      .returning('*');
    return row;
  },

  async findById(id) {
    return db(TABLE).where({ id }).first();
  },

  async findByUserId(userId) {
    return db(TABLE).where({ user_id: userId }).orderBy('created_at', 'desc');
  },

  async remove(id) {
    return db(TABLE).where({ id }).delete();
  },
};
