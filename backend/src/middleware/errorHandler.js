// Express 4 does not catch async throws — wrap every async controller.
const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => ({ field: e.path, msg: e.message }));
    return res.status(422).json({ error: 'Validation failed', details });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid value for ${err.path}` });
  }
  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 2 MB)' : err.message;
    return res.status(422).json({ error: msg });
  }
  if (err.code === 11000) {
    const fields = Object.keys(err.keyValue || {}).join(', ');
    return res.status(409).json({ error: `Duplicate value for: ${fields}` });
  }
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

// Convenience for controllers: throw httpError(403, 'msg')
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = { errorHandler, catchAsync, httpError };
