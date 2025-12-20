import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const rootDir = path.resolve('.');

if (!fs.existsSync(distDir)) {
  console.error('❌ dist 目录不存在，请先执行构建');
  process.exit(1);
}

try {
  // 1. 复制 preload.js
  // 检查源文件是否存在
  const preloadSrc = path.join(rootDir, 'preload/preload.js');
  if (fs.existsSync(preloadSrc)) {
      fs.copyFileSync(preloadSrc, path.join(distDir, 'preload.js'));
      console.log('✅ preload.js 已复制');
  } else {
      console.warn('⚠️ 未找到 preload/preload.js');
  }

  // 2. 复制 logo.png
  const logoSrc = path.join(rootDir, 'logo.png');
  if (fs.existsSync(logoSrc)) {
      fs.copyFileSync(logoSrc, path.join(distDir, 'logo.png'));
      console.log('✅ logo.png 已复制');
  } else {
      console.warn('⚠️ 未找到 logo.png');
  }

  // 3. 复制 browser.html
  const browserSrc = path.join(rootDir, 'browser.html');
  if (fs.existsSync(browserSrc)) {
      fs.copyFileSync(browserSrc, path.join(distDir, 'browser.html'));
      console.log('✅ browser.html 已复制');
  } else {
      console.warn('⚠️ 未找到 browser.html');
  }

  // 4. 处理并复制 plugin.json
  const pluginConfigPath = path.join(rootDir, 'plugin.json');
  if (fs.existsSync(pluginConfigPath)) {
      const pluginConfig = JSON.parse(fs.readFileSync(pluginConfigPath, 'utf-8'));
      
      // 修改为生产环境路径
      pluginConfig.main = 'index.html';
      pluginConfig.preload = 'preload.js';
      
      // 写入到 dist
      fs.writeFileSync(path.join(distDir, 'plugin.json'), JSON.stringify(pluginConfig, null, 2));
      console.log('✅ plugin.json 已生成并配置为生产路径');
  } else {
       console.error('❌ 未找到根目录 plugin.json');
  }

  console.log('🎉 uTools 发布文件准备就绪！请直接打包 dist 目录。');

} catch (e) {
  console.error('❌ 处理出错:', e);
  process.exit(1);
}
