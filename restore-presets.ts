// restore-presets.ts
import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "./src/modules/db/prisma";

async function restore() {
  try {
    const backupPath = join(process.cwd(), "backup_presets.json");
    const data = JSON.parse(readFileSync(backupPath, "utf8"));

    console.log(
      `📂 Found ${data.length} presets in backup. Starting restore...`,
    );

    let restoredCount = 0;
    for (const preset of data) {
      await prisma.strategyPreset.upsert({
        where: { id: preset.id },
        update: {
          name: preset.name,
          strategyType: preset.strategyType,
          symbol: preset.symbol,
          paramsJson: preset.paramsJson,
          description: preset.description,
          backtestCount: preset.backtestCount,
          avgReturn: preset.avgReturn,
          avgWinRate: preset.avgWinRate,
          lastOptimized: preset.lastOptimized
            ? new Date(preset.lastOptimized)
            : null,
          aiConfidence: preset.aiConfidence,
          isDefault:
            preset.isDefault === 1 || preset.isDefault === true ? true : false,
        },
        create: {
          id: preset.id,
          name: preset.name,
          strategyType: preset.strategyType,
          symbol: preset.symbol,
          paramsJson: preset.paramsJson,
          description: preset.description,
          backtestCount: preset.backtestCount,
          avgReturn: preset.avgReturn,
          avgWinRate: preset.avgWinRate,
          lastOptimized: preset.lastOptimized
            ? new Date(preset.lastOptimized)
            : null,
          aiConfidence: preset.aiConfidence,
          isDefault:
            preset.isDefault === 1 || preset.isDefault === true ? true : false,
        },
      });
      restoredCount++;
    }

    console.log(`✅ Successfully restored ${restoredCount} presets`);
  } catch (error) {
    console.error("❌ Restore failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

restore();
