import express from "express";
import {createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent 
} from "../controllers/studentController";

const router = express.Router();

// Utility async handler.
const asyncHandler = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.post("/", asyncHandler(createStudent));
router.get("/", asyncHandler(getStudents));
router.get("/:id", asyncHandler(getStudentById));
router.put("/:id", asyncHandler(updateStudent));
router.delete("/:id", asyncHandler(deleteStudent));

export default router;