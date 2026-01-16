import { PrismaClient } from "@generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const prismaClientSingleton = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not defined");

  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({ adapter: adapter as any });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
