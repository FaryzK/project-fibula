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

  /**
   * Copy an existing file to a new UUID-keyed path within the same bucket.
   * Used by multi-edge fan-out to create independent document copies per branch.
   * @param {string} sourcePath — storage path of the source file (UUID.ext)
   * @returns {{ url: string, path: string }}
   */
  async copy(sourcePath) {
    const ext = sourcePath.split('.').pop();
    const destPath = `${randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).copy(sourcePath, destPath);
    if (error) throw new Error(`Storage copy failed: ${error.message}`);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(destPath);
    return { url: data.publicUrl, path: destPath };
  },
};
