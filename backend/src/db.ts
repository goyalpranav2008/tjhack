import { PrismaClient } from "@prisma/client";

// Single shared Prisma instance for the process
const prisma = new PrismaClient();

export default prisma;
