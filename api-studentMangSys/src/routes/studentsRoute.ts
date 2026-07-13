import express from "express";
import {createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent
} from "../controllers/studentController";
import { authenticate, requireGroup } from "../middleware/auth";

const router = express.Router();

// Utility async handler.
const asyncHandler = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Every /students route requires a valid Cognito access token; deleting
// additionally requires membership in the "admin" group.
router.use(authenticate);

router.post("/", asyncHandler(createStudent));
router.get("/", asyncHandler(getStudents));
router.get("/:id", asyncHandler(getStudentById));
router.put("/:id", asyncHandler(updateStudent));
router.delete("/:id", requireGroup("admin"), asyncHandler(deleteStudent));

export default router;