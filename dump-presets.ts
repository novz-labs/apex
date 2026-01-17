import { prisma } from "./src/modules/db/prisma";

async function backup() {
  const presets = await prisma.strategyPreset.findMany();
  console.log(JSON.stringify(presets, null, 2));
  await prisma.$disconnect();
}

backup();
