// MIDDLEWARE: only lets certain roles through. Use it AFTER authenticate:
//   router.post("/", authenticate, requireRole("admin"), createService);
//   router.get("/", authenticate, requireRole("admin", "staff"), listCustomers);
// (Phase A only builds it. The existing Services, Customers and Pets routes do not use it yet.)
const ROLES = ["admin", "staff", "customer"];

export function requireRole(...allowedRoles) {
  // A typo like requireRole("amdin") would silently lock everyone out, so fail loudly when the route is set up.
  if (
    allowedRoles.length === 0 ||
    allowedRoles.some((role) => !ROLES.includes(role))
  ) {
    throw new Error(`requireRole needs one or more of: ${ROLES.join(", ")}.`);
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required. Please log in.",
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: "error",
        message: "You do not have permission to do this.",
      });
    }
    next();
  };
}
