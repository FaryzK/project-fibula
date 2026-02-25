const { db } = require('../config/db');

async function upsertUser({ supabaseAuthId, email, firstName, lastName }) {
  const existing = await db('users').where({ supabase_auth_id: supabaseAuthId }).first();

  if (existing) {
    const [updated] = await db('users')
      .where({ supabase_auth_id: supabaseAuthId })
      .update({ email })
      .returning('*');
    return updated;
  }

  const [created] = await db('users')
    .insert({ supabase_auth_id: supabaseAuthId, email, first_name: firstName, last_name: lastName })
    .returning('*');
  return created;
}

async function findBySupabaseId(supabaseAuthId) {
  return db('users').where({ supabase_auth_id: supabaseAuthId }).first();
}

async function updateProfile(supabaseAuthId, { firstName, lastName, profileIconUrl }) {
  const [updated] = await db('users')
    .where({ supabase_auth_id: supabaseAuthId })
    .update({
      first_name: firstName,
      last_name: lastName,
      profile_icon_url: profileIconUrl,
    })
    .returning('*');
  return updated;
}

module.exports = { upsertUser, findBySupabaseId, updateProfile };
