const userModel = require('../models/user.model');

async function dbUserMiddleware(req, res, next) {
  try {
    const dbUser = await userModel.findBySupabaseId(req.user.id);
    if (!dbUser) return res.status(404).json({ error: 'User profile not found' });
    req.dbUser = dbUser;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = dbUserMiddleware;
