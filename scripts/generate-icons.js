#!/usr/bin/env node

/**
 * Скрипт для генерации иконок приложения из SVG
 * Требует: sharp (npm install sharp --save-dev)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Проверяем наличие sharp
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

// Проверяем наличие SVG
if (!fs.existsSync(svgPath)) {
  console.error(`❌ SVG файл не найден: ${svgPath}`);
  process.exit(1);
}

// Размеры иконок для разных платформ
const iconSizes = [
  { size: 32, name: '32x32.png' },
  { size: 128, name: '128x128.png' },
  { size: 256, name: '128x128@2x.png' },
];

async function generatePNG(size, outputPath) {
  try {
    await sharp(svgPath)
      .resize(size, size, {
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toFile(outputPath);
    console.log(`✅ Создан: ${path.basename(outputPath)} (${size}x${size})`);
    return true;
  } catch (error) {
    console.error(`❌ Ошибка при создании ${outputPath}:`, error.message);
    return false;
  }
}

async function generateICO(outputPath) {
  try {
    // Создаем PNG версию для конвертации в ICO
    const pngPath = outputPath.replace('.ico', '_256.png');
    await sharp(svgPath)
      .resize(256, 256)
      .png()
      .toFile(pngPath);
    
    console.log(`✅ Создан: ${path.basename(pngPath)}`);
    console.log(`⚠️  Для создания .ico файла используйте онлайн-конвертер:`);
    console.log(`   https://convertio.co/png-ico/`);
    console.log(`   Или используйте готовый PNG файл для тестирования`);
    return true;
  } catch (error) {
    console.error(`❌ Ошибка при создании ICO:`, error.message);
    return false;
  }
}

async function generateICNS(outputPath) {
  try {
    // Создаем PNG версию для конвертации в ICNS
    const pngPath = outputPath.replace('.icns', '_512.png');
    await sharp(svgPath)
      .resize(512, 512)
      .png()
      .toFile(pngPath);
    
    console.log(`✅ Создан: ${path.basename(pngPath)}`);
    console.log(`⚠️  Для создания .icns файла на macOS используйте:`);
    console.log(`   iconutil -c icns icons.iconset`);
    console.log(`   Или используйте онлайн-конвертер: https://cloudconvert.com/png-to-icns`);
    return true;
  } catch (error) {
    console.error(`❌ Ошибка при создании ICNS:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🎨 Генерация иконок из SVG...\n');

  // Генерируем PNG файлы
  console.log('📱 Генерация PNG иконок...');
  let successCount = 0;
  for (const { size, name } of iconSizes) {
    const outputPath = path.join(iconsDir, name);
    if (await generatePNG(size, outputPath)) {
      successCount++;
    }
  }

  // Генерируем ICO (Windows)
  console.log('\n🪟 Генерация ICO для Windows...');
  const icoPath = path.join(iconsDir, 'icon.ico');
  await generateICO(icoPath);

  // Генерируем ICNS (macOS)
  console.log('\n🍎 Генерация ICNS для macOS...');
  const icnsPath = path.join(iconsDir, 'icon.icns');
  await generateICNS(icnsPath);

  console.log('\n✨ Генерация завершена!');
  console.log(`✅ Создано ${successCount} из ${iconSizes.length} PNG файлов`);
  console.log('\n📝 Следующие шаги:');
  console.log('   1. Конвертируйте PNG в ICO для Windows (используйте онлайн-конвертер)');
  console.log('   2. Конвертируйте PNG в ICNS для macOS (используйте iconutil или онлайн-конвертер)');
  console.log('   3. Или используйте готовые PNG файлы для тестирования');
  console.log('\n💡 Для тестирования можно использовать PNG файлы напрямую');
}

main().catch(console.error);
