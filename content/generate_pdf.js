const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Запуск генерации PDF...');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error('Ошибка запуска Playwright. Возможно, не установлены браузеры. Попробуйте выполнить "npx playwright install chromium"');
    process.exit(1);
  }

  const page = await browser.newPage();
  
  const filesToProcess = ['fresh_weekly_issue_01.html', 'fresh_weekly_issue_02.html', 'microgreen_weekly_issue_01.html'];

  for (const filename of filesToProcess) {
    const filePath = `file://${path.resolve(__dirname, filename)}`;
    console.log(`Открытие: ${filePath}`);
    
    await page.goto(filePath, { waitUntil: 'networkidle' });
    
    // Принудительно включаем печать фонов (чтобы цвета и карточки не пропали)
    await page.addStyleTag({
      content: '@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }'
    });

    const pdfFilename = filename.replace('.html', '.pdf');
    const pdfPath = path.resolve(__dirname, pdfFilename);
    
    console.log(`Генерация PDF (Формат A5) для ${filename}...`);
    await page.pdf({
      path: pdfPath,
      format: 'A5',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    console.log(`✅ Готово! PDF сохранён: ${pdfPath}`);
  }

  await browser.close();
})();
