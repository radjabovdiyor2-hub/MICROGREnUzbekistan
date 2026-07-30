const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const targetDir = 'd:/MICROGREnUzbekistan/content/generated';
const files = ['jasmin-print.html', 'jasmin-a4-booklet.html'];

async function generateSvgQr(codeNum) {
  const url = `https://microgreenuzbekistan.com/m/jasmin/d/${codeNum}`;
  // SVG output for vector print rendering
  const svg = await QRCode.toString(url, {
    margin: 1,
    errorCorrectionLevel: 'M',
    type: 'svg',
    color: { dark: '#000000', light: '#ffffff' }
  });
  return svg;
}

async function updateFile(filename) {
  const filePath = path.join(targetDir, filename);
  if (!fs.existsSync(filePath)) return;

  let html = fs.readFileSync(filePath, 'utf8');

  for (let code = 1; code <= 6; code++) {
    const codeStr = String(code).padStart(2, '0'); // '01', '02', etc.
    const svgContent = await generateSvgQr(code);

    // Look for <div class="menu-code">01</div> or similar inside menu-qr
    // Pattern matches <div class="menu-qr...">...<div class="menu-code">01</div></div>
    const regex = new RegExp(`(<div class="menu-qr[^>]*>)([\\s\\S]*?)(<div class="menu-code">${codeStr}</div></div>)`, 'g');
    
    html = html.replace(regex, (match, p1, p2, p3) => {
      return `${p1}${svgContent}${p3}`;
    });
  }

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`Updated QR codes in ${filename}`);
}

async function main() {
  for (const file of files) {
    await updateFile(file);
  }
}

main().catch(console.error);
