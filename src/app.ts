import express from "express";
import healthRouter from "./routes/health";
import studentsRouter from "./routes/studentsRoute";

const app = express();

app.use(express.json()); // Middleware to parse JSON bodies
app.use("/health", healthRouter);
app.use("/students", studentsRouter);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});