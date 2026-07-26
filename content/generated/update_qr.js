const fs = require('fs');
const path = require('path');

const htmlPath = 'd:/MICROGREnUzbekistan/content/generated/jasmin-print.html';
const qrPath = 'C:/Users/noteb/.gemini/antigravity-ide/brain/4473d7bb-49fa-42ed-99da-e491ec5b9039/uploaded_media_1785038692727.png';

let html = fs.readFileSync(htmlPath, 'utf8');
const qrBase64 = fs.readFileSync(qrPath).toString('base64');
const qrDataUri = 'data:image/png;base64,' + qrBase64;

// Target dish 2 QR code inside jasmin-print.html
const startIdx = html.indexOf('<div class="h3">Tandir kabob</div>');
if (startIdx !== -1) {
  const qrStart = html.indexOf('<div class="menu-qr">', startIdx);
  const qrEnd = html.indexOf('<div class="menu-code">02</div></div>', qrStart);
  
  if (qrStart !== -1 && qrEnd !== -1) {
    const before = html.substring(0, qrStart);
    const after = html.substring(qrEnd);
    const newQrBlock = `<div class="menu-qr"><img src="${qrDataUri}" style="width:100%;height:100%;object-fit:contain;display:block;">`;
    
    html = before + newQrBlock + after;
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log('SUCCESSFULLY_UPDATED_HTML');
  } else {
    console.log('QR boundaries not found');
  }
} else {
  console.log('Dish title not found');
}
