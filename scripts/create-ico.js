#!/usr/bin/env node

/**
 * Скрипт для создания правильного ICO файла из PNG
 * Использует to-ico для создания валидного ICO формата 3.00
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Проверяем наличие to-ico
let toIco;
try {
  toIco = (await import('to-ico')).default;
} catch (e) {
  console.error('❌ Ошибка: to-ico не установлен');
  console.log('📦 Установите to-ico: npm install to-ico --save-dev');
  process.exit(1);
}

// Проверяем наличие sharp для создания разных размеров
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch (e) {
  console.error('❌ Ошибка: sharp не установлен');
  console.log('📦 Установите sharp: npm install sharp --save-dev');
  process.exit(1);
}

const iconsDir = path.join(__dirname, '../src-tauri/icons');
const svgPath = path.join(iconsDir, 'icon.svg');
const pngPath = path.join(iconsDir, '128x128.png');
const icoPath = path.join(iconsDir, 'icon.ico');

// Проверяем наличие исходного файла
if (!fs.existsSync(pngPath) && !fs.existsSync(svgPath)) {
  console.error(`❌ Исходные файлы не найдены`);
  console.log('💡 Сначала запустите: npm run generate-icons');
  process.exit(1);
}

console.log('🔄 Создание правильного ICO файла (формат 3.00)...\n');

try {
  // Создаем несколько размеров для ICO (16, 32, 48, 64, 128, 256)
  // Resource Compiler требует BMP формат, не PNG
  const sizes = [16, 32, 48, 64, 128, 256];
  const buffers = [];
  
  const sourcePath = fs.existsSync(svgPath) ? svgPath : pngPath;
  
  console.log('📐 Генерация изображений разных размеров...');
  for (const size of sizes) {
    const buffer = await sharp(sourcePath)
      .resize(size, size)
      .png()
      .toBuffer();
    buffers.push(buffer);
    console.log(`   ✅ ${size}x${size}`);
  }
  
  console.log('\n🔄 Конвертация в ICO формат 3.00...');
  // to-ico создает правильный ICO с BMP данными
  const icoBuffer = await toIco(buffers, {
    sizes: sizes.map(s => [s, s])
  });
  
  fs.writeFileSync(icoPath, icoBuffer);
  
  const stats = fs.statSync(icoPath);
  console.log(`\n✅ Создан: icon.ico (${(stats.size / 1024).toFixed(2)} KB)`);
  console.log('   Формат: ICO 3.00 (совместим с Windows Resource Compiler)');
  console.log('   Размеры: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256\n');
  
} catch (error) {
  console.error('❌ Ошибка при создании ICO:', error.message);
  console.log('\n💡 Альтернативное решение:');
  console.log('   1. Используйте онлайн-конвертер: https://convertio.co/png-ico/');
  console.log('   2. Загрузите: src-tauri/icons/128x128.png');
  console.log('   3. Убедитесь, что выбран формат ICO (не PNG)');
  console.log('   4. Скачайте и сохраните как: src-tauri/icons/icon.ico\n');
  process.exit(1);
}
