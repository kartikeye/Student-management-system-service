import express from "express";
import cors from "cors";
import healthRouter from "./routes/health";
import studentsRouter from "./routes/studentsRoute";

const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.use("/health", healthRouter);
app.use("/students", studentsRouter);

app.get("/", (req, res) => {
  res.status(200).send("hello world");
});

app.use((req, res) => {
  console.log(`404 hit -> ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// app.get("/favicon.ico", (_req, res) => {
//   res.status(204).end();
// });


//app.get() returns an app instance not a middleware function
// const test = (req: Request, res: Response, next: NextFunction) => {
// console.log('I am testing middleware different style...')
// next();
// };
//app.use(test);

// const midTest = (req: Request, res: Response, next: NextFunction) => {
// console.log('I am testing middleware type 2 different style...')
// next();
// };
//app.use(midTest);
// app.use("/", (req, res, next) => {
//   console.log('I am middleware...');
//   next()
// });

//