function createAppError(code, message, statusCode = 422, details = null) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  if (details) err.details = details;
  return err;
}

module.exports = { createAppError };
