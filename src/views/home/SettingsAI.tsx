import { useCallback, useEffect, useState } from 'react'
import { useSettingsStore } from '@/stores/settings'
import { Ico } from './icon'
import { DEFAULT_AI_MODEL, AI_PROTOCOLS, DEEPSEEK_FALLBACK_MODELS } from '@/constants/ai'
import { fetchCustomAIModels, getDefaultBaseURL, getDefaultModelId } from '@/lib/aiProvider'
import { SettingsSelect } from './SettingsControls'
import { AIIntroVideo } from './AIIntroVideo'

export function SettingsAI() {
  const aiEnabled = useSettingsStore((s) => s.aiEnabled)
  const setAiEnabled = useSettingsStore((s) => s.setAiEnabled)
  const aiAllowCreateGroup = useSettingsStore((s) => s.aiAllowCreateGroup)
  const setAiAllowCreateGroup = useSettingsStore((s) => s.setAiAllowCreateGroup)
  const aiAllowCreateSubGroup = useSettingsStore((s) => s.aiAllowCreateSubGroup)
  const setAiAllowCreateSubGroup = useSettingsStore((s) => s.setAiAllowCreateSubGroup)
  const aiSelectedModelId = useSettingsStore((s) => s.aiSelectedModelId)
  const setAiSelectedModelId = useSettingsStore((s) => s.setAiSelectedModelId)
  const aiProtocol = useSettingsStore((s) => s.aiProtocol)
  const setAiProtocol = useSettingsStore((s) => s.setAiProtocol)
  const aiCustomBaseURL = useSettingsStore((s) => s.aiCustomBaseURL)
  const aiCustomApiKey = useSettingsStore((s) => s.aiCustomApiKey)
  const aiCustomModelOptions = useSettingsStore((s) => s.aiCustomModelOptions)
  const setAiCustomCredentials = useSettingsStore((s) => s.setAiCustomCredentials)
  const saveAiCustomConfig = useSettingsStore((s) => s.saveAiCustomConfig)

  const protocolDefaultModel = getDefaultModelId(aiProtocol)
  const modelOptions = aiCustomModelOptions.length > 0
    ? aiCustomModelOptions
    : aiProtocol === 'deepseek'
      ? DEEPSEEK_FALLBACK_MODELS.map((item) => ({ ...item }))
      : [{ id: protocolDefaultModel, label: protocolDefaultModel }]

  // 自愈：选中模型若不在可选项内（如换协议后旧模型 id 残留），归一到首个可选项。
  useEffect(() => {
    if (!modelOptions.some((m) => m.id === aiSelectedModelId)) {
      setAiSelectedModelId(modelOptions[0]?.id ?? protocolDefaultModel)
    }
  }, [aiSelectedModelId, modelOptions, protocolDefaultModel, setAiSelectedModelId])

  // Base URL / API Key 本地草稿 + 拉取模型列表状态
  const protocolDefaultBaseURL = getDefaultBaseURL(aiProtocol)
  const [baseUrlDraft, setBaseUrlDraft] = useState(aiCustomBaseURL || protocolDefaultBaseURL)
  const [apiKeyDraft, setApiKeyDraft] = useState(aiCustomApiKey)
  const [showApiKey, setShowApiKey] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelFetchHint, setModelFetchHint] = useState<{ ok: boolean; msg: string } | null>(null)
  useEffect(() => {
    setModelFetchHint(null)
    setShowApiKey(false)
  }, [aiProtocol])
  useEffect(() => {
    setBaseUrlDraft(aiCustomBaseURL)
  }, [aiCustomBaseURL, protocolDefaultBaseURL])
  useEffect(() => {
    setApiKeyDraft(aiCustomApiKey)
  }, [aiCustomApiKey])

  /** 失焦 / 切换协议前保存 Base URL / API Key，不强制重新拉模型。 */
  const persistDraftCredentials = useCallback(() => {
    const apiKey = apiKeyDraft.trim()
    const baseURL = baseUrlDraft.trim() || protocolDefaultBaseURL
    if (apiKey === aiCustomApiKey && baseURL === (aiCustomBaseURL || protocolDefaultBaseURL)) return
    saveAiCustomConfig({
      baseURL,
      apiKey,
      modelOptions: aiCustomModelOptions
    })
  }, [
    apiKeyDraft,
    baseUrlDraft,
    protocolDefaultBaseURL,
    aiCustomBaseURL,
    aiCustomApiKey,
    aiCustomModelOptions,
    saveAiCustomConfig
  ])

  const handleSelectProtocol = useCallback(
    (protocol: typeof aiProtocol) => {
      if (protocol === aiProtocol) return
      // 先把当前协议草稿写回独立槽位，再切协议
      persistDraftCredentials()
      setAiProtocol(protocol)
    },
    [aiProtocol, persistDraftCredentials, setAiProtocol]
  )

  const handleFetchModels = useCallback(async () => {
    const apiKey = apiKeyDraft.trim()
    const baseURL = baseUrlDraft.trim() || protocolDefaultBaseURL
    if (!apiKey) {
      setModelFetchHint({ ok: false, msg: '请先填写 API Key' })
      return
    }
    setFetchingModels(true)
    setModelFetchHint(null)
    try {
      const models = await fetchCustomAIModels({
        baseURL,
        apiKey,
        protocol: aiProtocol
      })
      saveAiCustomConfig({ baseURL, apiKey, modelOptions: models })
      setModelFetchHint({ ok: true, msg: `已获取 ${models.length} 个模型` })
    } catch (err) {
      setModelFetchHint({ ok: false, msg: err instanceof Error ? err.message : '获取模型列表失败' })
    } finally {
      setFetchingModels(false)
    }
  }, [apiKeyDraft, baseUrlDraft, protocolDefaultBaseURL, aiProtocol, saveAiCustomConfig])

  if (!aiEnabled) {
    return (
      <div className="set-section set-section--ai" id="set-ai">
        <div className="ai-intro">
          <button type="button" className="btn btn-ai ai-intro-start" onClick={() => setAiEnabled(true)}>
            <Ico name="sparkles" />
            启动 AI
          </button>
          <AIIntroVideo />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="set-section set-section--ai" id="set-ai">
        <h2><Ico name="sparkles" />AI 助手</h2>
        <div className="set-card set-card--ai">
          <div className="set-ai-body">
            <div className="set-row">
              <div><div className="rt">AI 功能</div></div>
              <div
                className={`g-switch${aiEnabled ? ' on' : ''}`}
                role="switch"
                aria-checked={aiEnabled}
                aria-label="AI 功能"
                onClick={() => setAiEnabled(!aiEnabled)}
              />
            </div>

            {aiEnabled ? (
            <>
                <div className="ai-prov-label">选择协议</div>
                <div className="ai-prov-grid">
                  {AI_PROTOCOLS.map((p) => (
                    <div
                      key={p.id}
                      className={`ai-prov-card${aiProtocol === p.id ? ' on' : ''}`}
                      onClick={() => handleSelectProtocol(p.id)}
                    >
                      <div className="ai-prov-name"><span className="ai-prov-dot" />{p.label}</div>
                    </div>
                  ))}
                </div>

                <div className="ai-prov-fields">
                  <div>
                    <label className="ai-fld-lbl">Base URL</label>
                    <input
                      className="ai-fld-input"
                      type="text"
                      value={baseUrlDraft}
                      placeholder={protocolDefaultBaseURL}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      onChange={(e) => {
                        const baseURL = e.target.value
                        setBaseUrlDraft(baseURL)
                        setAiCustomCredentials({ baseURL, apiKey: apiKeyDraft })
                      }}
                      onBlur={persistDraftCredentials}
                    />
                  </div>
                  <div>
                    <label className="ai-fld-lbl">API Key</label>
                    <div className="ai-fld-row">
                      <div className="ai-fld-input-wrap">
                        <input
                          className="ai-fld-input ai-fld-input--key"
                          type={showApiKey ? 'text' : 'password'}
                          value={apiKeyDraft}
                          placeholder={aiProtocol === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                          spellCheck={false}
                          autoCapitalize="off"
                          autoCorrect="off"
                          autoComplete="off"
                          onChange={(e) => {
                            const apiKey = e.target.value
                            setApiKeyDraft(apiKey)
                            setAiCustomCredentials({ baseURL: baseUrlDraft, apiKey })
                          }}
                          onBlur={persistDraftCredentials}
                        />
                        <button
                          type="button"
                          className="ai-fld-eye"
                          aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                          title={showApiKey ? '隐藏' : '显示'}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setShowApiKey((v) => !v)}
                        >
                          <Ico name={showApiKey ? 'eye-off' : 'eye'} />
                        </button>
                      </div>
                      <button
                        className="btn btn-ai"
                        style={{ height: 36, whiteSpace: 'nowrap', flexShrink: 0 }}
                        disabled={fetchingModels || !apiKeyDraft.trim()}
                        onClick={handleFetchModels}
                      >
                        <Ico name={fetchingModels ? 'loader' : 'refresh-cw'} className={fetchingModels ? 'spin' : ''} />
                        {fetchingModels ? '获取中…' : '拉取模型'}
                      </button>
                    </div>
                    {modelFetchHint && (
                      <div className={`ai-fld-hint ${modelFetchHint.ok ? 'ok' : 'err'}`}>
                        <Ico name={modelFetchHint.ok ? 'check-circle' : 'alert-circle'} />
                        {modelFetchHint.msg}
                      </div>
                    )}
                  </div>
                </div>
            </>
            ) : null}

            {aiEnabled ? (
            <div className="set-row">
              <div><div className="rt">模型</div><div className="rd">用于生成元数据的对话模型</div></div>
              <SettingsSelect
                wide
                icon="cpu"
                value={aiSelectedModelId || protocolDefaultModel || DEFAULT_AI_MODEL}
                options={modelOptions.map((m) => ({ id: m.id, label: m.label || m.id }))}
                onChange={setAiSelectedModelId}
              />
            </div>
            ) : null}

            {aiEnabled ? (
            <>
            <div className="set-row">
              <div><div className="rt">允许新建主分组</div></div>
              <div
                className={`g-switch${aiAllowCreateGroup ? ' on' : ''}`}
                role="switch"
                aria-checked={aiAllowCreateGroup}
                aria-label="允许新建主分组"
                onClick={() => setAiAllowCreateGroup(!aiAllowCreateGroup)}
              />
            </div>
            <div className="set-row">
              <div><div className="rt">允许新建子分组</div></div>
              <div
                className={`g-switch${aiAllowCreateSubGroup ? ' on' : ''}`}
                role="switch"
                aria-checked={aiAllowCreateSubGroup}
                aria-label="允许新建子分组"
                onClick={() => setAiAllowCreateSubGroup(!aiAllowCreateSubGroup)}
              />
            </div>
            </>
            ) : null}

          </div>
        </div>
      </div>
    </>
  )
}
