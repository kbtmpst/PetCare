// TEST HELPER: a tiny fake Express router, so route rules can be tested without Express or MySQL.
// It records router.use / get / post / put / patch / delete calls and runs them in the same order Express would.
// (Used by customerRoutes.test.js. serviceRoutes.test.js still has its own copy.)

// Records every router.use(...) and router.get/post/put/patch/delete(...) call, in order.
export function createFakeRouter() {
  const stack = [];
  const addRoute =
    (method) =>
    (path, ...handlers) =>
      stack.push({ method, path, handlers });
  return {
    stack,
    use: (...handlers) => stack.push({ method: null, path: null, handlers }), // method null = runs for every request
    get: addRoute("GET"),
    post: addRoute("POST"),
    put: addRoute("PUT"),
    patch: addRoute("PATCH"),
    delete: addRoute("DELETE"),
  };
}

// "/:id/status" matches "/5/status". Returns the params ({ id: "5" }) or null when it does not match.
export function matchPath(routePath, requestPath) {
  const routeParts = routePath.split("/");
  const requestParts = requestPath.split("/");
  if (routeParts.length !== requestParts.length) return null;
  const params = {};
  for (let i = 0; i < routeParts.length; i++) {
    if (routeParts[i].startsWith(":"))
      params[routeParts[i].slice(1)] = requestParts[i];
    else if (routeParts[i] !== requestParts[i]) return null;
  }
  return params;
}

// Sends one fake request through the recorded routes, like Express does:
// each matching entry runs its handlers in order, and the request stops as soon as something answers.
// Returns { status, body, error, fellThrough }. fellThrough = true means no route answered (Express would use notFound).
export async function sendRequest(
  router,
  method,
  path,
  { headers = {}, body } = {},
) {
  const req = { method, headers, body, query: {}, params: {} };
  const outcome = { status: null, body: null, error: null, fellThrough: false };

  for (const entry of router.stack) {
    let params = {};
    if (entry.method !== null) {
      if (entry.method !== method) continue;
      params = matchPath(entry.path, path);
      if (params === null) continue;
    }
    req.params = params;

    for (const handler of entry.handlers) {
      const step = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(new Error("a handler neither answered nor called next()")),
          1000,
        );
        const done = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
        const res = {
          status(code) {
            outcome.status = code;
            return this;
          },
          json(responseBody) {
            outcome.body = responseBody;
            done({ answered: true });
            return this;
          },
        };
        handler(req, res, (error) => done({ error: error ?? null }));
      });

      if (step.answered) return outcome;
      if (step.error) {
        outcome.error = step.error;
        return outcome;
      }
    }
  }

  outcome.fellThrough = true;
  return outcome;
}
