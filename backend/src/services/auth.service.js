const userModel = require('../models/user.model');

async function getOrCreateUser(supabaseUser) {
  const { id: supabaseAuthId, email, user_metadata } = supabaseUser;
  const firstName = user_metadata?.full_name?.split(' ')[0] || user_metadata?.name?.split(' ')[0] || '';
  const lastName = user_metadata?.full_name?.split(' ').slice(1).join(' ') || '';

  return userModel.upsertUser({ supabaseAuthId, email, firstName, lastName });
}

async function getMe(supabaseAuthId) {
  return userModel.findBySupabaseId(supabaseAuthId);
}

module.exports = { getOrCreateUser, getMe };
