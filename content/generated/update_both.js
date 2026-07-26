const fs = require('fs');
const path = require('path');

const qrSrc = 'C:/Users/noteb/.gemini/antigravity-ide/brain/4473d7bb-49fa-42ed-99da-e491ec5b9039/media__1785039389278.png';
const photoSrc = 'C:/Users/noteb/.gemini/antigravity-ide/brain/4473d7bb-49fa-42ed-99da-e491ec5b9039/media__1785039432101.jpg';

const targetDir = 'd:/MICROGREnUzbekistan/content/generated';
fs.copyFileSync(photoSrc, path.join(targetDir, 'tandir-kabob-jasmin.jpg'));

const htmlPath = path.join(targetDir, 'jasmin-print.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const qrBase64 = fs.readFileSync(qrSrc).toString('base64');
const qrDataUri = 'data:image/png;base64,' + qrBase64;

// Find dish 2 in jasmin-print.html
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
    console.log('SUCCESS_UPDATE_BOTH');
  } else {
    console.log('QR boundaries not found');
  }
} else {
  console.log('Dish title not found');
}
