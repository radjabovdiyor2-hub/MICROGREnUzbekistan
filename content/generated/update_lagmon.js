const fs = require('fs');
const path = require('path');

const qrSrc = 'C:/Users/noteb/.gemini/antigravity-ide/brain/4473d7bb-49fa-42ed-99da-e491ec5b9039/media__1785039717250.png';
const photoSrc = 'C:/Users/noteb/.gemini/antigravity-ide/brain/4473d7bb-49fa-42ed-99da-e491ec5b9039/media__1785039729327.jpg';

const targetDir = 'd:/MICROGREnUzbekistan/content/generated';
fs.copyFileSync(photoSrc, path.join(targetDir, 'lagmon-jasmin.jpg'));

const htmlPath = path.join(targetDir, 'jasmin-print.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const qrBase64 = fs.readFileSync(qrSrc).toString('base64');
const qrDataUri = 'data:image/png;base64,' + qrBase64;

// Update dish 3 (Lag'mon) photo and QR code in jasmin-print.html
const startIdx = html.indexOf('<div class="h3">Lag‘mon</div>');
if (startIdx !== -1) {
  // Find menu-photo before this h3
  const itemStart = html.lastIndexOf('<div class="menu-item">', startIdx);
  const photoStart = html.indexOf('<img class="menu-photo" src="', itemStart);
  const photoEnd = html.indexOf('"', photoStart + '<img class="menu-photo" src="'.length);
  
  if (itemStart !== -1 && photoStart !== -1 && photoEnd !== -1) {
    const beforePhoto = html.substring(0, photoStart + '<img class="menu-photo" src="'.length);
    const afterPhoto = html.substring(photoEnd);
    html = beforePhoto + 'lagmon-jasmin.jpg' + afterPhoto;
  }
  
  // Refind startIdx after photo modification
  const newStartIdx = html.indexOf('<div class="h3">Lag‘mon</div>');
  const qrStart = html.indexOf('<div class="menu-qr">', newStartIdx);
  const qrEnd = html.indexOf('<div class="menu-code">03</div></div>', qrStart);
  
  if (qrStart !== -1 && qrEnd !== -1) {
    const beforeQr = html.substring(0, qrStart);
    const afterQr = html.substring(qrEnd);
    const newQrBlock = `<div class="menu-qr"><img src="${qrDataUri}" style="width:100%;height:100%;object-fit:contain;display:block;">`;
    
    html = beforeQr + newQrBlock + afterQr;
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log('SUCCESS_UPDATE_LAGMON');
  } else {
    console.log('Lagmon QR boundaries not found');
  }
} else {
  console.log('Lagmon title not found');
}
