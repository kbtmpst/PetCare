// ROUTES: connects each URL + HTTP method of the Customers API to a controller function.
// There is no DELETE yet: pets and appointments refer to customers.
import { Router } from "express";
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
} from "../controllers/customerController.js";

const router = Router();

router.get("/", listCustomers); // GET   /api/customers
router.get("/:id", getCustomer); // GET   /api/customers/:id
router.post("/", createCustomer); // POST  /api/customers
router.put("/:id", updateCustomer); // PUT   /api/customers/:id

export default router;
