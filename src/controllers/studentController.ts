import { Request, Response } from "express";
import prisma from "../config/prisma";

const parseId = (value: string | string[] | undefined) => {
  if (!value || Array.isArray(value)) return null;
  const id = Number.parseInt(value, 10);
  return Number.isNaN(id) ? null : id;
};

const isPrismaError = (error: unknown, code: string) => {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === code;
};

const createStudent = async (req: Request, res: Response) => {
  const { firstName, lastName, email, age, grade, enrollmentDate, phone, address } = req.body;

  if (!firstName || !lastName || !email) {
    return res.status(400).json({ message: "firstName, lastName, and email are required." });
  }

  try {
    const data: any = {
      firstName,
      lastName,
      email,
    };
    
    if (age !== undefined) data.age = age;
    if (grade !== undefined) data.grade = grade;
    if (enrollmentDate !== undefined) data.enrollmentDate = new Date(enrollmentDate);
    if (phone !== undefined) data.phone = phone;
    if (address !== undefined) data.address = address;

    const student = await prisma.student.create({ data });
    return res.status(201).json(student);
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      return res.status(409).json({ message: "Email already exists." });
    }
    return res.status(500).json({ message: "Failed to create student." });
  }
};

const getStudents = async (_req: Request, res: Response) => {
  try {
    const students = await prisma.student.findMany({ orderBy: { id: "asc" } });
    return res.status(200).json(students);
  } catch {
    return res.status(500).json({ message: "Failed to fetch students." });
  }
};

const getStudentById = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid student id." });
  }

  try {
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }
    return res.status(200).json(student);
  } catch {
    return res.status(500).json({ message: "Failed to fetch student." });
  }
};

const updateStudent = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid student id." });
  }

  const { firstName, lastName, email, age, grade, enrollmentDate, phone, address } = req.body;

  const data: any = {};
  
  if (firstName !== undefined) data.firstName = firstName;
  if (lastName !== undefined) data.lastName = lastName;
  if (email !== undefined) data.email = email;
  if (age !== undefined) data.age = age;
  if (grade !== undefined) data.grade = grade;
  if (enrollmentDate !== undefined) data.enrollmentDate = new Date(enrollmentDate);
  if (phone !== undefined) data.phone = phone;
  if (address !== undefined) data.address = address;

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "No valid fields provided to update." });
  }

  try {
    const student = await prisma.student.update({
      where: { id },
      data,
    });

    return res.status(200).json(student);
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return res.status(404).json({ message: "Student not found." });
    }
    if (isPrismaError(error, "P2002")) {
      return res.status(409).json({ message: "Email already exists." });
    }
    return res.status(500).json({ message: "Failed to update student." });
  }
};

const deleteStudent = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid student id." });
  }

  try {
    await prisma.student.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return res.status(404).json({ message: "Student not found." });
    }
    return res.status(500).json({ message: "Failed to delete student." });
  }
};

export {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
};