/**
 * One-time setup script: creates the Supabase storage bucket for documents.
 * Run with: node scripts/setup-storage.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const BUCKET = 'documents';

  // Check if bucket already exists
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error('Failed to list buckets:', listErr.message);
    process.exit(1);
  }

  if (buckets.some((b) => b.name === BUCKET)) {
    console.log(`Bucket "${BUCKET}" already exists — nothing to do.`);
    return;
  }

  // Create the bucket (public so file URLs are directly accessible)
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 52428800, // 50 MB
  });

  if (createErr) {
    console.error(`Failed to create bucket "${BUCKET}":`, createErr.message);
    process.exit(1);
  }

  console.log(`Bucket "${BUCKET}" created successfully.`);
}

main();
