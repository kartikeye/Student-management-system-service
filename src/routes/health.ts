import * as Express from "express";
const router = Express.Router();

router.get("/", (req, res) => {
  res.status(200).json({ ok: true, service: "Student Management System", message: "Health check passed" });
});

export default router;
