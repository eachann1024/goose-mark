/**
 * ExtensionPage — 浏览器拓展配置跳页
 * 展示 goose-marks 浏览器扩展的安装与连接说明
 */
import { Ico } from './icon'

interface ExtensionPageProps {
  onBack: () => void
}

export default function ExtensionPage({ onBack }: ExtensionPageProps) {
  return (
    <div className="formpage" style={{ display: 'flex' }}>
      <div className="form-head">
        <button className="back-btn" onClick={onBack}>
          <Ico name="arrow-left" />
        </button>
        <span className="ic"><Ico name="refresh-cw" /></span>
        <h1>浏览器拓展</h1>
      </div>
      <div className="form-body" style={{ overflow: 'auto', flex: 1 }}>
        <div className="set-wrap" style={{ padding: '24px 0', gap: 24 }}>

          <div className="set-section">
            <h2><Ico name="download" />安装拓展</h2>
            <div className="set-card">
              <div className="set-row">
                <div>
                  <div className="rt">Chrome / Edge</div>
                  <div className="rd">在 Chrome 应用商店搜索「鹅的书签」，点击「添加至 Chrome」</div>
                </div>
              </div>
              <div className="set-row">
                <div>
                  <div className="rt">手动安装（开发者模式）</div>
                  <div className="rd">下载 .zip 包 → 解压 → 浏览器地址栏输入 chrome://extensions → 开启开发者模式 → 加载已解压的扩展程序</div>
                </div>
              </div>
            </div>
          </div>

          <div className="set-section">
            <h2><Ico name="plug" />连接 uTools 插件</h2>
            <div className="set-card">
              <div className="set-row">
                <div>
                  <div className="rt">工作原理</div>
                  <div className="rd">浏览器拓展通过本地 WebSocket 与 uTools 中的「鹅的书签」插件通信，实现「一键保存当前页」功能</div>
                </div>
              </div>
              <div className="set-row">
                <div>
                  <div className="rt">连接步骤</div>
                  <div className="rd">① 确保 uTools 插件已打开 → ② 点击浏览器工具栏中的鹅图标 → ③ 连接成功后图标变为绿色</div>
                </div>
              </div>
              <div className="set-row">
                <div>
                  <div className="rt">连接端口</div>
                  <div className="rd">默认监听 localhost:37523，如遇端口冲突可在插件设置中修改</div>
                </div>
              </div>
            </div>
          </div>

          <div className="set-section">
            <h2><Ico name="keyboard" />快捷键</h2>
            <div className="set-card">
              <div className="set-row">
                <div>
                  <div className="rt">保存当前页</div>
                  <div className="rd">点击拓展图标，或使用自定义快捷键（在浏览器扩展快捷键设置中配置）</div>
                </div>
              </div>
              <div className="set-row">
                <div>
                  <div className="rt">AI 快捷保存</div>
                  <div className="rd">需同时开启 AI 助手，保存时自动提取标题、描述并推荐分类</div>
                </div>
              </div>
            </div>
          </div>

          <div className="set-section">
            <h2><Ico name="circle-help" />常见问题</h2>
            <div className="set-card">
              <div className="set-row">
                <div>
                  <div className="rt">图标显示灰色/断开</div>
                  <div className="rd">请确认 uTools 已启动且「鹅的书签」插件已打开，再点击图标重试连接</div>
                </div>
              </div>
              <div className="set-row">
                <div>
                  <div className="rt">保存后分类不对</div>
                  <div className="rd">可在书签列表中右键 → 编辑 调整分类，或开启 AI 推荐自动整理</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
