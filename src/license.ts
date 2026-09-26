// 许可证解析与兼容性判定逻辑

export type Verdict = 'pass' | 'review' | 'conflict';

export interface DepEntry {
  id: string;
  name: string;
  version: string;
  license: string; // 归一化后的许可证名；未知时为 'Unknown'
  rawLicense: string; // 用户输入的原始许可证文本
  verdict: Verdict;
  source: 'import' | 'manual';
  basis: string[]; // 判定依据
  addedAt: number;
}

// 兼容通过的许可证（宽松许可，保留声明即可分发）
export const PERMISSIVE = new Set(['MIT', 'Apache-2.0', 'BSD-3-Clause']);

// 高风险冲突许可证（强 Copyleft）
export const CONFLICT = new Set(['GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later']);

// 需人工/法务复核的许可证（专有、弱 Copyleft、其他 OSS 等）
export const REVIEW = new Set([
  'Proprietary',
  'LGPL-2.1',
  'LGPL-3.0',
  'MPL-2.0',
  'GPL-2.0',
  'AGPL-3.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'SSPL-1.0',
  'BUSL-1.1',
  'Unknown',
]);

export const MANUAL_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-3-Clause',
  'GPL-3.0',
  'Proprietary',
  'LGPL-3.0',
  'MPL-2.0',
  'Unknown',
];

/** 把用户可能输入的许可证写法归一化为常见 SPDX 标识。 */
export function normalizeLicense(raw: string): string {
  const key = raw.trim().replace(/\s+/g, ' ');
  if (!key) return 'Unknown';
  const upper = key.toUpperCase();

  const aliases: Record<string, string> = {
    MIT: 'MIT',
    'THE MIT LICENSE': 'MIT',
    'MIT LICENSE': 'MIT',
    APACHE: 'Apache-2.0',
    'APACHE 2': 'Apache-2.0',
    'APACHE 2.0': 'Apache-2.0',
    'APACHE-2': 'Apache-2.0',
    'APACHE LICENSE 2.0': 'Apache-2.0',
    'APACHE SOFTWARE LICENSE': 'Apache-2.0',
    BSD: 'BSD-3-Clause',
    'BSD 3-CLAUSE': 'BSD-3-Clause',
    'BSD-3-CLAUSE': 'BSD-3-Clause',
    'NEW BSD LICENSE': 'BSD-3-Clause',
    'MODIFIED BSD LICENSE': 'BSD-3-Clause',
    'REVISED BSD': 'BSD-3-Clause',
    GPL: 'GPL-3.0',
    'GPL V3': 'GPL-3.0',
    'GPL-3': 'GPL-3.0',
    'GPLV3': 'GPL-3.0',
    'GPL 3.0': 'GPL-3.0',
    'GNU GPL 3.0': 'GPL-3.0',
    'GNU GENERAL PUBLIC LICENSE V3': 'GPL-3.0',
    'GPL-3.0': 'GPL-3.0',
    'GPL-3.0-ONLY': 'GPL-3.0',
    'GPL-3.0-OR-LATER': 'GPL-3.0',
    PROPRIETARY: 'Proprietary',
    'PROPRIETARY LICENSE': 'Proprietary',
    COMMERCIAL: 'Proprietary',
    'ALL RIGHTS RESERVED': 'Proprietary',
    UNKNOWN: 'Unknown',
    '': 'Unknown',
  };

  if (aliases[upper]) return aliases[upper];
  // 对已知 SPDX 标识做大小写不敏感匹配
  const canonical = [...PERMISSIVE, ...CONFLICT, ...REVIEW];
  const hit = canonical.find((c) => c.toUpperCase() === upper);
  if (hit) return hit;
  return key; // 未收录的具体许可证名保留原文，按需复核处理
}

function verdictFor(license: string): { verdict: Verdict; basis: string[] } {
  if (PERMISSIVE.has(license)) {
    return {
      verdict: 'pass',
      basis: [
        `${license} 属于宽松型许可证，保留版权声明与许可证文本即可在闭源/商业产品中分发。`,
        license === 'Apache-2.0'
          ? 'Apache-2.0 附带专利授权条款，需保留 NOTICE 文件；与 MIT / BSD-3-Clause 单向兼容。'
          : '与本项目当前采用的 MIT / Apache-2.0 / BSD-3-Clause 依赖组合兼容，无 Copyleft 传染风险。',
      ],
    };
  }
  if (CONFLICT.has(license)) {
    return {
      verdict: 'conflict',
      basis: [
        'GPL-3.0 是强 Copyleft 许可证：一旦与本项目代码形成基于该程序的衍生作品并对外分发，整个衍生作品都需以 GPL-3.0 兼容条款开源。',
        '与 MIT / Apache-2.0 / BSD-3-Clause 依赖混发时，宽松代码可以被并入 GPL 项目，但反向再以宽松/专有条款分发整体作品会构成冲突。',
        '建议：隔离为独立进程/服务、替换为宽松许可的同类组件，或在分发前取得法务正式意见。',
      ],
    };
  }
  if (license === 'Proprietary') {
    return {
      verdict: 'review',
      basis: [
        '专有许可证的使用、复制与分发范围完全由商业合同/授权协议约束，无法仅凭清单判断合规性。',
        '需要法务核对：授权席位/数量、是否允许再分发、是否禁止逆向工程、有效期与续约条款。',
      ],
    };
  }
  if (license === 'Unknown') {
    return {
      verdict: 'review',
      basis: [
        '清单中缺少可识别的 SPDX 许可证标识，无法自动判定兼容性。',
        '需要从包仓库、源码 LICENSE 文件或供应商处确认实际许可证后，再由法务复核。',
      ],
    };
  }
  return {
    verdict: 'review',
    basis: [
      `${license} 不在“直接兼容”白名单（MIT / Apache-2.0 / BSD-3-Clause）内，可能附带 Copyleft 或其他分发限制。`,
      '请由法务结合实际链接方式（静态/动态）、分发形态与许可证全文给出结论。',
    ],
  };
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `d_${Date.now().toString(36)}_${seq}`;
}

/** 解析单行 `名称@版本 许可证`，也容忍制表符/多空格分隔与无版本写法。 */
function parseLine(line: string): Omit<DepEntry, 'id' | 'verdict' | 'basis' | 'source' | 'addedAt'> | null {
  const text = line.trim();
  if (!text || text.startsWith('#') || text.startsWith('//')) return null;

  // 去掉列表前缀，如 "- react@18.0.0 MIT" / "* react@18.0.0 MIT"
  const cleaned = text.replace(/^[-*]\s+/, '');

  // 包名：普通名称 或 @scope/name（作用域的 @ 后必须有 /）
  const NAME = '(?:@[^\\s@/]+/)?[^\\s@/]+';
  // 名称@版本 与许可证之间用空白分隔
  let m = cleaned.match(new RegExp(`^(${NAME})(?:@([^\\s@]+))?\\s+(.+)$`));
  if (m) {
    const rawLicense = m[3].trim();
    return {
      name: m[1].trim(),
      version: m[2] ?? '—',
      license: normalizeLicense(rawLicense),
      rawLicense,
    };
  }

  // 只有 名称@版本，没有许可证
  m = cleaned.match(new RegExp(`^(${NAME})@([^\\s@]+)$`));
  if (m) {
    return { name: m[1].trim(), version: m[2].trim(), license: 'Unknown', rawLicense: '' };
  }

  // 只有名称
  if (new RegExp(`^${NAME}$`).test(cleaned)) {
    return { name: cleaned, version: '—', license: 'Unknown', rawLicense: '' };
  }

  return null;
}

/** 从粘贴文本/文件内容解析依赖，支持逐行格式与 package.json 风格清单。 */
export function parseManifest(content: string): DepEntry[] {
  const entries: DepEntry[] = [];
  const seen = new Set<string>();

  const push = (name: string, version: string, rawLicense: string) => {
    const n = name.trim();
    // 跳过空名称或不含任何字母/数字的畸形行（@scope/pkg 等正常名称不受影响）
    if (!n || !/[A-Za-z0-9]/.test(n)) return;
    const key = `${n}@${version}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const license = normalizeLicense(rawLicense);
    const { verdict, basis } = verdictFor(license);
    entries.push({
      id: nextId(),
      name: n,
      version: version.trim() || '—',
      license,
      rawLicense: rawLicense.trim(),
      verdict,
      source: 'import',
      basis,
      addedAt: Date.now(),
    });
  };

  // 尝试按 JSON 解析（package.json / package-lock.json / license-checker 输出等）
  const jsonText = content.trim();
  if (jsonText.startsWith('{') || jsonText.startsWith('[')) {
    try {
      const data = JSON.parse(jsonText);
      const visit = (key: string, value: unknown) => {
        if (!value || typeof value !== 'object') return;
        const obj = value as Record<string, unknown>;
        let version = '';
        let license = '';
        if (typeof obj.version === 'string') version = obj.version;
        if (typeof obj.license === 'string') license = obj.license;
        else if (Array.isArray(obj.licenses)) {
          license = obj.licenses
            .map((l: unknown) => (typeof l === 'string' ? l : (l as Record<string, unknown>)?.type))
            .filter(Boolean)
            .join(' OR ');
        }
        const at = key.lastIndexOf('@');
        const name = at > 0 ? key.slice(0, at) : key;
        const ver = at > 0 ? key.slice(at + 1) : version;
        if (name && (license || ver)) push(name, ver, license || '');
      };

      if (Array.isArray(data)) {
        // [{ name, version, licenses/license }]
        data.forEach((item) => {
          if (item && typeof item === 'object') {
            const o = item as Record<string, unknown>;
            if (typeof o.name === 'string') {
              const lic =
                typeof o.license === 'string'
                  ? o.license
                  : Array.isArray(o.licenses)
                    ? o.licenses.map((l: unknown) => (typeof l === 'string' ? l : '')).filter(Boolean).join(' OR ')
                    : '';
              push(o.name, typeof o.version === 'string' ? o.version : '', lic);
            }
          }
        });
      } else if (data.dependencies && typeof data.dependencies === 'object') {
        // package-lock.json v2/v3: 每个依赖带 version/license
        Object.entries(data.dependencies as Record<string, unknown>).forEach(([key, value]) => visit(key, value));
      } else {
        // license-checker / npm-license-check 风格：{ "name@version": { licenses: "MIT" } }
        Object.entries(data as Record<string, unknown>).forEach(([key, value]) => visit(key, value));
      }
      if (entries.length > 0) return entries;
    } catch {
      // 不是合法 JSON，按逐行文本继续解析
    }
  }

  // 逐行解析
  content
    .split(/\r?\n|,/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line) => {
      const parsed = parseLine(line);
      if (parsed) push(parsed.name, parsed.version, parsed.rawLicense);
    });

  return entries;
}

export function createManualEntry(name: string, version: string, rawLicense: string): DepEntry {
  const license = normalizeLicense(rawLicense);
  const { verdict, basis } = verdictFor(license);
  return {
    id: nextId(),
    name: name.trim(),
    version: (version || '—').trim(),
    license,
    rawLicense: rawLicense.trim(),
    verdict,
    source: 'manual',
    basis,
    addedAt: Date.now(),
  };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  pass: '兼容通过',
  review: '需要复核',
  conflict: '高风险冲突',
};

/** 生成覆盖全部条目的 Markdown 报告（忽略当前搜索/筛选）。 */
export function buildMarkdown(entries: DepEntry[]): string {
  const counts = {
    pass: entries.filter((e) => e.verdict === 'pass').length,
    review: entries.filter((e) => e.verdict === 'review').length,
    conflict: entries.filter((e) => e.verdict === 'conflict').length,
  };
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    '# License Lens 许可证分析报告',
    '',
    `生成日期：${today}`,
    '',
    `## 汇总（共 ${entries.length} 条）`,
    '',
    `- 兼容通过：${counts.pass}`,
    `- 需要复核：${counts.review}`,
    `- 高风险冲突：${counts.conflict}`,
    '',
    '判定规则：MIT、Apache-2.0、BSD-3-Clause 视为兼容通过；GPL-3.0 视为高风险冲突；Proprietary 及未知许可证需法务复核。',
    '',
    '## 明细',
    '',
    '| # | 依赖 | 版本 | 许可证 | 结论 | 来源 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...entries.map(
      (e, i) =>
        `| ${i + 1} | ${e.name} | ${e.version} | ${e.license} | ${VERDICT_LABEL[e.verdict]} | ${
          e.source === 'manual' ? '手动补录' : '清单导入'
        } |`,
    ),
  ];
  const conflicts = entries.filter((e) => e.verdict === 'conflict');
  const reviews = entries.filter((e) => e.verdict === 'review');
  if (conflicts.length > 0) {
    lines.push('', '## 高风险冲突依据', '');
    conflicts.forEach((e) => {
      lines.push(`### ${e.name}@${e.version} · ${e.license}`, '');
      e.basis.forEach((b) => lines.push(`- ${b}`));
      lines.push('');
    });
  }
  if (reviews.length > 0) {
    lines.push('## 待复核项', '');
    reviews.forEach((e) => {
      lines.push(`- **${e.name}@${e.version}**（${e.license}）：${e.basis[0]}`);
    });
    lines.push('');
  }
  lines.push('---', '', '> 本报告由 License Lens 依据通用许可证条款自动生成，正式发布前请以法务复核结论为准。');
  return lines.join('\n');
}

export const SEED_TEXT = [
  'react@18.3.1 MIT',
  'react-dom@18.3.1 MIT',
  'lodash@4.17.21 MIT',
  'axios@1.7.2 MIT',
  'zod@3.23.8 MIT',
  'sharp@0.33.4 Apache-2.0',
  'esprima@4.0.1 BSD-3-Clause',
  'legacy-gpl@2.4.0 GPL-3.0',
  'some-proprietary@1.0.0 Proprietary',
  'mystery-lib@0.2.0',
].join('\n');
