import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  FileDown,
  FileUp,
  Plus,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
} from 'lucide-react';

type Verdict = 'ok' | 'review' | 'risk';

type Entry = {
  id: string;
  name: string;
  version: string;
  license: string;
  verdict: Verdict;
  reason: string;
};

const STORAGE_KEY = 'license-lens-entries-v1';

const SEED_TEXT = [
  'react@18.3.1 MIT',
  'lodash@4.17.21 MIT',
  'sharp@0.33.4 Apache-2.0',
  'some-proprietary@1.0.0 Proprietary',
  'legacy-gpl@2.4.0 GPL-3.0',
  'axios@1.7.2 MIT',
  'zod@3.23.8 MIT',
  'font-awesome@6.5.2 CC-BY-4.0',
].join('\n');

const VERDICT_LABEL: Record<Verdict, string> = {
  ok: '兼容通过',
  review: '需复核',
  risk: '高风险',
};

const OK_REASON =
  '宽松许可证，保留版权声明与许可证文本后即可随项目分发，与本项目分发方式兼容。';
const RISK_REASON =
  '强 Copyleft 许可证，衍生作品需以相同许可证公开源码，可能与商业分发方式冲突。';
const PROPRIETARY_REASON =
  '专有许可证，需确认授权范围、再分发权利与使用限制后再下结论。';
const UNKNOWN_REASON =
  '未识别的许可证，需要人工确认许可证文本与项目使用方式是否兼容。';

let idCounter = 0;
const nextId = () => `${Date.now().toString(36)}-${idCounter++}`;

function classify(rawLicense: string): { license: string; verdict: Verdict; reason: string } {
  const license = rawLicense.trim() || 'Unknown';
  const norm = license.toLowerCase().replace(/[\s_]+/g, '');

  if (norm === 'mit' || norm === 'apache-2.0' || norm === 'apache2.0' || norm === 'bsd-3-clause') {
    return { license, verdict: 'ok', reason: OK_REASON };
  }
  if (/^(agpl|gpl|gplv?2|gplv?3)(-?\d+(\.\d+)?)?(-only|-or-later)?$/.test(norm) || norm.startsWith('gpl')) {
    return { license, verdict: 'risk', reason: RISK_REASON };
  }
  if (norm === 'proprietary' || norm === 'commercial' || norm === 'unlicensed') {
    return { license, verdict: 'review', reason: PROPRIETARY_REASON };
  }
  return { license, verdict: 'review', reason: UNKNOWN_REASON };
}

function makeEntry(name: string, version: string, rawLicense: string): Entry {
  const { license, verdict, reason } = classify(rawLicense);
  return { id: nextId(), name, version, license, verdict, reason };
}

function parseLine(line: string): Entry | null {
  const s = line.trim();
  if (!s || s.startsWith('#') || s.startsWith('//')) return null;

  // 支持 CSV 形式：name,version,license
  const csv = s.match(/^([^,@\s]+)\s*,\s*([^,\s]+)\s*,\s*(.+)$/);
  if (csv) return makeEntry(csv[1], csv[2], csv[3]);

  // 标准形式：name@version license（兼容 @scope/name@version）
  const full = s.match(/^(.+?)@([^\s@]+)\s+(.+)$/);
  if (full) return makeEntry(full[1], full[2], full[3]);

  // 只有 name@version，没有声明许可证
  const noLic = s.match(/^(.+?)@([^\s@]+)$/);
  if (noLic) return makeEntry(noLic[1], noLic[2], 'Unknown');

  // 只有名称
  return makeEntry(s, '—', 'Unknown');
}

function parseManifest(text: string): { entries: Entry[]; note: string } {
  const trimmed = text.trim();
  if (!trimmed) return { entries: [], note: '没有可分析的内容' };

  // package.json：提取 dependencies / devDependencies，许可证待人工确认
  if (trimmed.startsWith('{')) {
    try {
      const pkg = JSON.parse(trimmed) as Record<string, unknown>;
      const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
      const entries: Entry[] = [];
      for (const key of sections) {
        const deps = pkg[key];
        if (deps && typeof deps === 'object') {
          for (const [name, version] of Object.entries(deps as Record<string, string>)) {
            entries.push(makeEntry(name, String(version), 'Unknown'));
          }
        }
      }
      if (entries.length > 0) {
        return { entries, note: `已从 package.json 提取 ${entries.length} 条依赖，许可证均需人工确认` };
      }
      return { entries: [], note: 'JSON 中未找到 dependencies 字段' };
    } catch {
      return { entries: [], note: 'JSON 解析失败，请检查文件内容' };
    }
  }

  const entries = trimmed
    .split(/\r?\n/)
    .map(parseLine)
    .filter((e): e is Entry => e !== null);
  return { entries, note: `分析完成 · 已检查 ${entries.length} 条依赖` };
}

const seedEntries = () => parseManifest(SEED_TEXT).entries;

function loadEntries(): Entry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Entry[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* 数据损坏时回退到示例 */
  }
  return seedEntries();
}

export default function App() {
  const [entries, setEntries] = useState<Entry[]>(loadEntries);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<'all' | Verdict>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualVersion, setManualVersion] = useState('');
  const [manualLicense, setManualLicense] = useState('MIT');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const stats = useMemo(
    () => ({
      total: entries.length,
      ok: entries.filter(e => e.verdict === 'ok').length,
      review: entries.filter(e => e.verdict === 'review').length,
      risk: entries.filter(e => e.verdict === 'risk').length,
    }),
    [entries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(
      e =>
        (filter === 'all' || e.verdict === filter) &&
        (!q || e.name.toLowerCase().includes(q) || e.license.toLowerCase().includes(q)),
    );
  }, [entries, filter, query]);

  const selected = entries.find(e => e.id === selectedId) ?? null;

  const analyze = (text: string) => {
    const { entries: parsed, note } = parseManifest(text);
    if (parsed.length > 0) {
      setEntries(parsed);
      setSelectedId(null);
      setFilter('all');
    }
    setStatus(note);
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setInput(text);
      analyze(text);
    };
    reader.readAsText(file);
  };

  const addManual = () => {
    const name = manualName.trim();
    if (!name) return;
    const entry = makeEntry(name, manualVersion.trim() || '1.0.0', manualLicense);
    setEntries(prev => [...prev, entry]);
    setSelectedId(entry.id);
    setManualName('');
    setManualVersion('');
    setStatus(`已添加 ${entry.name} · 结论：${VERDICT_LABEL[entry.verdict]}`);
  };

  const reset = () => {
    setEntries(seedEntries());
    setInput(SEED_TEXT);
    setSelectedId(null);
    setFilter('all');
    setQuery('');
    setStatus('已恢复示例数据');
  };

  const exportMarkdown = () => {
    const md = [
      '# License Lens 分析报告',
      '',
      `- 生成时间：${new Date().toLocaleString('zh-CN')}`,
      `- 已分析依赖：${stats.total} · 兼容通过：${stats.ok} · 需要复核：${stats.review} · 高风险冲突：${stats.risk}`,
      '',
      '| 依赖 | 版本 | 许可证 | 结论 | 依据 |',
      '| --- | --- | --- | --- | --- |',
      ...entries.map(e => `| ${e.name} | ${e.version} | ${e.license} | ${VERDICT_LABEL[e.verdict]} | ${e.reason} |`),
      '',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'license-report.md';
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Markdown 报告已导出 · 覆盖全部 ${entries.length} 条依赖`);
  };

  const FILTERS: { key: 'all' | Verdict; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: stats.total },
    { key: 'ok', label: '兼容通过', count: stats.ok },
    { key: 'review', label: '需复核', count: stats.review },
    { key: 'risk', label: '高风险', count: stats.risk },
  ];

  return (
    <main className="app">
      <header className="top">
        <div className="brand">
          <div className="logo">
            <Scale size={20} />
          </div>
          <div>
            <h1>License Lens</h1>
            <small>依赖许可证兼容性分析</small>
          </div>
        </div>
        <div className="actions">
          <button onClick={reset}>
            <RotateCcw size={14} /> 重置示例
          </button>
          <button className="primary" onClick={exportMarkdown}>
            <FileDown size={14} /> 导出 Markdown
          </button>
        </div>
      </header>

      <section className="summary">
        <div className="metric">
          <small>已分析依赖</small>
          <b>{stats.total}</b>
        </div>
        <div className="metric">
          <small>兼容通过</small>
          <b className="good">{stats.ok}</b>
        </div>
        <div className="metric">
          <small>需要复核</small>
          <b className="warn">{stats.review}</b>
        </div>
        <div className="metric">
          <small>高风险冲突</small>
          <b className="bad">{stats.risk}</b>
        </div>
      </section>

      <section className="grid">
        <aside className="panel">
          <h3>导入依赖清单</h3>
          <textarea
            className="textarea"
            spellCheck={false}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={'每行一个依赖，例如：\nreact@18.3.1 MIT\nlodash@4.17.21 MIT'}
          />
          <button className="primary analyze-btn" onClick={() => analyze(input)}>
            开始分析
          </button>
          <div
            className={dragging ? 'drop dragging' : 'drop'}
            onDragOver={e => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) readFile(file);
            }}
          >
            <FileUp size={16} />
            <span>
              拖放 package.json 或许可证清单，或
              <label htmlFor="file">选择文件</label>
            </span>
            <input
              id="file"
              ref={fileInput}
              type="file"
              accept=".txt,.json,.csv,.lock,.md"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) readFile(file);
                e.target.value = '';
              }}
            />
          </div>
          <p className="hint">
            支持每行一个依赖，格式：<code>名称@版本 许可证</code>。MIT、Apache-2.0、BSD-3-Clause
            判定为兼容；GPL-3.0 判定为高风险；Proprietary 与未识别许可证需复核。
          </p>
          <div className="manual">
            <input
              placeholder="依赖名"
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addManual()}
            />
            <input
              className="version-input"
              placeholder="版本"
              value={manualVersion}
              onChange={e => setManualVersion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addManual()}
            />
            <select value={manualLicense} onChange={e => setManualLicense(e.target.value)}>
              <option>MIT</option>
              <option>Apache-2.0</option>
              <option>BSD-3-Clause</option>
              <option>GPL-3.0</option>
              <option>Proprietary</option>
              <option>Unknown</option>
            </select>
            <button onClick={addManual}>
              <Plus size={14} /> 添加
            </button>
          </div>
          <div className="status">{status}</div>
        </aside>

        <section className="panel">
          <h3>分析结果</h3>
          <div className="filters">
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={filter === f.key ? 'active' : ''}
                onClick={() => setFilter(f.key)}
              >
                {f.label} <span>{f.count}</span>
              </button>
            ))}
            <div className="search">
              <Search size={14} />
              <input
                placeholder="搜索依赖…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="row head">
            <div>依赖</div>
            <div>版本</div>
            <div>许可证</div>
            <div>结论</div>
            <div></div>
          </div>
          <div>
            {filtered.map(e => (
              <div
                key={e.id}
                className={e.id === selectedId ? 'row selected' : 'row'}
                onClick={() => setSelectedId(e.id)}
              >
                <div className="pkg">
                  <div className={`pkgicon ${e.verdict}`}>
                    {e.verdict === 'ok' ? (
                      <ShieldCheck size={15} />
                    ) : e.verdict === 'risk' ? (
                      <AlertOctagon size={15} />
                    ) : (
                      <AlertTriangle size={15} />
                    )}
                  </div>
                  <b>{e.name}</b>
                </div>
                <div className="version">{e.version}</div>
                <div className="license">{e.license}</div>
                <div>
                  <span className={`badge ${e.verdict}`}>{VERDICT_LABEL[e.verdict]}</span>
                </div>
                <div
                  className="inspect"
                  onClick={ev => {
                    ev.stopPropagation();
                    setSelectedId(e.id);
                  }}
                >
                  查看依据
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="empty">没有匹配当前搜索与筛选条件的依赖</div>
            )}
          </div>
          {selected && (
            <div className="details">
              <h4>
                {selected.name}@{selected.version} · {selected.license}
                <span className={`badge ${selected.verdict}`}>{VERDICT_LABEL[selected.verdict]}</span>
              </h4>
              <p>{selected.reason}</p>
              <p>
                分析依据：识别到许可证标识 <code>{selected.license}</code>
                ，对照内置规则（MIT / Apache-2.0 / BSD-3-Clause 兼容，GPL-3.0 高风险，Proprietary
                与未知许可证需复核）给出初步结论。
              </p>
            </div>
          )}
          <div className="notice">
            <b>兼容性提示</b>
            <br />
            GPL-3.0 组件要求衍生作品以 GPL 方式发布；专有许可证通常不能与开源分发直接兼容。请在发布前让法务复核结论。
          </div>
        </section>
      </section>
    </main>
  );
}
