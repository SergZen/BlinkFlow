import { createHash, randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

// Replace with Postgres/Prisma later.
const deals = new Map<string, unknown>();

const CreateDeal = z.object({
  role: z.enum(["freelancer", "client"]), // invoice vs deposit path
  amount: z.number().positive(),
  title: z.string().min(1),
  criteria: z.string().min(1),
});

app.get("/health", async () => ({ ok: true }));

app.post("/deals", async (req, reply) => {
  const parsed = CreateDeal.safeParse(req.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

  const id = randomUUID();
  // 32-byte commitment written on-chain at initialize_escrow.
  const criteriaHash = createHash("sha256").update(parsed.data.criteria, "utf8").digest("hex");

  const deal = { id, ...parsed.data, criteriaHash, status: "draft" as const };
  deals.set(id, deal);
  return deal;
});

app.get("/deals/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const deal = deals.get(id);
  return deal ?? reply.status(404).send({ error: "not found" });
});

await app.listen({ port: Number(process.env.PORT ?? 8080), host: "0.0.0.0" });
