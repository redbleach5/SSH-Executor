#!/usr/bin/env node

/**
 * Скрипт для создания платформо-специфичных иконок (ICO, ICNS)
 * Использует готовые PNG файлы
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.join(__dirname, '../src-tauri/icons');

// Проверяем наличие PNG файлов
const requiredFiles = [
  '32x32.png',
  '128x128.png',
  '128x128@2x.png',
];

console.log('🔍 Проверка наличия PNG файлов...\n');

let allExist = true;
for (const file of requiredFiles) {
  const filePath = path.join(iconsDir, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`✅ ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
  } else {
    console.log(`❌ ${file} - не найден`);
    allExist = false;
  }
}

if (!allExist) {
  console.log('\n⚠️  Не все PNG файлы найдены. Запустите: npm run generate-icons');
  process.exit(1);
}

console.log('\n📝 Инструкции по созданию платформо-специфичных иконок:\n');

console.log('🪟 Windows ICO:');
console.log('   1. Откройте: https://convertio.co/png-ico/');
console.log('   2. Загрузите файл: src-tauri/icons/128x128.png');
console.log('   3. Скачайте и сохраните как: src-tauri/icons/icon.ico');
console.log('   Или используйте: https://icoconvert.com/\n');

console.log('🍎 macOS ICNS:');
console.log('   1. На macOS используйте команду:');
console.log('      mkdir -p icon.iconset');
console.log('      cp 32x32.png icon.iconset/icon_16x16.png');
console.log('      cp 32x32.png icon.iconset/icon_16x16@2x.png');
console.log('      cp 128x128.png icon.iconset/icon_128x128.png');
console.log('      cp 128x128@2x.png icon.iconset/icon_256x256.png');
console.log('      iconutil -c icns icon.iconset');
console.log('   2. Или используйте онлайн-конвертер:');
console.log('      https://cloudconvert.com/png-to-icns');
console.log('      Загрузите: src-tauri/icons/128x128@2x.png (256x256)');
console.log('      Скачайте и сохраните как: src-tauri/icons/icon.icns\n');

console.log('💡 Для разработки можно использовать только PNG файлы');
console.log('   Tauri будет работать с PNG для разработки');
console.log('   Для production сборки нужны правильные ICO/ICNS файлы\n');
console.log('⚠️  ВАЖНО: Не создавайте временные ICO/ICNS файлы как копии PNG!');
console.log('   Windows Resource Compiler требует настоящий формат ICO 3.00');
console.log('   Используйте онлайн-конвертеры для создания правильных файлов\n');

console.log('✨ Готово! PNG файлы готовы для разработки.\n');
