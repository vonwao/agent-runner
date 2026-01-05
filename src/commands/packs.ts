import { loadAllPacks } from '../packs/loader.js';

/**
 * List available packs
 */
export async function packsCommand(): Promise<void> {
  const packs = loadAllPacks();

  if (packs.length === 0) {
    console.log('No packs found in the packs/ directory.');
    return;
  }

  console.log('Available packs:\n');

  const validPacks = packs.filter(p => p.validation.valid);
  const invalidPacks = packs.filter(p => !p.validation.valid);

  // Display valid packs
  for (const pack of validPacks) {
    console.log(`  ${pack.name}`);
    console.log(`    ${pack.manifest.display_name}`);
    console.log(`    ${pack.manifest.description}`);
    console.log('');
  }

  // Display invalid packs
  if (invalidPacks.length > 0) {
    console.log('Invalid packs:\n');
    for (const pack of invalidPacks) {
      console.log(`  ${pack.name} (INVALID)`);
      for (const error of pack.validation.errors) {
        console.log(`    ❌ ${error}`);
      }
      console.log('');
    }
  }

  console.log(`Total: ${validPacks.length} valid, ${invalidPacks.length} invalid`);
}
