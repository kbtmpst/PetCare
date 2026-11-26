// MIDDLEWARE: lets a controller be an "async" function without crashing the request when it fails.
// If the wrapped function throws, the error is passed to errorHandler (which answers with a JSON 500).
export function asyncHandler(controller) {
  return (req, res, next) => {
    Promise.resolve(controller(req, res, next)).catch(next);
  };
}
