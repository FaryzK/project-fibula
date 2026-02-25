const authService = require('../services/auth.service');

async function getMe(req, res, next) {
  try {
    const user = await authService.getMe(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res) {
  // JWT invalidation is handled client-side (Supabase stateless JWTs)
  // Backend simply acknowledges the request
  res.json({ message: 'Logged out' });
}

module.exports = { getMe, logout };
