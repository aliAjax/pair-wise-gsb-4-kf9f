import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  Filter,
  Info,
  Plus,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  buildMarkdown,
  createManualEntry,
  MANUAL_LICENSES,
  parseManifest,
  SEED_TEXT,
  VERDICT_LABEL,
  type DepEntry,
  type Verdict,
} from './license';

const STORAGE_KEY = 'license-lens-entries-v1';

type FilterKey = Verdict | 'all';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pass', label: '兼容通过' },
  { key: 'review', label: '需要复核' },
  { key: 'conflict', label: '高风险冲突' },
];

function loadEntries(): DepEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as DepEntry[];
    }
  } catch {
    // 损坏的缓存直接回退到示例
  }
  return parseManifest(SEED_TEXT);
}

export default function App() {
  const [entries, setEntries] = useState<DepEntry[]>(loadEntries);
  const [draft, setDraft] = useState(SEED_TEXT);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);

  // 手动补录表单
  const [mName, setMName] = useState('');
  const [mVersion, setMVersion] = useState('');
  const [mLicense, setMLicense] = useState(MANUAL_LICENSES[0]);
  const [mError, setMError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const statusTimer = useRef<number | undefined>(undefined);

  // 关掉页面再回来：条目持久化在 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  useEffect(() => () => window.clearTimeout(statusTimer.current), []);

  const flash = (msg: string) => {
    setStatus(msg);
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(''), 3500);
  };

  const counts = useMemo(
    () => ({
      total: entries.length,
      pass: entries.filter((e) => e.verdict === 'pass').length,
      review: entries.filter((e) => e.verdict === 'review').length,
      conflict: entries.filter((e) => e.verdict === 'conflict').length,
    }),
    [entries],
  );

  // 搜索与筛选同时作用于结果
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== 'all' && e.verdict !== filter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.version.toLowerCase().includes(q) ||
        e.license.toLowerCase().includes(q) ||
        e.rawLicense.toLowerCase().includes(q)
      );
    });
  }, [entries, filter, query]);

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const applyManifest = (content: string, label: string) => {
    const parsed = parseManifest(content);
    if (parsed.length === 0) {
      flash('未从内容中识别出任何依赖，请检查格式（名称@版本 许可证）');
      return;
    }
    setEntries(parsed);
    setDraft(content);
    setSelectedId(parsed[0]?.id ?? null);
    flash(`${label}完成 · 共 ${parsed.length} 条依赖`);
  };

  const handleAnalyze = () => {
    const text = draft.trim();
    if (!text) {
      flash('请先粘贴依赖清单');
      return;
    }
    applyManifest(text, '分析');
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => applyManifest(String(reader.result ?? ''), `已上传 ${file.name}，`);
    reader.onerror = () => flash('文件读取失败，请重试');
    reader.readAsText(file);
  };

  const handleFile = (file?: File | null) => {
    if (file) readFile(file);
  };

  const handleManualAdd = () => {
    const name = mName.trim();
    if (!name) {
      setMError('请填写依赖名称');
      return;
    }
    if (entries.some((e) => e.name === name && e.version === (mVersion.trim() || '—'))) {
      setMError('该名称与版本已存在');
      return;
    }
    const entry = createManualEntry(name, mVersion.trim(), mLicense);
    setEntries((prev) => [...prev, entry]);
    setSelectedId(entry.id);
    setMName('');
    setMVersion('');
    setMLicense(MANUAL_LICENSES[0]);
    setMError('');
    flash(`已补录 ${entry.name}@${entry.version}，统计已更新`);
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
    flash('条目已删除，统计已更新');
  };

  const handleReset = () => {
    const seed = parseManifest(SEED_TEXT);
    setEntries(seed);
    setDraft(SEED_TEXT);
    setQuery('');
    setFilter('all');
    setSelectedId(seed[0]?.id ?? null);
    flash('已恢复为内置示例清单');
  };

  const handleExport = () => {
    if (entries.length === 0) {
      flash('当前没有可导出的条目');
      return;
    }
    const md = buildMarkdown(entries); // 覆盖当前全部条目，不受搜索/筛选影响
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `license-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    flash(`已导出 Markdown 报告（${entries.length} 条）`);
  };

  return (
    <div className="ll-app">
      <header className="ll-topbar">
        <div className="ll-brand">
          <div className="ll-logo">
            <Scale size={19} />
          </div>
          <div>
            <h1>License Lens</h1>
            <span>依赖许可证兼容性分析 · 供法务复核使用</span>
          </div>
        </div>
        <div className="ll-top-actions">
          <button className="ll-btn" onClick={handleReset}>
            <RotateCcw size={15} /> 重置示例
          </button>
          <button className="ll-btn ll-btn-primary" onClick={handleExport}>
            <Download size={15} /> 导出 Markdown
          </button>
        </div>
      </header>

      <section className="ll-summary">
        <MetricCard icon={<Eye size={16} />} label="已分析依赖" value={counts.total} tone="ink" hint="当前清单全部条目" />
        <MetricCard icon={<ShieldCheck size={16} />} label="兼容通过" value={counts.pass} tone="green" hint="MIT / Apache-2.0 / BSD-3-Clause" />
        <MetricCard icon={<AlertTriangle size={16} />} label="需要复核" value={counts.review} tone="amber" hint="Proprietary 或未知许可证" />
        <MetricCard icon={<AlertTriangle size={16} />} label="高风险冲突" value={counts.conflict} tone="red" hint="GPL-3.0 强 Copyleft" />
      </section>

      <div className="ll-grid">
        {/* 左：导入与补录 */}
        <aside className="ll-panel">
          <h3 className="ll-panel-title">导入依赖清单</h3>
          <textarea
            className="ll-textarea"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={'每行一个依赖：\nreact@18.3.1 MIT\nlodash@4.17.21 MIT'}
          />
          <button className="ll-btn ll-btn-primary ll-block" onClick={handleAnalyze}>
            <Search size={15} /> 开始分析
          </button>

          <div
            className={`ll-drop${dragging ? ' dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            <Upload size={18} />
            <div>
              拖放清单到此处，或{' '}
              <label>
                选择文件
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.json,.csv,.lock,.tsv,text/plain,application/json"
                  onChange={(e) => {
                    handleFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                  hidden
                />
              </label>
            </div>
            <small>支持 .txt / .json / .csv / .lock，也可直接粘贴 package.json</small>
          </div>
          <p className="ll-hint">
            <Info size={13} /> 每行格式为 <code>名称@版本 许可证</code>；缺省许可证的条目标记为未知，需复核。同名同版本只保留一条。
          </p>

          <div className="ll-divider">
            <span>手动补录</span>
          </div>
          <div className="ll-manual">
            <input
              value={mName}
              onChange={(e) => setMName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
              placeholder="依赖名称 *"
            />
            <input
              value={mVersion}
              onChange={(e) => setMVersion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
              placeholder="版本（如 1.0.0）"
            />
            <div className="ll-select">
              <select value={mLicense} onChange={(e) => setMLicense(e.target.value)}>
                {MANUAL_LICENSES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </div>
            <button className="ll-btn ll-btn-primary" onClick={handleManualAdd}>
              <Plus size={15} /> 添加
            </button>
          </div>
          {mError && <p className="ll-form-error">{mError}</p>}

          <div className="ll-status" role="status">
            {status}
          </div>
        </aside>

        {/* 右：结果与依据 */}
        <section className="ll-panel ll-results">
          <div className="ll-results-head">
            <h3 className="ll-panel-title">分析结果</h3>
            <span className="ll-count-note">
              {visible.length === entries.length
                ? `共 ${entries.length} 条`
                : `显示 ${visible.length} / ${entries.length} 条`}
            </span>
          </div>

          <div className="ll-toolbar">
            <div className="ll-filters">
              <Filter size={14} className="ll-filter-icon" />
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`ll-chip${filter === f.key ? ' active' : ''} ${
                    f.key !== 'all' ? ` chip-${f.key}` : ''
                  }`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                  <b>{f.key === 'all' ? counts.total : counts[f.key]}</b>
                </button>
              ))}
            </div>
            <div className="ll-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索名称 / 版本 / 许可证…"
              />
              {query && (
                <button className="ll-search-clear" onClick={() => setQuery('')} title="清除搜索">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="ll-table">
            <div className="ll-row ll-row-head">
              <div>依赖</div>
              <div>版本</div>
              <div>许可证</div>
              <div>结论</div>
              <div></div>
            </div>
            {visible.map((e) => (
              <div
                key={e.id}
                className={`ll-row ll-row-body${selectedId === e.id ? ' selected' : ''}`}
                onClick={() => setSelectedId(e.id)}
              >
                <div className="ll-pkg">
                  <div className={`ll-pkg-icon v-${e.verdict}`}>{e.name.slice(0, 1).toUpperCase()}</div>
                  <div className="ll-pkg-copy">
                    <strong>{e.name}</strong>
                    {e.source === 'manual' && <span className="ll-tag-manual">手动补录</span>}
                  </div>
                </div>
                <div className="ll-version">{e.version}</div>
                <div className="ll-license">
                  {e.license}
                  {e.rawLicense && e.license !== e.rawLicense && (
                    <small title={`原始输入：${e.rawLicense}`}>（原：{e.rawLicense}）</small>
                  )}
                </div>
                <div>
                  <span className={`ll-badge badge-${e.verdict}`}>{VERDICT_LABEL[e.verdict]}</span>
                </div>
                <div className="ll-inspect">
                  <Eye size={14} /> 查看依据
                </div>
              </div>
            ))}
            {visible.length === 0 && (
              <div className="ll-empty">
                {entries.length === 0
                  ? '清单为空，请在左侧粘贴、上传或手动补录依赖'
                  : '没有匹配当前搜索与筛选条件的条目'}
              </div>
            )}
          </div>

          <div className="ll-notice">
            <AlertTriangle size={15} />
            <div>
              <b>兼容性判定规则</b>
              <br />
              MIT、Apache-2.0、BSD-3-Clause 视为兼容通过；GPL-3.0 为高风险冲突；Proprietary 与未知许可证需法务复核。
              自动结论仅供初审参考，正式发布前请以法务意见为准。
            </div>
          </div>

          {selected && (
            <div className="ll-details">
              <div className="ll-details-head">
                <div>
                  <span className={`ll-badge badge-${selected.verdict}`}>{VERDICT_LABEL[selected.verdict]}</span>
                  <h4>
                    {selected.name} <span className="ll-version">@ {selected.version}</span>
                  </h4>
                  <small>
                    许可证标识 <code>{selected.license}</code>
                    {selected.source === 'manual' ? ' · 手动补录' : ' · 清单导入'}
                  </small>
                </div>
                <div className="ll-details-actions">
                  <button className="ll-icon-btn" onClick={() => removeEntry(selected.id)} title="删除条目">
                    <Trash2 size={15} />
                  </button>
                  <button className="ll-icon-btn" onClick={() => setSelectedId(null)} title="收起依据">
                    <X size={15} />
                  </button>
                </div>
              </div>
              <div className="ll-basis">
                <p className="ll-basis-label">判定依据</p>
                <ul>
                  {selected.basis.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
                <p className="ll-basis-foot">
                  依据来源：清单中声明的许可证标识（SPDX）与该许可证的标准分发条款；不代表对具体商业合同的解读。
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'ink' | 'green' | 'amber' | 'red';
  hint: string;
}) {
  return (
    <div className={`ll-metric tone-${tone}`}>
      <div className="ll-metric-top">
        <span className="ll-metric-icon">{icon}</span>
        <small>{label}</small>
      </div>
      <b>{value}</b>
      <p>{hint}</p>
    </div>
  );
}
