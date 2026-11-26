// MIDDLEWARE: the last safety nets, so the API always answers with JSON.

// Runs when no route matched the URL.
export function notFound(req, res) {
  res
    .status(404)
    .json({
      status: "error",
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
}

// Runs when something throws an error. Express recognises an error handler by its 4 parameters.
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  console.error("Unexpected error:", error);

  // A request body that is not valid JSON
  if (error.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({
        status: "error",
        message: "The request body is not valid JSON.",
      });
  }
  res
    .status(500)
    .json({ status: "error", message: "Something went wrong on the server." });
}
