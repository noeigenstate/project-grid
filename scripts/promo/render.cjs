// Renders scripts/promo/index.html frame by frame in an offscreen Electron window and pipes the frames to ffmpeg.
// Full film: npx electron scripts/promo/render.cjs <out.mp4>
// Stills:    npx electron scripts/promo/render.cjs --stills <dir> 1.0 5.5 10.2 …
// README:     npx electron scripts/promo/render.cjs --readme <out.webp> (animated WebP, 15 fps, 960 px wide, no film grain)
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const args = process.argv.slice(2);
  const window = new BrowserWindow({ show: false, width: 1920, height: 1080, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const readme = args[0] === '--readme';
  await window.loadFile(path.join(__dirname, 'index.html'), { query: readme ? { render: '1', clean: '1' } : { render: '1' } });
  await window.webContents.executeJavaScript('window.PROMO_RENDER = true; document.fonts.ready.then(() => true)');
  const frame = async (index, type, fps = 30) => Buffer.from((await window.webContents.executeJavaScript(`frame(${index}, '${type}', ${fps})`)).split(',')[1], 'base64');
  try {
    if (args[0] === '--stills') {
      const directory = args[1]; fs.mkdirSync(directory, { recursive: true });
      for (const seconds of args.slice(2)) fs.writeFileSync(path.join(directory, `t${seconds}.png`), await frame(Math.round(Number(seconds) * 30), 'image/png'));
    } else if (readme) {
      const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '15', '-i', '-', '-vf', 'scale=960:-1:flags=lanczos', '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', '64', '-compression_level', '6', '-loop', '0', args[1]], { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let index = 0; index < 30 * 15; index++) {
        if (!ffmpeg.stdin.write(await frame(index, 'image/jpeg', 15))) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
      }
      ffmpeg.stdin.end();
      await new Promise(resolve => ffmpeg.on('close', resolve));
    } else {
      const total = await window.webContents.executeJavaScript('FRAMES');
      const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', args[0]], { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let index = 0; index < total; index++) {
        const data = await frame(index, 'image/jpeg');
        if (!ffmpeg.stdin.write(data)) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
        if (index % 90 === 0) console.log(`frame ${index}/${total}`);
      }
      ffmpeg.stdin.end();
      await new Promise(resolve => ffmpeg.on('close', resolve));
    }
  } finally { app.exit(0); }
});
