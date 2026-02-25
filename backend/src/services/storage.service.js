const { supabase } = require('../config/db');
const { randomUUID } = require('crypto');

const BUCKET = 'documents';

module.exports = {
  /**
   * Upload a file buffer to Supabase Storage.
   * @param {Buffer} buffer
   * @param {string} originalName
   * @param {string} mimeType
   * @returns {{ url: string, path: string }}
   */
  async upload(buffer, originalName, mimeType) {
    const ext = originalName.split('.').pop();
    const path = `${randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mimeType, upsert: false });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  async remove(path) {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw new Error(`Storage remove failed: ${error.message}`);
  },
};
