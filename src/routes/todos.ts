import { Router } from "express";
import prisma from "../lib/prisma.js";

const router = Router();

// POST /api/todos  { title: string }
router.post("/", async (req, res) => {
  try {
    const { title } = req.body ?? {};
    if (typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({ error: "title is required (non-empty string)" });
    }
    const todo = await prisma.todo.create({ data: { title: title.trim() } });
    return res.status(201).json(todo);
  } catch (err) {
    console.error("POST /todos error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/todos
router.get("/", async (_req, res) => {
  try {
    const list = await prisma.todo.findMany({ orderBy: { id: "desc" } });
    return res.json(list);
  } catch (err) {
    console.error("GET /todos error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// PUT /api/todos/:id  { title?: string, completed?: boolean }
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "invalid id" });
    }
    const { title, completed } = req.body ?? {};
    const data: { title?: string; completed?: boolean } = {};

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        return res.status(400).json({ error: "title must be non-empty string" });
      }
      data.title = title.trim();
    }
    if (completed !== undefined) {
      if (typeof completed !== "boolean") {
        return res.status(400).json({ error: "completed must be boolean" });
      }
      data.completed = completed;
    }
    if (!("title" in data) && !("completed" in data)) {
      return res.status(400).json({ error: "no updatable fields provided" });
    }

    const updated = await prisma.todo.update({ where: { id }, data });
    return res.json(updated);
  } catch (err: any) {
    console.error("PUT /todos error:", err);
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "todo not found" });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

// DELETE /api/todos/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "invalid id" });
    }
    await prisma.todo.delete({ where: { id } });
    return res.status(204).send();
  } catch (err: any) {
    console.error("DELETE /todos error:", err);
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "todo not found" });
    }
    return res.status(500).json({ error: "internal_error" });
  }
});

export default router;
