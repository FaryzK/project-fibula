const userModel = require('../models/user.model');

async function dbUserMiddleware(req, res, next) {
  try {
    const { id: supabaseAuthId, email, user_metadata } = req.user;
    const firstName = user_metadata?.full_name?.split(' ')[0] || user_metadata?.name?.split(' ')[0] || '';
    const lastName = user_metadata?.full_name?.split(' ').slice(1).join(' ') || '';
    const dbUser = await userModel.upsertUser({ supabaseAuthId, email, firstName, lastName });
    req.dbUser = dbUser;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = dbUserMiddleware;
