#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error(
    'Usage: node render-memory-diagram.mjs <input.json> <output.svg>',
  );
  process.exit(1);
}

const spec = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
const svg = renderDiagram(spec);
const destination = resolve(outputPath);

await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, svg, 'utf8');
console.log(`Rendered ${destination}`);

function renderDiagram(input) {
  assertSpec(input);

  const margin = input.layout?.margin ?? 38;
  const gap = input.layout?.gap ?? 12;
  const memoryPadding = input.layout?.memoryPadding ?? 20;
  const height = input.layout?.height ?? 720;
  const memoryTop = input.layout?.memoryTop ?? 116;
  const memoryBottom = height - (input.layout?.bottomMargin ?? 38);
  const memoryHeight = memoryBottom - memoryTop;
  const columnTop = memoryTop + 94;
  const columnBottom = memoryBottom - 20;
  const columnHeight = columnBottom - columnTop;
  const columnsWidth = input.columns.reduce(
    (total, column) => total + column.width,
    0,
  );
  const width =
    margin * 2 +
    memoryPadding * 2 +
    columnsWidth +
    gap * (input.columns.length - 1);
  const memoryLeft = margin;
  const memoryWidth = width - margin * 2;
  const columnStart = memoryLeft + memoryPadding;
  const columnLayouts = [];
  const nodeLayouts = new Map();

  let nextX = columnStart;
  for (const column of input.columns) {
    const nodes = layoutColumnNodes(column, columnHeight);
    const layout = {
      ...column,
      x: nextX,
      y: columnTop,
      height: columnHeight,
      nodes,
    };
    columnLayouts.push(layout);

    for (const node of nodes) {
      if (nodeLayouts.has(node.id)) {
        throw new Error(`Duplicate node id: ${node.id}`);
      }

      nodeLayouts.set(node.id, {
        ...node,
        columnId: column.id,
        x: nextX + node.x,
        y: columnTop + node.y,
      });
    }

    nextX += column.width + gap;
  }

  const titleId = 'memory-diagram-title';
  const descId = 'memory-diagram-desc';
  const renderedColumns = columnLayouts.map(renderColumn).join('\n');
  const renderedConnectors = input.connectors
    .map((connector) => renderConnector(connector, nodeLayouts))
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descId}">
  <title id="${titleId}">${escapeXml(input.accessibility.title)}</title>
  <desc id="${descId}">${escapeXml(input.accessibility.description)}</desc>
  <defs>
    <marker id="arrow-strong" markerWidth="11" markerHeight="11" refX="9.5" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M 0.5 0.75 L 10 5.5 L 0.5 10.25 z" fill="#1473e6" />
    </marker>
    <marker id="arrow-weak" markerWidth="11" markerHeight="11" refX="9.5" refY="5.5" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M 0.5 0.75 L 10 5.5 L 0.5 10.25 z" fill="#7c3aed" />
    </marker>
    <marker id="arrow-layout" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="userSpaceOnUse">
      <path d="M 0.5 0.75 L 9 5 L 0.5 9.25 z" fill="#94a3b8" />
    </marker>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
      .diagram-title { font-size: 30px; font-weight: 760; fill: #0b1220; letter-spacing: -0.5px; }
      .diagram-subtitle { font-size: 16px; font-weight: 500; fill: #526071; }
      .memory-title { font-size: 22px; font-weight: 760; fill: #111827; }
      .column-title { font-size: 19px; font-weight: 720; fill: #111827; }
      .node-title { font-size: 16px; font-weight: 720; fill: #111827; }
      .node-title.mono, .row-value.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      .row-label { font-size: 14px; font-weight: 600; fill: #64748b; }
      .row-value { font-size: 14px; font-weight: 650; fill: #1f2937; }
      .node-footer { font-size: 13px; font-weight: 560; fill: #64748b; }
      .legend { font-size: 13px; font-weight: 650; fill: #526071; }
      .connector-label { font-size: 13px; font-weight: 720; }
      .strong-text { fill: #1473e6; }
      .weak-text { fill: #7c3aed; }
      .danger-text { fill: #dc2626; }
      .safe-text { fill: #16835b; }
      .muted-text { fill: #94a3b8; }
    </style>
  </defs>

  <rect width="${width}" height="${height}" fill="#ffffff" />
  <text x="${margin}" y="42" class="diagram-title">${escapeXml(input.title)}</text>
  <text x="${margin}" y="70" class="diagram-subtitle">${escapeXml(input.subtitle)}</text>
  ${renderLegend(width - margin - 376, 88)}

  <rect x="${memoryLeft}" y="${memoryTop}" width="${memoryWidth}" height="${memoryHeight}" rx="28" fill="#fcfcfd" stroke="#111827" stroke-width="2" />
  <text x="${width / 2}" y="${memoryTop + 38}" text-anchor="middle" class="memory-title">메모리 개념도</text>

${renderedColumns}

  <g aria-label="참조 관계">
${renderedConnectors}
  </g>
</svg>
`;
}

function renderLegend(x, y) {
  return `<g transform="translate(${x} ${y})" aria-label="화살표 범례">
    <line x1="0" y1="0" x2="34" y2="0" stroke="#1473e6" stroke-width="3" marker-end="url(#arrow-strong)" />
    <text x="43" y="5" class="legend">강한 참조</text>
    <line x1="122" y1="0" x2="156" y2="0" stroke="#7c3aed" stroke-width="3" stroke-dasharray="8 7" marker-end="url(#arrow-weak)" />
    <text x="165" y="5" class="legend">약한 참조</text>
    <line x1="244" y1="0" x2="278" y2="0" stroke="#94a3b8" stroke-width="2.5" stroke-dasharray="2 7" marker-end="url(#arrow-layout)" />
    <text x="287" y="5" class="legend">구조 연결</text>
  </g>`;
}

function layoutColumnNodes(column, columnHeight) {
  const nodes = (column.nodes ?? []).map((node) => ({ ...node }));
  if (nodes.length === 0) {
    return nodes;
  }

  const layout = column.nodeLayout ?? {};
  const vertical =
    layout.vertical ?? (column.type === 'stack' ? 'bottom-up' : 'center');
  const gap = layout.gap ?? 24;
  const paddingTop = layout.paddingTop ?? 20;
  const paddingBottom = layout.paddingBottom ?? 20;

  if (vertical === 'manual') {
    for (const node of nodes) {
      if (!Number.isFinite(node.y)) {
        throw new Error(
          `Manual column layout requires node.y: ${column.id}.${node.id}`,
        );
      }
    }
    return nodes;
  }

  const totalHeight =
    nodes.reduce((total, node) => total + node.height, 0) +
    gap * (nodes.length - 1);
  const availableHeight = columnHeight - paddingTop - paddingBottom;

  if (totalHeight > availableHeight) {
    throw new Error(
      `Nodes do not fit in column ${column.id}: ${totalHeight} > ${availableHeight}`,
    );
  }

  if (vertical === 'bottom-up') {
    let cursor = columnHeight - paddingBottom;
    return nodes.map((node) => {
      const positioned = { ...node, y: cursor - node.height };
      cursor = positioned.y - gap;
      return positioned;
    });
  }

  let cursor;
  if (vertical === 'top') {
    cursor = paddingTop;
  } else if (vertical === 'center') {
    cursor = (columnHeight - totalHeight) / 2;
  } else {
    throw new Error(`Unknown vertical column layout: ${vertical}`);
  }

  return nodes.map((node) => {
    const positioned = { ...node, y: cursor };
    cursor += node.height + gap;
    return positioned;
  });
}

function renderColumn(column) {
  const fillByType = {
    code: '#eef1f4',
    data: '#f7f8fa',
    heap: '#ffffff',
    stack: '#f8fafc',
  };
  const fill = column.fill ?? fillByType[column.type] ?? '#ffffff';
  const nodes = (column.nodes ?? [])
    .map((node) =>
      renderNode({
        ...node,
        x: column.x + node.x,
        y: column.y + node.y,
      }),
    )
    .join('\n');

  return `  <g id="column-${escapeXml(column.id)}" aria-label="${escapeXml(column.title)}">
    <text x="${column.x + column.width / 2}" y="${column.y - 19}" text-anchor="middle" class="column-title">${escapeXml(column.title)}</text>
    <rect x="${column.x}" y="${column.y}" width="${column.width}" height="${column.height}" rx="18" fill="${fill}" stroke="#b8c0cc" stroke-width="1.5" />
${nodes}
  </g>`;
}

function renderNode(node) {
  const styles = {
    object: {
      fill: '#ffffff',
      stroke: '#111827',
      accent: '#1473e6',
      dash: '',
    },
    closure: {
      fill: '#faf7ff',
      stroke: '#6d28d9',
      accent: '#7c3aed',
      dash: '',
    },
    frame: {
      fill: '#ffffff',
      stroke: '#64748b',
      accent: '#64748b',
      dash: '',
    },
    code: {
      fill: '#f8fafc',
      stroke: '#64748b',
      accent: '#475569',
      dash: '7 6',
    },
    data: {
      fill: '#ffffff',
      stroke: '#94a3b8',
      accent: '#64748b',
      dash: '',
    },
    note: {
      fill: '#fff9ed',
      stroke: '#e5a33b',
      accent: '#e5a33b',
      dash: '',
    },
    released: {
      fill: '#f8fafc',
      stroke: '#94a3b8',
      accent: '#94a3b8',
      dash: '7 6',
    },
  };
  const style = styles[node.kind] ?? styles.object;
  const titleClass = node.monospaceTitle ? 'node-title mono' : 'node-title';
  const titleY = node.y + 29;
  const headerBottom = node.y + 47;
  const tag = node.tag
    ? renderTag(
        node.x + node.width - 14,
        node.y + 13,
        node.tag,
        node.tagTone ?? 'muted',
      )
    : '';
  const rows = (node.rows ?? [])
    .map((row, index) => renderRow(node, row, index))
    .join('\n');
  const footer = node.footer
    ? `<text x="${node.x + 15}" y="${node.y + node.height - 14}" class="node-footer">${escapeXml(node.footer)}</text>`
    : '';
  const opacity = node.kind === 'released' ? ' opacity="0.76"' : '';
  const radius = 13;
  const outlinePath = [
    `M ${node.x + radius} ${node.y}`,
    `H ${node.x + node.width - radius}`,
    `Q ${node.x + node.width} ${node.y} ${node.x + node.width} ${node.y + radius}`,
    `V ${node.y + node.height - radius}`,
    `Q ${node.x + node.width} ${node.y + node.height} ${node.x + node.width - radius} ${node.y + node.height}`,
    `H ${node.x + radius}`,
  ].join(' ');
  const accentPath = [
    `M ${node.x + radius} ${node.y}`,
    `Q ${node.x} ${node.y} ${node.x} ${node.y + radius}`,
    `V ${node.y + node.height - radius}`,
    `Q ${node.x} ${node.y + node.height} ${node.x + radius} ${node.y + node.height}`,
  ].join(' ');

  return `    <g id="node-${escapeXml(node.id)}"${opacity}>
      <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${radius}" fill="${style.fill}" />
      <path d="${outlinePath}" fill="none" stroke="${style.stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"${style.dash ? ` stroke-dasharray="${style.dash}"` : ''} />
      <path d="${accentPath}" fill="none" stroke="${style.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      <text x="${node.x + 15}" y="${titleY}" class="${titleClass}">${escapeXml(node.title)}</text>
      ${tag}
      ${(node.rows ?? []).length ? `<line x1="${node.x + 14}" y1="${headerBottom}" x2="${node.x + node.width - 14}" y2="${headerBottom}" stroke="#e2e8f0" />` : ''}
${rows}
      ${footer}
    </g>`;
}

function renderRow(node, row, index) {
  const y = node.y + 75 + index * 34;
  const valueClass = `row-value${row.monospace ? ' mono' : ''} ${toneClass(row.tone)}`;

  return `      <text x="${node.x + 16}" y="${y}" class="row-label">${escapeXml(row.label)}</text>
      <text x="${node.x + node.width - 16}" y="${y}" text-anchor="end" class="${valueClass.trim()}">${escapeXml(row.value)}</text>`;
}

function renderTag(right, top, text, tone) {
  const palette = {
    danger: ['#fee2e2', '#dc2626'],
    safe: ['#dcfce7', '#16835b'],
    strong: ['#dbeafe', '#1473e6'],
    weak: ['#ede9fe', '#7c3aed'],
    muted: ['#e2e8f0', '#475569'],
  };
  const [fill, color] = palette[tone] ?? palette.muted;
  const tagWidth = Math.max(46, Array.from(String(text)).length * 8.5 + 20);
  const x = right - tagWidth;

  return `<g>
        <rect x="${x}" y="${top}" width="${tagWidth}" height="24" rx="12" fill="${fill}" />
        <text x="${x + tagWidth / 2}" y="${top + 17}" text-anchor="middle" style="font-size: 12px; font-weight: 760; fill: ${color};">${escapeXml(text)}</text>
      </g>`;
}

function renderConnector(connector, nodeLayouts) {
  const fromNode = nodeLayouts.get(connector.from.id);
  const toNode = nodeLayouts.get(connector.to.id);
  if (!fromNode || !toNode) {
    throw new Error(
      `Unknown connector node: ${connector.from.id} -> ${connector.to.id}`,
    );
  }

  const start = anchorPoint(fromNode, connector.from);
  const end = anchorPoint(toNode, connector.to);
  const curve = connector.curve ?? [0, 0, 0, 0];
  const control1 = { x: start.x + curve[0], y: start.y + curve[1] };
  const control2 = { x: end.x + curve[2], y: end.y + curve[3] };
  const path = curve.some((value) => value !== 0)
    ? `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`
    : `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const styleByKind = {
    strong: {
      color: '#1473e6',
      width: 3,
      dash: '',
      marker: 'url(#arrow-strong)',
      textClass: 'strong-text',
    },
    weak: {
      color: '#7c3aed',
      width: 3,
      dash: '9 8',
      marker: 'url(#arrow-weak)',
      textClass: 'weak-text',
    },
    layout: {
      color: '#94a3b8',
      width: 2.5,
      dash: '2 7',
      marker: 'url(#arrow-layout)',
      textClass: 'muted-text',
    },
    released: {
      color: '#94a3b8',
      width: 2.5,
      dash: '8 7',
      marker: '',
      textClass: 'muted-text',
    },
  };
  const style = styleByKind[connector.kind] ?? styleByKind.strong;
  const labelPosition = cubicPoint(
    start,
    control1,
    control2,
    end,
    connector.labelPosition ?? 0.5,
  );
  const labelOffset = connector.labelOffset ?? [0, -12];
  const labelX = labelPosition.x + labelOffset[0];
  const labelY = labelPosition.y + labelOffset[1];
  const label = connector.label
    ? `<g>
        <rect x="${labelX - labelWidth(connector.label) / 2}" y="${labelY - 16}" width="${labelWidth(connector.label)}" height="23" rx="11.5" fill="#ffffff" stroke="#e2e8f0" />
        <text x="${labelX}" y="${labelY}" text-anchor="middle" class="connector-label ${style.textClass}">${escapeXml(connector.label)}</text>
      </g>`
    : '';

  return `    <g>
      <path d="${path}" fill="none" stroke="${style.color}" stroke-width="${style.width}" stroke-linecap="round"${style.dash ? ` stroke-dasharray="${style.dash}"` : ''}${style.marker ? ` marker-end="${style.marker}"` : ''} />
      ${label}
    </g>`;
}

function anchorPoint(node, anchor) {
  const side = anchor.side ?? 'right';
  const offset =
    anchor.offset ??
    (side === 'left' || side === 'right' ? node.height / 2 : node.width / 2);

  switch (side) {
    case 'left':
      return { x: node.x, y: node.y + offset };
    case 'right':
      return { x: node.x + node.width, y: node.y + offset };
    case 'top':
      return { x: node.x + offset, y: node.y };
    case 'bottom':
      return { x: node.x + offset, y: node.y + node.height };
    default:
      throw new Error(`Unknown anchor side: ${side}`);
  }
}

function cubicPoint(start, control1, control2, end, t) {
  const inverse = 1 - t;
  return {
    x:
      inverse ** 3 * start.x +
      3 * inverse ** 2 * t * control1.x +
      3 * inverse * t ** 2 * control2.x +
      t ** 3 * end.x,
    y:
      inverse ** 3 * start.y +
      3 * inverse ** 2 * t * control1.y +
      3 * inverse * t ** 2 * control2.y +
      t ** 3 * end.y,
  };
}

function toneClass(tone) {
  return (
    {
      strong: 'strong-text',
      weak: 'weak-text',
      danger: 'danger-text',
      safe: 'safe-text',
      muted: 'muted-text',
    }[tone] ?? ''
  );
}

function labelWidth(text) {
  return Math.max(64, Array.from(String(text)).length * 8.5 + 22);
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function assertSpec(input) {
  if (!input.title || !input.subtitle) {
    throw new Error('The spec requires title and subtitle.');
  }
  if (!input.accessibility?.title || !input.accessibility?.description) {
    throw new Error('The spec requires accessibility.title and description.');
  }
  if (!Array.isArray(input.columns) || input.columns.length === 0) {
    throw new Error('The spec requires at least one column.');
  }
  if (!Array.isArray(input.connectors)) {
    throw new Error('The spec requires a connectors array.');
  }
  for (const column of input.columns) {
    if (!column.id || !column.title || !column.type || !column.width) {
      throw new Error('Every column requires id, title, type, and width.');
    }
    for (const node of column.nodes ?? []) {
      if (!node.id || !node.kind || !node.width || !node.height) {
        throw new Error(
          `Every node requires id, kind, width, and height: ${column.id}`,
        );
      }
    }
  }
}
