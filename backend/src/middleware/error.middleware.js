function errorMiddleware(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[${status}] ${message}`, err.stack);
  }

  res.status(status).json({ error: message });
}

module.exports = errorMiddleware;
